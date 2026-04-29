/**
 * AgntUX Wrapper Component
 *
 * Wraps the MCPJam Inspector UI when running in AgntUX mode.
 *
 * Features:
 * - Top banner showing AgntUX mode + active plugin slug/version
 * - Collapsible right-side sandbox file inspector (Glob + Read against host
 *   emulator URL from VITE_AGNTUX_HOST_EMULATOR_URL env var — NOT hardcoded)
 * - ?appId= URL param drives the workspace path
 *
 * Aesthetic: industrial-terminal devtools — dark charcoal panel with amber
 * accent glows, IBM Plex Mono typography, slide-in animation.
 */

import type { ReactNode } from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { getAgntUXUrlParams } from '../lib/url-params.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgntUXWrapperProps {
  children: ReactNode;
  pluginSlug?: string;
  pluginVersion?: string;
}

interface SandboxFile {
  path: string;
  size: number;
  content?: string;
  expanded: boolean;
  loading: boolean;
  error?: string;
}

// ─── Host emulator URL (from settings, NOT hardcoded) ─────────────────────────

/**
 * Resolves the host emulator base URL from the environment.
 * Set VITE_AGNTUX_HOST_EMULATOR_URL in your .env to point at the
 * AgntUX backend's host-emulator MCP endpoint.
 */
function getHostEmulatorUrl(): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (import.meta as any).env?.VITE_AGNTUX_HOST_EMULATOR_URL as string | undefined;
}

// ─── Sandbox file hook ────────────────────────────────────────────────────────

/** Monotonic counter for JSON-RPC request ids. */
let nextRpcId = 1;

function useSandboxFiles(appId: string | null) {
  const hostEmulatorUrl = getHostEmulatorUrl();
  const [files, setFiles] = useState<SandboxFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!hostEmulatorUrl || !appId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${hostEmulatorUrl}?appId=${encodeURIComponent(appId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: nextRpcId++,
            method: 'tools/call',
            params: { name: 'Glob', arguments: { pattern: '**/*' } },
          }),
        },
      );
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = (await res.json()) as {
        result?: { content?: Array<{ text?: string }> };
        error?: { message?: string };
      };
      if (data.error) throw new Error(data.error.message ?? 'Glob failed');
      // Parse the text result — server returns JSON array of {path, size} objects
      const raw = data.result?.content?.[0]?.text ?? '[]';
      const parsed = JSON.parse(raw) as Array<{ path: string; size: number }>;
      setFiles(
        parsed.map((f) => ({ path: f.path, size: f.size, expanded: false, loading: false })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unreachable');
    } finally {
      setLoading(false);
    }
  }, [hostEmulatorUrl, appId]);

  const readFile = useCallback(
    async (filePath: string) => {
      if (!hostEmulatorUrl || !appId) return;
      setFiles((prev) =>
        prev.map((f) => (f.path === filePath ? { ...f, loading: true, error: undefined } : f)),
      );
      try {
        const res = await fetch(
          `${hostEmulatorUrl}?appId=${encodeURIComponent(appId)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: nextRpcId++,
              method: 'tools/call',
              params: { name: 'Read', arguments: { file_path: filePath } },
            }),
          },
        );
        if (!res.ok) throw new Error(`${res.status}`);
        const data = (await res.json()) as {
          result?: { content?: Array<{ text?: string }> };
          error?: { message?: string };
        };
        if (data.error) throw new Error(data.error.message ?? 'Read failed');
        const content = data.result?.content?.[0]?.text ?? '';
        setFiles((prev) =>
          prev.map((f) =>
            f.path === filePath ? { ...f, content, loading: false, expanded: true } : f,
          ),
        );
      } catch (e) {
        setFiles((prev) =>
          prev.map((f) =>
            f.path === filePath
              ? { ...f, error: e instanceof Error ? e.message : 'Error', loading: false }
              : f,
          ),
        );
      }
    },
    [hostEmulatorUrl, appId],
  );

  const toggleFile = useCallback(
    (filePath: string) => {
      const file = files.find((f) => f.path === filePath);
      if (!file) return;
      if (file.expanded) {
        setFiles((prev) =>
          prev.map((f) => (f.path === filePath ? { ...f, expanded: false } : f)),
        );
        return;
      }
      if (file.content !== undefined) {
        setFiles((prev) =>
          prev.map((f) => (f.path === filePath ? { ...f, expanded: true } : f)),
        );
        return;
      }
      readFile(filePath);
    },
    [files, readFile],
  );

  return { files, loading, error, refresh, toggleFile, hostEmulatorUrl };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}b`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}k`;
  return `${(bytes / 1024 / 1024).toFixed(1)}M`;
}

// ─── FileEntry component ──────────────────────────────────────────────────────

interface FileEntryProps {
  file: SandboxFile;
  onToggle: (path: string) => void;
}

function FileEntry({ file, onToggle }: FileEntryProps) {
  const parts = file.path.split('/');
  const depth = Math.max(0, parts.length - 1);
  const name = parts[parts.length - 1];

  return (
    <div style={{ borderBottom: '1px solid #0f1420' }}>
      <button
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          background: file.expanded ? '#1a1f2e' : 'none',
          border: 'none',
          cursor: 'pointer',
          padding: `5px 8px 5px ${8 + depth * 12}px`,
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          fontSize: '11px',
          color: file.expanded ? '#fbbf24' : '#94a3b8',
          textAlign: 'left',
          transition: 'background 0.1s, color 0.1s',
        }}
        onClick={() => onToggle(file.path)}
        aria-expanded={file.expanded}
        aria-label={`${file.expanded ? 'Collapse' : 'Expand'} ${file.path}`}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = '#1a1f2e';
          (e.currentTarget as HTMLButtonElement).style.color = '#f59e0b';
        }}
        onMouseLeave={(e) => {
          if (!file.expanded) {
            (e.currentTarget as HTMLButtonElement).style.background = 'none';
            (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8';
          }
        }}
      >
        <span
          style={{
            fontSize: '10px',
            color: file.expanded ? '#f59e0b' : '#374151',
            flexShrink: 0,
            width: '12px',
            textAlign: 'center',
            display: 'inline-block',
            transform: file.expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        >
          {file.loading ? '⟳' : '›'}
        </span>
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </span>
        <span
          style={{
            fontSize: '9px',
            color: '#374151',
            flexShrink: 0,
            letterSpacing: '0.02em',
          }}
        >
          {formatBytes(file.size)}
        </span>
      </button>
      {file.expanded && (
        <div
          role="region"
          aria-label={`Content of ${file.path}`}
          style={{ borderTop: '1px solid #1e2430' }}
        >
          {file.error ? (
            <div
              style={{
                padding: '8px 12px',
                fontSize: '10px',
                color: '#f59e0b',
                background: '#080b10',
              }}
            >
              ⚠ {file.error}
            </div>
          ) : (
            <pre
              style={{
                margin: 0,
                padding: '8px 12px',
                fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                fontSize: '10px',
                color: '#64748b',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '200px',
                overflowY: 'auto',
                background: '#080b10',
                lineHeight: 1.5,
              }}
            >
              {file.content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SandboxPanel component ───────────────────────────────────────────────────

interface SandboxPanelProps {
  appId: string | null;
  onClose: () => void;
}

function SandboxPanel({ appId, onClose }: SandboxPanelProps) {
  const { files, loading, error, refresh, toggleFile, hostEmulatorUrl } =
    useSandboxFiles(appId);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Derive display hostname safely
  let displayHost: string | null = null;
  try {
    if (hostEmulatorUrl) displayHost = new URL(hostEmulatorUrl).hostname;
  } catch {
    displayHost = hostEmulatorUrl ?? null;
  }

  return (
    <aside
      aria-label="Sandbox file inspector"
      style={{
        width: '300px',
        flexShrink: 0,
        background: '#0d1117',
        borderLeft: '1px solid #1e2430',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'agntux-slide-in 0.18s ease-out',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid #1e2430',
          background: '#0a0d12',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#e2e8f0',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          }}
        >
          <span style={{ color: '#f59e0b', fontSize: '13px' }}>◈</span>
          <span>Sandbox</span>
          {appId && (
            <span
              title={appId}
              style={{
                fontSize: '9px',
                color: '#4b5563',
                background: '#1a1f2e',
                borderRadius: '3px',
                padding: '1px 5px',
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              {appId.slice(0, 8)}…
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh files"
            style={{
              background: 'none',
              border: '1px solid #1e2430',
              borderRadius: '3px',
              color: loading ? '#2d3748' : '#6b7280',
              fontSize: '12px',
              cursor: loading ? 'not-allowed' : 'pointer',
              width: '22px',
              height: '22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.1s, border-color 0.1s',
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                animation: loading ? 'agntux-spin 0.8s linear infinite' : 'none',
              }}
            >
              ↻
            </span>
          </button>
          <button
            onClick={onClose}
            aria-label="Close inspector"
            style={{
              background: 'none',
              border: '1px solid #1e2430',
              borderRadius: '3px',
              color: '#6b7280',
              fontSize: '12px',
              cursor: 'pointer',
              width: '22px',
              height: '22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.1s, border-color 0.1s',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {!hostEmulatorUrl && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '32px 16px',
              textAlign: 'center',
              color: '#4b5563',
              fontSize: '11px',
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            }}
          >
            <div style={{ fontSize: '24px', color: '#374151' }}>⚙</div>
            <div>Configure VITE_AGNTUX_HOST_EMULATOR_URL</div>
          </div>
        )}

        {hostEmulatorUrl && loading && files.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              padding: '32px 16px',
              textAlign: 'center',
              color: '#4b5563',
              fontSize: '11px',
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            }}
          >
            <div style={{ display: 'flex', gap: '4px' }}>
              {[0, 200, 400].map((delay) => (
                <span
                  key={delay}
                  style={{
                    width: '4px',
                    height: '4px',
                    borderRadius: '50%',
                    background: '#f59e0b',
                    display: 'inline-block',
                    animation: `agntux-pulse 1.2s ease-in-out ${delay}ms infinite`,
                  }}
                />
              ))}
            </div>
            <div>Scanning workspace…</div>
          </div>
        )}

        {hostEmulatorUrl && error && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '32px 16px',
              textAlign: 'center',
              fontSize: '11px',
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            }}
          >
            <div style={{ fontSize: '24px', color: '#f59e0b' }}>⚠</div>
            <div style={{ color: '#d1d5db', fontWeight: 600 }}>Host emulator unreachable</div>
            <div style={{ fontSize: '10px', color: '#6b7280', wordBreak: 'break-all' }}>
              {error}
            </div>
            <button
              onClick={refresh}
              style={{
                marginTop: '4px',
                background: 'none',
                border: '1px solid rgba(245,158,11,0.3)',
                borderRadius: '4px',
                color: '#f59e0b',
                fontSize: '11px',
                cursor: 'pointer',
                padding: '3px 12px',
                fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                transition: 'background 0.15s',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {hostEmulatorUrl && !loading && !error && files.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '32px 16px',
              textAlign: 'center',
              color: '#4b5563',
              fontSize: '11px',
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            }}
          >
            <div style={{ fontSize: '24px', color: '#374151' }}>◇</div>
            <div>No workspace files yet</div>
            <div
              style={{
                fontSize: '10px',
                color: '#374151',
                border: '1px dashed #1e2430',
                borderRadius: '4px',
                padding: '4px 10px',
                marginTop: '4px',
              }}
            >
              Seed fixtures to populate
            </div>
          </div>
        )}

        {files.length > 0 && (
          <div role="tree">
            {files.map((file) => (
              <FileEntry key={file.path} file={file} onToggle={toggleFile} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {hostEmulatorUrl && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '5px 10px',
            borderTop: '1px solid #1e2430',
            background: '#0a0d12',
            flexShrink: 0,
            fontSize: '9px',
            color: '#374151',
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          <span
            title={hostEmulatorUrl}
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '180px',
            }}
          >
            {displayHost ?? hostEmulatorUrl}
          </span>
          <span style={{ color: '#f59e0b' }}>{files.length} files</span>
        </div>
      )}
    </aside>
  );
}

// ─── Main wrapper component ───────────────────────────────────────────────────

export function AgntUXWrapper({ children, pluginSlug, pluginVersion }: AgntUXWrapperProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isAgntUXMode = (import.meta as any).env?.VITE_AGNTUX_MODE === 'true';
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Read ?appId= from URL (drives sandbox workspace path)
  const appId = getAgntUXUrlParams().appId;

  if (!isAgntUXMode) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Keyframe animations injected once as a style tag */}
      <style>{`
        @keyframes agntux-slide-in {
          from { transform: translateX(300px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes agntux-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes agntux-pulse {
          0%, 100% { opacity: 0.2; }
          50%       { opacity: 1; }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
          fontFamily: "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
        }}
      >
        {/* Banner */}
        <div
          role="banner"
          style={{
            flexShrink: 0,
            background: 'linear-gradient(90deg, #7c3aed 0%, #2563eb 100%)',
            color: '#fff',
            padding: '0 16px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '12px',
            letterSpacing: '0.02em',
            position: 'relative',
            zIndex: 10,
          }}
        >
          {/* Label */}
          <span
            style={{
              fontWeight: 600,
              opacity: 0.7,
              textTransform: 'uppercase',
              fontSize: '10px',
              letterSpacing: '0.08em',
              whiteSpace: 'nowrap',
            }}
          >
            AgntUX
          </span>

          {/* Divider */}
          <div
            style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.2)', flexShrink: 0 }}
          />

          {/* Plugin slug / version */}
          {pluginSlug ? (
            <>
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                  fontWeight: 600,
                  color: '#fbbf24',
                  fontSize: '12px',
                  letterSpacing: '0.01em',
                }}
              >
                {pluginSlug}
              </span>
              {pluginVersion && (
                <span
                  style={{
                    fontSize: '10px',
                    color: 'rgba(251,191,36,0.6)',
                    marginLeft: '2px',
                  }}
                >
                  v{pluginVersion}
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: '11px', opacity: 0.45, fontStyle: 'italic' }}>
              no plugin loaded
            </span>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Powered by label */}
          <span style={{ fontSize: '10px', opacity: 0.5, letterSpacing: '0.03em' }}>
            Playwright
          </span>

          {/* Divider */}
          <div
            style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.2)', flexShrink: 0 }}
          />

          {/* Sandbox panel toggle */}
          <button
            aria-pressed={panelOpen}
            aria-label={panelOpen ? 'Close sandbox inspector' : 'Open sandbox inspector'}
            onClick={() => setPanelOpen((o) => !o)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              background: panelOpen ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.12)',
              border: `1px solid ${panelOpen ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.18)'}`,
              borderRadius: '4px',
              color: panelOpen ? '#fbbf24' : '#fff',
              fontSize: '11px',
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              cursor: 'pointer',
              padding: '3px 8px',
              transition: 'background 0.15s, color 0.15s, border-color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            <span>◫</span>
            <span>Sandbox</span>
          </button>
        </div>

        {/* Body: children + optional right panel */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
          <main style={{ flex: 1, overflow: 'hidden' }}>{children}</main>

          {panelOpen && (
            <div ref={panelRef}>
              <SandboxPanel appId={appId} onClose={() => setPanelOpen(false)} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
