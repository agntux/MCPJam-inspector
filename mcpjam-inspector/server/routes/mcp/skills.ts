import { Hono, type Context } from "hono";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "node:url";
import os from "os";
import "../../types/hono"; // Type extensions
import { logger } from "../../utils/logger";
import {
  parseSkillFile,
  skillToListItem,
  isValidSkillName,
  generateSkillFileContent,
  listFilesRecursive,
  getMimeType,
  isTextMimeType,
  isPathWithinDirectory,
} from "../../utils/skill-parser";
import type {
  Skill,
  SkillListItem,
  SkillFileContent,
} from "../../../shared/skill-types";

const skills = new Hono();

/**
 * Get all skills directories as absolute paths
 *
 * Skills can come from:
 * 1. Global user skills: ~/.mcpjam/skills/ and ~/.agents/skills/
 * 2. Project-local skills: .mcpjam/skills/ and .agents/skills/ (relative to cwd)
 *
 * Order matters - first writable directory is used for uploads
 */
function getSkillsDirs(): string[] {
  const homeDir = os.homedir();
  const cwd = process.cwd();

  return [
    // Global skills (always accessible regardless of how app is launched)
    path.join(homeDir, ".claude", "skills"), // Claude Desktop global skills
    path.join(homeDir, ".mcpjam", "skills"), // MCPJam global skills
    path.join(homeDir, ".agents", "skills"), // npx skills global installs

    // Project-local skills (when launched from project directory)
    path.join(cwd, ".claude", "skills"), // Claude Desktop project skills
    path.join(cwd, ".mcpjam", "skills"),
    path.join(cwd, ".agents", "skills"),
  ];
}

/**
 * Get the primary skills directory (for uploads)
 * Uses global ~/.mcpjam/skills/ so skills are always accessible
 */
function getPrimarySkillsDir(): string {
  return path.join(os.homedir(), ".mcpjam", "skills");
}

/**
 * Format skill path for display - use ~ for home directory paths
 */
function formatDisplayPath(fullPath: string): string {
  const homeDir = os.homedir();
  if (fullPath.startsWith(homeDir)) {
    return fullPath.replace(homeDir, "~");
  }
  return path.relative(process.cwd(), fullPath);
}

/**
 * Check if a directory exists
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Find the directory path for a skill by name
 * Returns the full path to the skill directory, or null if not found
 */
async function findSkillDirectory(name: string): Promise<string | null> {
  const skillsDirs = getSkillsDirs();

  for (const skillsDir of skillsDirs) {
    if (!(await directoryExists(skillsDir))) {
      continue;
    }

    const entries = await fs.readdir(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = path.join(skillsDir, entry.name);
      const skillFilePath = path.join(skillDir, "SKILL.md");

      try {
        const fileContent = await fs.readFile(skillFilePath, "utf-8");
        const skill = parseSkillFile(fileContent, entry.name);

        if (skill && skill.name === name) {
          return skillDir;
        }
      } catch {
        // Continue searching
      }
    }
  }

  return null;
}

/**
 * List all skills from all skills directories
 */
skills.post("/list", async (c) => {
  try {
    const skillsDirs = getSkillsDirs();
    const skillsList: SkillListItem[] = [];
    const seenNames = new Set<string>(); // Prevent duplicates by name

    for (const skillsDir of skillsDirs) {
      // Check if this skills directory exists
      if (!(await directoryExists(skillsDir))) {
        continue;
      }

      const entries = await fs.readdir(skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillPath = entry.name;
        const skillFilePath = path.join(skillsDir, skillPath, "SKILL.md");

        try {
          const fileContent = await fs.readFile(skillFilePath, "utf-8");
          const displayPath = formatDisplayPath(
            path.join(skillsDir, skillPath),
          );
          const skill = parseSkillFile(fileContent, displayPath);

          if (skill && !seenNames.has(skill.name)) {
            seenNames.add(skill.name);
            skillsList.push(skillToListItem(skill));
          }
        } catch (error) {
          // Skill directory exists but no valid SKILL.md, skip it
          logger.debug(
            `Skipping skill directory ${skillPath}: no valid SKILL.md`,
          );
        }
      }
    }

    return c.json({ skills: skillsList });
  } catch (error) {
    logger.error("Error listing skills", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * Get full skill content by name
 */
skills.post("/get", async (c) => {
  try {
    const { name } = (await c.req.json()) as { name?: string };

    if (!name) {
      return c.json({ success: false, error: "name is required" }, 400);
    }

    const skillsDirs = getSkillsDirs();

    // Search through all skills directories
    for (const skillsDir of skillsDirs) {
      // Check if this skills directory exists
      if (!(await directoryExists(skillsDir))) {
        continue;
      }

      const entries = await fs.readdir(skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillPath = entry.name;
        const skillFilePath = path.join(skillsDir, skillPath, "SKILL.md");

        try {
          const fileContent = await fs.readFile(skillFilePath, "utf-8");
          const displayPath = formatDisplayPath(
            path.join(skillsDir, skillPath),
          );
          const skill = parseSkillFile(fileContent, displayPath);

          if (skill && skill.name === name) {
            return c.json({ skill });
          }
        } catch {
          // Continue searching
        }
      }
    }

    return c.json({ success: false, error: `Skill '${name}' not found` }, 404);
  } catch (error) {
    logger.error("Error getting skill", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * Upload/create a new skill
 */
skills.post("/upload", async (c) => {
  try {
    const { name, description, content } = (await c.req.json()) as {
      name?: string;
      description?: string;
      content?: string;
    };

    if (!name) {
      return c.json({ success: false, error: "name is required" }, 400);
    }

    if (!description) {
      return c.json({ success: false, error: "description is required" }, 400);
    }

    if (!content) {
      return c.json({ success: false, error: "content is required" }, 400);
    }

    // Validate name format
    if (!isValidSkillName(name)) {
      return c.json(
        {
          success: false,
          error:
            "name must contain only lowercase letters, numbers, and hyphens",
        },
        400,
      );
    }

    // Check if skill already exists in any directory
    const skillsDirs = getSkillsDirs();
    for (const dir of skillsDirs) {
      if (await directoryExists(dir)) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const skillFilePath = path.join(dir, entry.name, "SKILL.md");
          try {
            const fileContent = await fs.readFile(skillFilePath, "utf-8");
            const existingSkill = parseSkillFile(fileContent, entry.name);
            if (existingSkill && existingSkill.name === name) {
              return c.json(
                { success: false, error: `Skill '${name}' already exists` },
                409,
              );
            }
          } catch {
            // Continue
          }
        }
      }
    }

    // Use primary skills directory for new uploads
    const skillsDir = getPrimarySkillsDir();
    const skillDir = path.join(skillsDir, name);
    const skillFilePath = path.join(skillDir, "SKILL.md");

    // Create skills directory if it doesn't exist
    await fs.mkdir(skillsDir, { recursive: true });

    // Create skill directory
    await fs.mkdir(skillDir, { recursive: true });

    // Generate and write SKILL.md content
    const fileContent = generateSkillFileContent(name, description, content);
    await fs.writeFile(skillFilePath, fileContent, "utf-8");

    const skill: Skill = {
      name,
      description,
      content,
      path: `~/.mcpjam/skills/${name}`,
    };

    return c.json({ success: true, skill });
  } catch (error) {
    logger.error("Error uploading skill", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * Upload a skill folder with multiple files (multipart/form-data)
 */
skills.post("/upload-folder", async (c) => {
  try {
    const formData = await c.req.formData();
    const skillName = formData.get("skillName") as string | null;
    const files = formData.getAll("files") as File[];

    if (!skillName) {
      return c.json({ success: false, error: "skillName is required" }, 400);
    }

    if (!files || files.length === 0) {
      return c.json({ success: false, error: "No files uploaded" }, 400);
    }

    // Validate skill name format
    if (!isValidSkillName(skillName)) {
      return c.json(
        {
          success: false,
          error:
            "Skill name must contain only lowercase letters, numbers, and hyphens",
        },
        400,
      );
    }

    // Find SKILL.md file
    const skillMdFile = files.find(
      (f) => f.name === "SKILL.md" || f.name.endsWith("/SKILL.md"),
    );

    if (!skillMdFile) {
      return c.json(
        { success: false, error: "No SKILL.md file found in uploaded files" },
        400,
      );
    }

    // Parse and validate SKILL.md
    const skillMdContent = await skillMdFile.text();
    const parsedSkill = parseSkillFile(skillMdContent, skillName);

    if (!parsedSkill) {
      return c.json(
        {
          success: false,
          error:
            "Invalid SKILL.md format. Must contain valid frontmatter with 'name' and 'description' fields.",
        },
        400,
      );
    }

    // Verify the name in SKILL.md matches the provided skillName
    if (parsedSkill.name !== skillName) {
      return c.json(
        {
          success: false,
          error: `Skill name mismatch: provided "${skillName}" but SKILL.md contains "${parsedSkill.name}"`,
        },
        400,
      );
    }

    // Check if skill already exists in any directory
    const skillsDirs = getSkillsDirs();
    for (const dir of skillsDirs) {
      if (await directoryExists(dir)) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const skillFilePath = path.join(dir, entry.name, "SKILL.md");
          try {
            const fileContent = await fs.readFile(skillFilePath, "utf-8");
            const existingSkill = parseSkillFile(fileContent, entry.name);
            if (existingSkill && existingSkill.name === skillName) {
              return c.json(
                {
                  success: false,
                  error: `Skill '${skillName}' already exists`,
                },
                409,
              );
            }
          } catch {
            // Continue
          }
        }
      }
    }

    // Use primary skills directory for new uploads
    const skillsDir = getPrimarySkillsDir();
    const skillDir = path.join(skillsDir, skillName);

    // Create skills directory if it doesn't exist
    await fs.mkdir(skillsDir, { recursive: true });

    // Create skill directory
    await fs.mkdir(skillDir, { recursive: true });

    // Write all files
    for (const file of files) {
      const fileName = file.name;

      // Security: Validate path doesn't try to escape skill directory
      if (!isPathWithinDirectory(skillDir, fileName)) {
        logger.warn(`Skipping file with invalid path: ${fileName}`);
        continue;
      }

      const filePath = path.join(skillDir, fileName);
      const fileDir = path.dirname(filePath);

      // Create subdirectories if needed
      await fs.mkdir(fileDir, { recursive: true });

      // Write file content
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, buffer);
    }

    const skill: Skill = {
      name: parsedSkill.name,
      description: parsedSkill.description,
      content: parsedSkill.content,
      path: `~/.mcpjam/skills/${skillName}`,
    };

    return c.json({ success: true, skill });
  } catch (error) {
    logger.error("Error uploading skill folder", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * Delete a skill by name
 */
skills.post("/delete", async (c) => {
  try {
    const { name } = (await c.req.json()) as { name?: string };

    if (!name) {
      return c.json({ success: false, error: "name is required" }, 400);
    }

    const skillsDirs = getSkillsDirs();

    // Search through all skills directories
    for (const skillsDir of skillsDirs) {
      // Check if this skills directory exists
      if (!(await directoryExists(skillsDir))) {
        continue;
      }

      const entries = await fs.readdir(skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillPath = entry.name;
        const skillFilePath = path.join(skillsDir, skillPath, "SKILL.md");

        try {
          const fileContent = await fs.readFile(skillFilePath, "utf-8");
          const skill = parseSkillFile(fileContent, skillPath);

          if (skill && skill.name === name) {
            // Delete the skill directory and its contents
            const skillDir = path.join(skillsDir, skillPath);
            await fs.rm(skillDir, { recursive: true, force: true });
            return c.json({ success: true });
          }
        } catch {
          // Continue searching
        }
      }
    }

    return c.json({ success: false, error: `Skill '${name}' not found` }, 404);
  } catch (error) {
    logger.error("Error deleting skill", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * List all files in a skill directory
 */
skills.post("/files", async (c) => {
  try {
    const { name } = (await c.req.json()) as { name?: string };

    if (!name) {
      return c.json({ success: false, error: "name is required" }, 400);
    }

    const skillDir = await findSkillDirectory(name);
    if (!skillDir) {
      return c.json(
        { success: false, error: `Skill '${name}' not found` },
        404,
      );
    }

    const files = await listFilesRecursive(skillDir);
    return c.json({ files });
  } catch (error) {
    logger.error("Error listing skill files", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * Read a specific file from a skill directory
 */
skills.post("/read-file", async (c) => {
  try {
    const { name, filePath } = (await c.req.json()) as {
      name?: string;
      filePath?: string;
    };

    if (!name) {
      return c.json({ success: false, error: "name is required" }, 400);
    }

    if (!filePath) {
      return c.json({ success: false, error: "filePath is required" }, 400);
    }

    const skillDir = await findSkillDirectory(name);
    if (!skillDir) {
      return c.json(
        { success: false, error: `Skill '${name}' not found` },
        404,
      );
    }

    // Security: Validate path doesn't escape skill directory
    if (!isPathWithinDirectory(skillDir, filePath)) {
      return c.json({ success: false, error: "Invalid file path" }, 400);
    }

    const fullPath = path.join(skillDir, filePath);

    // Check if file exists
    try {
      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) {
        return c.json({ success: false, error: "Path is not a file" }, 400);
      }

      const mimeType = getMimeType(filePath);
      const isText = isTextMimeType(mimeType);
      const fileName = path.basename(filePath);

      const fileContent: SkillFileContent = {
        path: filePath,
        name: fileName,
        mimeType,
        size: stat.size,
        isText,
      };

      // Limit file size to 1MB for text, 5MB for binary
      const maxSize = isText ? 1024 * 1024 : 5 * 1024 * 1024;
      if (stat.size > maxSize) {
        return c.json(
          {
            success: false,
            error: `File too large (${(stat.size / 1024 / 1024).toFixed(2)}MB). Maximum is ${maxSize / 1024 / 1024}MB`,
          },
          400,
        );
      }

      if (isText) {
        fileContent.content = await fs.readFile(fullPath, "utf-8");
      } else {
        const buffer = await fs.readFile(fullPath);
        fileContent.base64 = buffer.toString("base64");
      }

      return c.json({ file: fileContent });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return c.json({ success: false, error: "File not found" }, 404);
      }
      throw err;
    }
  } catch (error) {
    logger.error("Error reading skill file", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// AgntUX START
/**
 * Install a skill from a remote URL (fetches SKILL.md content server-side).
 *
 * Supports two URL formats:
 *   - *.md            → existing path: parse + install as a single-skill
 *   - *.tar.gz/*.zip  → new path: extract plugin tarball, flatten subagents,
 *                       queue stdio MCP servers, return plugin metadata
 */
skills.post("/install-from-url", async (c) => {
  try {
    const { url } = (await c.req.json()) as { url?: string };

    if (!url) {
      return c.json({ success: false, error: "url is required" }, 400);
    }

    // Validate URL format (must be HTTPS)
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return c.json({ success: false, error: "Invalid URL format" }, 400);
    }

    if (parsedUrl.protocol !== "https:") {
      return c.json(
        { success: false, error: "URL must use HTTPS protocol" },
        400,
      );
    }

    // Detect if this is a plugin tarball (.tar.gz or .zip) by extension or content-type
    if (isTarballOrZipUrl(parsedUrl)) {
      return installPluginFromTarball(c, url, parsedUrl);
    }

    // --- Existing SKILL.md path ---

    // Fetch SKILL.md content from the remote URL
    let skillMdContent: string;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return c.json(
          {
            success: false,
            error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
          },
          502,
        );
      }
      // Check content-type for tarball sniff even when extension is missing
      const ct = response.headers.get("content-type") ?? "";
      if (isTarballContentType(ct)) {
        // Re-fetch as tarball (content already consumed; reconstruct with a new request)
        return installPluginFromTarball(c, url, parsedUrl);
      }
      skillMdContent = await response.text();
    } catch (fetchError) {
      return c.json(
        {
          success: false,
          error:
            fetchError instanceof Error
              ? `Failed to fetch URL: ${fetchError.message}`
              : "Failed to fetch URL",
        },
        502,
      );
    }

    // Parse the SKILL.md content
    const parsedSkill = parseSkillFile(skillMdContent, "remote");
    if (!parsedSkill) {
      return c.json(
        {
          success: false,
          error:
            "Invalid SKILL.md format. Must contain valid frontmatter with 'name' and 'description' fields.",
        },
        400,
      );
    }

    const { name, description, content } = parsedSkill;

    // Check for duplicates across all skills directories
    const skillsDirs = getSkillsDirs();
    for (const dir of skillsDirs) {
      if (await directoryExists(dir)) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const skillFilePath = path.join(dir, entry.name, "SKILL.md");
          try {
            const fileContent = await fs.readFile(skillFilePath, "utf-8");
            const existingSkill = parseSkillFile(fileContent, entry.name);
            if (existingSkill && existingSkill.name === name) {
              const skill: Skill = {
                name: existingSkill.name,
                description: existingSkill.description,
                content: existingSkill.content,
                path: formatDisplayPath(path.join(dir, entry.name)),
              };
              return c.json(
                {
                  success: false,
                  error: `Skill '${name}' already exists`,
                  skill,
                },
                409,
              );
            }
          } catch {
            // Continue
          }
        }
      }
    }

    // Write raw SKILL.md to primary skills directory
    const skillsDir = getPrimarySkillsDir();
    const skillDir = path.join(skillsDir, name);
    const skillFilePath = path.join(skillDir, "SKILL.md");

    await fs.mkdir(skillsDir, { recursive: true });
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(skillFilePath, skillMdContent, "utf-8");

    const skill: Skill = {
      name,
      description,
      content,
      path: `~/.mcpjam/skills/${name}`,
    };

    return c.json({ success: true, skill });
  } catch (error) {
    logger.error("Error installing skill from URL", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// ─── Plugin tarball helpers ───────────────────────────────────────────────────

/**
 * Returns true when the URL pathname ends with a tarball/zip extension.
 */
function isTarballOrZipUrl(parsedUrl: URL): boolean {
  const p = parsedUrl.pathname.toLowerCase();
  return p.endsWith(".tar.gz") || p.endsWith(".tgz") || p.endsWith(".zip");
}

/**
 * Returns true when a Content-Type header indicates a tarball or zip stream.
 */
function isTarballContentType(ct: string): boolean {
  return (
    ct.includes("application/gzip") ||
    ct.includes("application/x-gzip") ||
    ct.includes("application/x-tar") ||
    ct.includes("application/zip") ||
    ct.includes("application/x-zip")
  );
}

/**
 * Get the plugins extraction directory: ~/.mcpjam/plugins/{slug}/
 * Safe path join — slug is validated before use.
 */
function getPluginsDir(slug: string): string {
  return path.join(os.homedir(), ".mcpjam", "plugins", slug);
}

/**
 * Interface for a single MCP server entry in .mcp.json.
 */
interface McpServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * Interface for the plugin.json manifest.
 */
interface PluginManifest {
  slug?: string;
  name?: string;
  version?: string;
  description?: string;
}

/**
 * Result returned by /install-from-url for a plugin tarball.
 */
interface PluginInstallResult {
  slug: string;
  version: string;
  skillName: string;
  mcpServers: McpServerEntry[];
}

/**
 * Download, extract, parse, and flatten a plugin tarball or zip.
 */
async function installPluginFromTarball(
  c: Context,
  url: string,
  parsedUrl: URL,
): Promise<Response> {
  // Dynamically import to keep top-level imports clean
  const tar = await import("tar");

  // 1. Download the archive
  let archiveBuffer: Buffer;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return c.json(
        {
          success: false,
          error: `Failed to fetch plugin: ${response.status} ${response.statusText}`,
        },
        502,
      );
    }
    archiveBuffer = Buffer.from(await response.arrayBuffer());
  } catch (fetchError) {
    return c.json(
      {
        success: false,
        error:
          fetchError instanceof Error
            ? `Failed to fetch plugin: ${fetchError.message}`
            : "Failed to fetch plugin",
      },
      502,
    );
  }

  // 2. Determine archive type and derive a preliminary slug from the URL filename
  const urlPathname = parsedUrl.pathname.toLowerCase();
  const isZip = urlPathname.endsWith(".zip");

  // 3. Extract to a temporary directory first, then re-home under the real slug
  const tmpDir = path.join(os.tmpdir(), `mcpjam-plugin-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    if (isZip) {
      await extractZipBuffer(archiveBuffer, tmpDir);
    } else {
      // .tar.gz / .tgz — write to temp file then extract
      const tmpTar = path.join(os.tmpdir(), `mcpjam-plugin-${Date.now()}.tar.gz`);
      await fs.writeFile(tmpTar, archiveBuffer);
      try {
        await tar.extract({ file: tmpTar, cwd: tmpDir, strict: false });
      } finally {
        await fs.rm(tmpTar, { force: true });
      }
    }

    // 4. Locate the content root (may be wrapped in a single top-level directory)
    const contentRoot = await findArchiveContentRoot(tmpDir);

    // 5. Read plugin.json for slug + version
    const manifest = await readPluginManifest(contentRoot);
    const slug = manifest.slug ?? manifest.name ?? deriveSlugFromUrl(parsedUrl);
    const version = manifest.version ?? "0.0.0";

    // Validate slug is safe for use as a directory name
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return c.json(
        {
          success: false,
          error: `Plugin slug '${slug}' must contain only lowercase letters, numbers, and hyphens`,
        },
        400,
      );
    }

    // 6. Move to final location: ~/.mcpjam/plugins/{slug}/
    const pluginDir = getPluginsDir(slug);
    await fs.rm(pluginDir, { recursive: true, force: true });
    await fs.mkdir(path.dirname(pluginDir), { recursive: true });

    // Copy content root to plugin dir (fs.rename across devices fails, so use copy)
    await copyDirRecursive(contentRoot, pluginDir);

    // 7. Read agents/*.md (sorted alphabetically for deterministic ordering)
    const agentFiles = await readAgentFiles(pluginDir);

    // 8. Read SKILL.md (root or skills/{slug}/SKILL.md)
    const skillMdContent = await readPluginSkillMd(pluginDir, slug);
    if (!skillMdContent) {
      return c.json(
        { success: false, error: "Plugin tarball does not contain a SKILL.md" },
        400,
      );
    }

    // 9. Flatten SKILL.md + agents/*.md into one combined skill
    const { flattenSkill } = await importFlattenSkill();
    const flattenedContent = flattenSkill(skillMdContent, agentFiles);

    // 10. Parse flattened skill for name/description
    const parsedSkill = parseSkillFile(flattenedContent, slug);
    const skillName = parsedSkill?.name ?? slug;

    // 11. Write flattened skill to ~/.mcpjam/skills/{slug}/SKILL.md
    const skillsDir = getPrimarySkillsDir();
    const skillDir = path.join(skillsDir, slug);
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), flattenedContent, "utf-8");

    // 12. Read .mcp.json and queue local stdio MCP servers
    const mcpServers = await readMcpServers(pluginDir);

    const result: PluginInstallResult = {
      slug,
      version,
      skillName,
      mcpServers,
    };

    logger.info(`Plugin '${slug}' v${version} installed from ${url}`);
    return c.json({ success: true, plugin: result });
  } finally {
    // Always clean up tmp dir
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Extract a zip buffer to a target directory with zip-slip protection.
 */
async function extractZipBuffer(buffer: Buffer, targetDir: string): Promise<void> {
  const fflate = await import("fflate");
  const resolvedTarget = path.resolve(targetDir);

  return new Promise((resolve, reject) => {
    fflate.unzip(new Uint8Array(buffer), (err, unzipped) => {
      if (err) {
        const msg = err instanceof Error ? err.message : String(err);
        reject(new Error(`Zip extraction failed: ${msg}`));
        return;
      }

      const writePromises: Promise<void>[] = [];

      for (const [relativePath, data] of Object.entries(unzipped)) {
        // Zip-slip protection: ensure extracted path stays within targetDir
        const fullPath = path.resolve(targetDir, relativePath);
        if (!fullPath.startsWith(resolvedTarget + path.sep) && fullPath !== resolvedTarget) {
          // Skip path traversal attempts silently
          logger.warn(`Skipping zip entry with path traversal: ${relativePath}`);
          continue;
        }

        if (relativePath.endsWith("/")) {
          // Directory entry — void the return value (mkdir returns string|undefined with recursive)
          writePromises.push(fs.mkdir(fullPath, { recursive: true }).then(() => undefined as void));
        } else {
          // File entry — ensure parent dir exists
          writePromises.push(
            fs.mkdir(path.dirname(fullPath), { recursive: true }).then(() =>
              fs.writeFile(fullPath, Buffer.from(data))
            ),
          );
        }
      }

      Promise.all(writePromises).then(() => resolve()).catch(reject);
    });
  });
}

/**
 * Find the actual content root inside an extracted archive.
 * If the archive contains a single top-level directory, descend into it.
 */
async function findArchiveContentRoot(extractDir: string): Promise<string> {
  const entries = await fs.readdir(extractDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  const files = entries.filter((e) => e.isFile());

  // If there's exactly one directory and no files, descend into it
  if (dirs.length === 1 && files.length === 0) {
    return path.join(extractDir, dirs[0].name);
  }

  return extractDir;
}

/**
 * Read and parse plugin.json from the content root.
 */
async function readPluginManifest(contentRoot: string): Promise<PluginManifest> {
  // Try .claude-plugin/plugin.json first (spec), then plugin.json at root
  const candidates = [
    path.join(contentRoot, ".claude-plugin", "plugin.json"),
    path.join(contentRoot, "plugin.json"),
  ];

  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, "utf-8");
      return JSON.parse(raw) as PluginManifest;
    } catch {
      // Continue
    }
  }

  return {};
}

/**
 * Derive a URL-safe slug from the archive filename.
 */
function deriveSlugFromUrl(parsedUrl: URL): string {
  const basename = path.basename(parsedUrl.pathname);
  return basename
    .replace(/\.(tar\.gz|tgz|zip)$/i, "")
    .replace(/[^a-z0-9-]/gi, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "")
    || "plugin";
}

/**
 * Read agents/*.md files sorted alphabetically (deterministic ordering).
 * Returns an array of { filename, content } objects.
 */
async function readAgentFiles(
  pluginDir: string,
): Promise<Array<{ filename: string; content: string }>> {
  const agentsDir = path.join(pluginDir, "agents");
  try {
    const entries = await fs.readdir(agentsDir, { withFileTypes: true });
    const mdFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort(); // Alphabetical — deterministic

    const results: Array<{ filename: string; content: string }> = [];
    for (const filename of mdFiles) {
      const content = await fs.readFile(path.join(agentsDir, filename), "utf-8");
      results.push({ filename, content });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Read SKILL.md from the plugin directory.
 * Searches: skills/{slug}/SKILL.md, then root SKILL.md.
 */
async function readPluginSkillMd(
  pluginDir: string,
  slug: string,
): Promise<string | null> {
  const candidates = [
    path.join(pluginDir, "skills", slug, "SKILL.md"),
    path.join(pluginDir, "SKILL.md"),
  ];

  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, "utf-8");
    } catch {
      // Continue
    }
  }

  return null;
}

/**
 * Read .mcp.json and return stdio MCP server entries.
 * HTTP/SSE servers are excluded — only local stdio servers are queued.
 */
async function readMcpServers(pluginDir: string): Promise<McpServerEntry[]> {
  const mcpJsonPath = path.join(pluginDir, ".mcp.json");
  try {
    const raw = await fs.readFile(mcpJsonPath, "utf-8");
    const parsed = JSON.parse(raw) as {
      mcpServers?: Record<string, McpServerEntry & { type?: string; url?: string }>;
    };

    if (!parsed.mcpServers) return [];

    return Object.values(parsed.mcpServers).filter(
      (s) =>
        // Include only stdio servers (no url/type=sse/type=http)
        !s.url && s.type !== "sse" && s.type !== "http" && s.command,
    );
  } catch {
    return [];
  }
}

/**
 * Copy a directory recursively (used to move content across devices).
 * Safe: validates that destination stays within parentDir.
 */
async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Path traversal guard
    if (!destPath.startsWith(dest + path.sep) && destPath !== dest) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Dynamically import the flatten-skill helper.
 * Kept as a dynamic import so the helper can be a plain .js module.
 */
async function importFlattenSkill(): Promise<{
  flattenSkill: (
    skillMd: string,
    agents: Array<{ filename: string; content: string }>,
  ) => string;
}> {
  // Resolve relative to this file at runtime
  const helperPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../agntux/host-emulator/lib/flatten-skill.js",
  );
  return import(helperPath) as Promise<{
    flattenSkill: (
      skillMd: string,
      agents: Array<{ filename: string; content: string }>,
    ) => string;
  }>;
}
// AgntUX END

export default skills;
