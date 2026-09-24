/**
 * What an MCP client is doing to this workspace right now.
 *
 * A connected agent edits files and starts agent runs through the connector, and all of it lands
 * in the same projects the person has open. Without a signal, files change under them and a task
 * appears in a chat they did not start, with nothing on screen saying where it came from.
 *
 * Module-level state with listeners, the same shape as `backend-status.ts`, so the banner can read
 * it without the store and without a provider.
 */

export interface McpActivity {
  /** What the client did. An edit or a deployment change is a moment; a run lasts until the task finishes. */
  kind: 'edit' | 'run' | 'deploy';
  projectId: string;
  projectName: string;
  /** For a deployment change, which one it was: created, published, unpublished, updated. */
  action?: string;
  /** The registered client's name, e.g. "Claude". */
  clientLabel: string;
  at: number;
}

type Listener = (activity: McpActivity | null) => void;

/** How long an edit stays on screen. A run is cleared by its task finishing instead. */
export const MCP_EDIT_NOTICE_MS = 12_000;

let current: McpActivity | null = null;
let expiry: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function notify() {
  const snapshot = current ? { ...current } : null;
  listeners.forEach((l) => l(snapshot));
}

export function getMcpActivity(): McpActivity | null {
  return current ? { ...current } : null;
}

export function subscribeMcpActivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function markMcpActivity(activity: Omit<McpActivity, 'at'>): void {
  if (expiry) { clearTimeout(expiry); expiry = null; }
  current = { ...activity, at: Date.now() };
  // A run has an end of its own; a moment needs a timer to clear itself.
  if (activity.kind === 'edit' || activity.kind === 'deploy') {
    expiry = setTimeout(() => { current = null; expiry = null; notify(); }, MCP_EDIT_NOTICE_MS);
  }
  notify();
}

/**
 * Clear the notice. A finished run passes its project id so a later run on another project is not
 * cleared by an earlier one ending.
 */
export function clearMcpActivity(projectId?: string): void {
  if (!current) return;
  if (projectId && current.projectId !== projectId) return;
  if (expiry) { clearTimeout(expiry); expiry = null; }
  current = null;
  notify();
}
