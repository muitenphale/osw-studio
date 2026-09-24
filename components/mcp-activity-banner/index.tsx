'use client';

import { useEffect, useState } from 'react';
import { Plug, Square, X } from 'lucide-react';
import { getMcpActivity, subscribeMcpActivity, type McpActivity } from '@/lib/api/mcp-activity';
import { getBackendStatus, subscribeBackendStatus } from '@/lib/api/backend-status';
import { useWorkspaceStore } from '@/lib/stores/workspace';

/**
 * Says when a connected agent is working on this instance.
 *
 * Work arriving through the MCP connector is indistinguishable on screen from work the person did
 * themselves: files change, and an agent task appears in a chat nobody typed into. This names the
 * client and the project it is touching.
 */
export function McpActivityBanner() {
  const [activity, setActivity] = useState<McpActivity | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [backendDown, setBackendDown] = useState(false);

  useEffect(() => {
    setActivity(getMcpActivity());
    return subscribeMcpActivity(setActivity);
  }, []);

  useEffect(() => {
    setBackendDown(getBackendStatus().backendDown);
    return subscribeBackendStatus((s) => setBackendDown(s.backendDown || s.authExpired));
  }, []);

  if (!activity) return null;
  // Dismissing hides this notice, not every later one.
  if (dismissedAt === activity.at) return null;
  // Both bars are fixed to the top of the window, and the backend one is the more urgent.
  if (backendDown) return null;

  const what = activity.kind === 'run'
    ? `is running an agent task on ${activity.projectName}`
    : activity.kind === 'deploy'
      ? `${activity.action ?? 'changed'} the deployment ${activity.projectName}`
      : `edited files in ${activity.projectName}`;

  return (
    // An opaque surface: the bar is fixed over the app chrome, and a tint would let the page
    // beneath it show through the text.
    <div
      role="status"
      className="fixed top-0 inset-x-0 z-[60] flex items-center justify-center gap-3 px-4 py-2 text-sm bg-background border-b border-primary/30 text-primary shadow-md"
    >
      <Plug className="h-4 w-4 shrink-0" />
      <span>
        <span className="font-medium">{activity.clientLabel}</span> {what} through the MCP connector.
      </span>
      {/* A run spends the person's own provider key, so the notice that it is happening is also
          where it can be stopped. Without this the only way to end it was to close the tab. */}
      {activity.kind === 'run' && (
        <button
          type="button"
          onClick={() => useWorkspaceStore.getState().stopGeneration(activity.projectId)}
          className="flex items-center gap-1 rounded border border-primary/40 px-2 py-0.5 text-xs font-medium hover:bg-primary/20 transition-colors"
        >
          <Square className="h-3 w-3" />
          Stop
        </button>
      )}
      <button
        type="button"
        onClick={() => setDismissedAt(activity.at)}
        className="ml-1 p-0.5 rounded hover:bg-primary/20 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
