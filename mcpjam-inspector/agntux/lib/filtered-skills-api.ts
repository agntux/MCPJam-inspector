// AgntUX: Filtered skills API for URL-only mode

import { listSkills } from "@/lib/apis/mcp-skills-api";
import { isUrlOnlyMode, getAgntUXUrlParams } from "./url-params";

/** Skills installed via ?skillUrl= at runtime are registered here. */
const installedSkillNames = new Set<string>();

/**
 * Registers a skill name as allowed in URL-only mode.
 * Call this after a ?skillUrl= skill is successfully installed.
 */
export function registerInstalledSkill(name: string): void {
  installedSkillNames.add(name);
}

/**
 * Lists skills, filtered by URL params when in URL-only mode.
 *
 * - Normal mode (hasConvex or no URL params): returns all skills unchanged.
 * - URL-only mode with ?skillName= params: returns only skills whose name
 *   matches one of the ?skillName= values OR was registered via registerInstalledSkill().
 * - URL-only mode with no skill params: returns empty array [].
 */
export async function listSkillsFiltered(
  hasConvex: boolean,
): Promise<Awaited<ReturnType<typeof listSkills>>> {
  if (!isUrlOnlyMode(hasConvex)) {
    return listSkills();
  }

  const { skillName, hasSkillParams } = getAgntUXUrlParams();

  if (!hasSkillParams) {
    return [];
  }

  const allowed = new Set([...skillName, ...installedSkillNames]);
  const all = await listSkills();
  return all.filter((skill) => allowed.has(skill.name));
}
