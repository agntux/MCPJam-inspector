/**
 * flatten-skill.js
 *
 * Concatenates SKILL.md + agents/*.md into a single combined system prompt
 * for use in MCPJam test mode, where subagent isolation is not enforced.
 *
 * Ordering is deterministic: agents are sorted alphabetically by filename
 * before concatenation (caller is responsible for pre-sorting, but this
 * helper also sorts defensively).
 *
 * @module flatten-skill
 */

/**
 * Preamble inserted before the subagent sections.
 */
const SUBAGENT_PREAMBLE =
  "## Subagents available in test mode\n" +
  "The following subagents are available, presented in one combined context " +
  "for test-mode use. Subagent isolation is not enforced.";

/**
 * Flatten a plugin's SKILL.md and agents/*.md into a single string.
 *
 * @param {string} skillMd - Contents of the plugin's SKILL.md file.
 * @param {Array<{filename: string, content: string}>} agents
 *   Array of agent file descriptors. Will be sorted alphabetically by
 *   `filename` before concatenation (deterministic output regardless of
 *   the order they are supplied).
 * @returns {string} The combined skill content ready to use as a system prompt.
 */
export function flattenSkill(skillMd, agents) {
  if (typeof skillMd !== "string") {
    throw new TypeError("flattenSkill: skillMd must be a string");
  }
  if (!Array.isArray(agents)) {
    throw new TypeError("flattenSkill: agents must be an array");
  }

  // Defensive sort — alphabetical by filename (case-insensitive for portability)
  const sortedAgents = [...agents].sort((a, b) =>
    a.filename.localeCompare(b.filename, undefined, { sensitivity: "base" }),
  );

  const parts = [skillMd.trimEnd()];

  if (sortedAgents.length > 0) {
    parts.push("");
    parts.push("---");
    parts.push("");
    parts.push(SUBAGENT_PREAMBLE);
    parts.push("");

    for (const agent of sortedAgents) {
      if (typeof agent.filename !== "string" || typeof agent.content !== "string") {
        throw new TypeError(
          "flattenSkill: each agent must have string filename and content fields",
        );
      }

      // Section heading derived from filename (strip .md extension)
      const agentName = agent.filename.replace(/\.md$/i, "");
      parts.push(`### ${agentName}`);
      parts.push("");
      parts.push(agent.content.trimEnd());
      parts.push("");
    }
  }

  return parts.join("\n");
}
