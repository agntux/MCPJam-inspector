/**
 * NoOpWebSocket - A no-op WebSocket implementation for self-hosted mode.
 *
 * When running without Convex (self-hosted mode), the ConvexReactClient still
 * tries to establish a WebSocket connection. Without this no-op implementation,
 * the client enters a reconnection loop that re-renders the React tree and freezes the page.
 *
 * This class sits in CONNECTING state forever - no events fire, no network requests made.
 */
export class NoOpWebSocket {
  static CONNECTING = 0 as const;
  static OPEN = 1 as const;
  static CLOSING = 2 as const;
  static CLOSED = 3 as const;

  readyState: number = 0; // CONNECTING — sits here forever, no events fire
  url: string;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  close(): void {
    this.readyState = 3; // CLOSED
  }

  send(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return false;
  }
}
