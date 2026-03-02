// AgntUX: URL-only mode utilities

interface AgntUXUrlParams {
  mcpServerUrl: string[];
  skillUrl: string[];
  skillName: string[];
  hasUrlParams: boolean;
  hasServerParams: boolean;
  hasSkillParams: boolean;
}

let cachedParams: AgntUXUrlParams | null = null;

/**
 * Parses and caches AgntUX URL parameters from the current page URL.
 * Results are cached at module level since URL params don't change in a SPA.
 */
export function getAgntUXUrlParams(): AgntUXUrlParams {
  if (cachedParams !== null) {
    return cachedParams;
  }

  const urlParams = new URLSearchParams(window.location.search);

  const mcpServerUrl = urlParams.getAll("mcpServerUrl");
  const skillUrl = urlParams.getAll("skillUrl");
  const skillName = urlParams.getAll("skillName");

  cachedParams = {
    mcpServerUrl,
    skillUrl,
    skillName,
    hasUrlParams: mcpServerUrl.length > 0 || skillUrl.length > 0 || skillName.length > 0,
    hasServerParams: mcpServerUrl.length > 0,
    hasSkillParams: skillUrl.length > 0 || skillName.length > 0,
  };

  return cachedParams;
}

/**
 * Returns true when running in URL-only mode:
 * no Convex backend is configured, but AgntUX URL params are present.
 */
export function isUrlOnlyMode(hasConvex: boolean): boolean {
  return !hasConvex && getAgntUXUrlParams().hasUrlParams;
}
