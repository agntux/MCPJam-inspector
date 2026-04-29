// AgntUX: URL-only mode utilities

interface AgntUXUrlParams {
  mcpServerUrl: string[];
  skillUrl: string[];
  skillName: string[];
  /** ?pluginUrl= — tarball URL for plugin-mode auto-install */
  pluginUrl: string | null;
  /** ?appId= — drives the sandbox workspace path in plugin mode */
  appId: string | null;
  hasUrlParams: boolean;
  hasServerParams: boolean;
  hasSkillParams: boolean;
  /** True when a pluginUrl query param is present */
  hasPluginUrl: boolean;
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
  const pluginUrl = urlParams.get("pluginUrl");
  const appId = urlParams.get("appId");

  cachedParams = {
    mcpServerUrl,
    skillUrl,
    skillName,
    pluginUrl,
    appId,
    hasUrlParams:
      mcpServerUrl.length > 0 ||
      skillUrl.length > 0 ||
      skillName.length > 0 ||
      pluginUrl !== null,
    hasServerParams: mcpServerUrl.length > 0,
    hasSkillParams: skillUrl.length > 0 || skillName.length > 0,
    hasPluginUrl: pluginUrl !== null,
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

/**
 * Resets the cached params. Useful in tests where window.location changes.
 * @internal
 */
export function _resetUrlParamsCache(): void {
  cachedParams = null;
}
