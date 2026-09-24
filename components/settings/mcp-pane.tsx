'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plug, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Section, SectionHeader, SectionBody } from '@/components/ui/section';
import { SettingRow } from '@/components/ui/setting-row';
import { logger } from '@/lib/utils';

/**
 * The MCP clients this account has authorised, and revoking one.
 *
 * A grant is a bearer token held by software outside the studio that can read and write a
 * workspace's files, run the agent and publish deployments. It lives until it is revoked, so
 * there has to be somewhere to see what holds one and cut it off.
 *
 * `MCP_ENABLED` is server-only and has no public twin, so whether the connector exists is
 * discovered by asking: the endpoint 404s when it is off, which this renders as an off state
 * rather than an error.
 */

interface Grant {
  id: string;
  clientName: string;
  workspaceId: string;
  scopes: string[];
  createdAt: string | number;
  lastUsedAt: string | number | null;
  recentActivity?: Array<{ tool: string; target: string | null; refused: boolean; at: string }>;
}

type Load =
  | { state: 'loading' }
  | { state: 'disabled' }
  | { state: 'error'; message: string }
  | { state: 'ready'; grants: Grant[] };

function when(value: string | number | null | undefined): string {
  if (!value) return 'Never';
  const date = new Date(typeof value === 'number' ? value : String(value));
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString();
}

export function McpPane({ workspaceId }: { workspaceId?: string }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [names, setNames] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/mcp/grants');
      if (response.status === 404) {
        setLoad({ state: 'disabled' });
        return;
      }
      if (!response.ok) {
        setLoad({ state: 'error', message: `Could not load MCP clients (${response.status})` });
        return;
      }
      const data = await response.json();
      setLoad({ state: 'ready', grants: Array.isArray(data.grants) ? data.grants : [] });
    } catch (error) {
      logger.error('[ConnectedAgents] Failed to load grants:', error);
      setLoad({ state: 'error', message: 'Could not load MCP clients' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Grants carry a workspace id; the list reads better with the name the consent screen showed.
  useEffect(() => {
    if (load.state !== 'ready' || load.grants.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/workspaces');
        if (!response.ok) return;
        const data = await response.json();
        const list = Array.isArray(data.workspaces) ? data.workspaces : data;
        if (!Array.isArray(list) || cancelled) return;
        const map: Record<string, string> = {};
        for (const w of list) if (w?.id && w?.name) map[w.id] = w.name;
        setNames(map);
      } catch {
        // The id is a usable fallback, so a failure here is not worth surfacing.
      }
    })();
    return () => { cancelled = true; };
  }, [load]);

  const revoke = async (grant: Grant) => {
    setRevoking(grant.id);
    try {
      const response = await fetch(`/api/mcp/grants?id=${encodeURIComponent(grant.id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      toast.success(`Disconnected "${grant.clientName}"`);
      setConfirming(null);
      await refresh();
    } catch (error) {
      logger.error('[ConnectedAgents] Failed to revoke grant:', error);
      toast.error('Could not disconnect that client');
    } finally {
      setRevoking(null);
    }
  };

  const endpoint = typeof window !== 'undefined' ? `${window.location.origin}/api/mcp` : '/api/mcp';
  const docsHref = workspaceId ? `/w/${workspaceId}/docs?doc=mcp-server` : '/admin/docs?doc=mcp-server';

  const copyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(endpoint);
      toast.success('Copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <>
    <Section>
      <SectionHeader icon={Plug} title="MCP" />
      <SectionBody>
        <p className="text-xs text-muted-foreground pt-3">
          Let an outside client (Claude Code, Cursor, and others that speak MCP) work on a workspace.
          Enabled with <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">MCP_ENABLED=true</code>.
          {' '}<a href={docsHref} className="underline underline-offset-2">Setup guide</a>.
        </p>
        {load.state !== 'disabled' && (
          <SettingRow
            title="Endpoint"
            description="HTTP URL to add in the client. Not stdio, not SSE."
          >
            <span className="flex items-center gap-1 min-w-0">
              <code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{endpoint}</code>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => void copyEndpoint()} aria-label="Copy MCP endpoint">
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </span>
          </SettingRow>
        )}
      </SectionBody>
    </Section>

    <Section>
      <SectionHeader icon={Plug} title="Clients" />
      <SectionBody>
        <p className="text-xs text-muted-foreground pt-3">
          Clients you have authorised. Each grant is one workspace and the scopes you approved,
          until you disconnect it.
        </p>

        {load.state === 'loading' && (
          <p className="text-sm text-muted-foreground py-3">Loading…</p>
        )}

        {load.state === 'disabled' && (
          <p className="text-sm text-muted-foreground py-3">
            The MCP connector is not enabled on this instance.
          </p>
        )}

        {load.state === 'error' && (
          <div className="flex items-center gap-3 py-3">
            <p className="text-sm text-muted-foreground flex-1">{load.message}</p>
            <Button size="sm" variant="outline" onClick={() => void refresh()}>Retry</Button>
          </div>
        )}

        {load.state === 'ready' && load.grants.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Plug className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No MCP clients are authorised.</p>
            <p className="text-xs text-muted-foreground">
              The client registers itself on first connect; you pick the workspace and scopes.
            </p>
          </div>
        )}

        {load.state === 'ready' && load.grants.map((grant) => (
          <SettingRow
            key={grant.id}
            title={grant.clientName || 'Unnamed client'}
            description={
              <span className="flex flex-col gap-1">
                <span>
                  {names[grant.workspaceId] ?? grant.workspaceId}
                  {' · added '}{when(grant.createdAt)}
                  {' · last used '}{when(grant.lastUsedAt)}
                </span>
                <span className="flex flex-wrap gap-1">
                  {grant.scopes.length === 0
                    ? <span className="text-xs">No scopes</span>
                    : grant.scopes.map((scope) => (
                        <Badge key={scope} variant="secondary" className="text-[11px] px-1.5 py-0">
                          {scope}
                        </Badge>
                      ))}
                </span>
                {/* What it did, not just that it was here: a connector that only ever reads and one
                    that publishes deployments look identical from a date alone. */}
                {grant.recentActivity && grant.recentActivity.length > 0 && (
                  <span className="flex flex-col gap-0.5 pt-1 text-[11px] text-muted-foreground">
                    <span className="uppercase tracking-wider">Recent calls</span>
                    {grant.recentActivity.slice(0, 5).map((call, i) => (
                      <span key={`${call.at}-${i}`} className="font-mono">
                        {when(call.at)} · {call.tool}
                        {call.target ? ` · ${call.target}` : ''}
                        {call.refused ? ' · refused' : ''}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            }
          >
            {confirming === grant.id ? (
              <span className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={revoking === grant.id}
                  onClick={() => void revoke(grant)}
                >
                  {revoking === grant.id ? 'Disconnecting…' : 'Confirm'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirming(grant.id)}>
                Disconnect
              </Button>
            )}
          </SettingRow>
        ))}
      </SectionBody>
    </Section>
    </>
  );
}
