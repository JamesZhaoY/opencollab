import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { Awareness } from 'y-protocols/awareness';

export interface CollaborationUser {
  id: number;
  username: string;
}

/**
 * Manages a Yjs document for a single file.
 * Handles WebSocket connection, reconnection, and awareness.
 */
export class CollaborationManager {
  private doc: Y.Doc;
  private provider: WebsocketProvider | null = null;
  private onSyncCallback: ((isSynced: boolean) => void) | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private currentUser: CollaborationUser | null = null;

  constructor(public fileId: number) {
    this.doc = new Y.Doc();
  }

  /** Connect to the WebSocket server for real-time collaboration. */
  connect(
    onSync: (isSynced: boolean) => void,
    tokenGetter: () => string | null,
    user?: CollaborationUser | null,
  ): void {
    this.onSyncCallback = onSync;
    if (user) this.currentUser = user;

    // In dev, connect directly to the backend to bypass system proxy
    // (system proxy at 127.0.0.1:7890 doesn't support WebSocket forwarding)
    // In prod, use same-origin /ws which is served by the reverse proxy.
    const isDev = window.location.port === '5173';
    const wsUrl = isDev
      ? 'ws://127.0.0.1:8000/ws'
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

    console.log('Attempting to connect to WebSocket:', wsUrl, 'with file ID:', this.fileId);

    try {
      const token = tokenGetter();
      if (!token) throw new Error('No access token available');
      this.provider = new WebsocketProvider(wsUrl, this.fileId.toString(), this.doc, {
        params: { token },
      });
      this.applyAwarenessUser();

      this.provider.on('status', (event: { status: 'connected' | 'disconnected' | 'connecting' }) => {
        console.log('WebSocket status:', event.status);
        if (event.status === 'connected') {
          this.reconnectAttempts = 0;
          // The backend is a room relay and cannot always produce a Yjs `sync`
          // event when this client is alone. A connected socket is nevertheless
          // ready for collaboration because the document was loaded via REST.
          this.onSyncCallback?.(true);
        } else if (event.status === 'disconnected') {
          this.onSyncCallback?.(false);
          this.reconnectAttempts++;
          if (this.reconnectAttempts > this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
          }
        }
      });

      this.provider.on('sync', (isSynced: boolean) => {
        console.log('WebSocket sync status:', isSynced);
        this.reconnectAttempts = 0;
        if (this.onSyncCallback) {
          this.onSyncCallback(isSynced);
        }
      });

      this.provider.on('connection-error' as any, (error: unknown) => {
        console.error('WebSocket error:', error);
      });

    } catch (error) {
      console.error('Failed to create WebSocket provider:', error);
      // Attempt to reconnect after delay
      setTimeout(() => {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.connect(onSync, tokenGetter);
        }
      }, 5000);
    }
  }

  /** Disconnect from the collaboration server. */
  disconnect(): void {
    if (this.provider) {
      try {
        this.provider.awareness.setLocalState(null);
      } catch {
        // Ignore awareness cleanup failures during route/page teardown.
      }
      this.provider.destroy();
      this.provider = null;
    }
    this.doc.destroy();
  }

  /** Get the underlying Yjs document for editor collaboration metadata. */
  getDoc(): Y.Doc {
    return this.doc;
  }

  /** Get a collaborative text field from the document. */
  getText(name = 'content'): Y.Text {
    return this.doc.getText(name);
  }

  /** Get a collaborative map field from the document. */
  getMap<T = unknown>(name: string): Y.Map<T> {
    return this.doc.getMap<T>(name);
  }

  /** Get this browser tab's Yjs awareness client id. */
  getClientId(): number | null {
    return this.provider ? this.provider.awareness.clientID : null;
  }

  /** Set or update the local user's presence metadata. */
  setLocalUser(user: CollaborationUser): void {
    this.currentUser = user;
    this.applyAwarenessUser();
  }

  /** Get the Yjs awareness for collaborator presence. */
  getAwareness(): Awareness {
    if (!this.provider) {
      throw new Error('Provider not initialized. Call connect() first.');
    }
    return this.provider.awareness;
  }

  private applyAwarenessUser(): void {
    if (!this.provider || !this.currentUser) return;
    this.provider.awareness.setLocalStateField('user', {
      id: this.currentUser.id,
      name: this.currentUser.username,
    });
    this.provider.awareness.setLocalStateField('username', this.currentUser.username);
  }

}
