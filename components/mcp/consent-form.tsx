'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { ACTIVE_SCOPES, SCOPE_SUMMARY, type McpScope } from '@/lib/mcp/scopes';

/**
 * What the account approves: one workspace, and which capabilities inside it. A scope the
 * account's role in the chosen workspace cannot grant is shown with the reason rather than
 * hidden, so the answer to "why can this agent not deploy" is on the screen.
 */

interface ConsentFormProps {
  clientName: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  resource: string;
  accountEmail: string;
  workspaces: { id: string; name: string; role: 'owner' | 'editor' | 'viewer' }[];
  requestedScopes: McpScope[];
  grantableByRole: Record<string, McpScope[]>;
}

export function ConsentForm(props: ConsentFormProps) {
  const [workspaceId, setWorkspaceId] = useState(props.workspaces[0].id);
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [error, setError] = useState('');

  const grantable = useMemo(() => new Set(props.grantableByRole[workspaceId] ?? []), [props.grantableByRole, workspaceId]);
  const role = props.workspaces.find(w => w.id === workspaceId)?.role ?? 'viewer';

  // Default to what the client asked for, or read-only when it asked for nothing.
  const [chosen, setChosen] = useState<Set<McpScope>>(
    () => new Set(props.requestedScopes.length ? props.requestedScopes : (['projects:read'] as McpScope[])),
  );

  const allowed = [...chosen].filter(s => grantable.has(s));

  const submit = async (decision: 'approve' | 'deny') => {
    setBusy(decision);
    setError('');
    try {
      const res = await fetch('/api/mcp/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          clientId: props.clientId,
          redirectUri: props.redirectUri,
          state: props.state,
          codeChallenge: props.codeChallenge,
          resource: props.resource,
          workspaceId,
          scopes: allowed,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.location) {
        setError(data.error_description || data.error || 'Could not complete the connection.');
        setBusy(null);
        return;
      }
      window.location.href = data.location;
    } catch {
      setError('Could not reach the server.');
      setBusy(null);
    }
  };

  // Where the authorization code is actually delivered, which is the part a lookalike client
  // cannot fake: it must match a redirect URI the client registered.
  const destination = (() => {
    try {
      const url = new URL(props.redirectUri);
      const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
        || url.hostname === '::1' || url.hostname === '[::1]';
      return { host: url.host, loopback };
    } catch {
      return { host: props.redirectUri, loopback: false };
    }
  })();

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 space-y-5">
        <div className="space-y-2">
          <Logo className="h-8 w-8" />
          <h1 className="text-xl font-semibold">Connect {props.clientName} to OSW Studio</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {props.accountEmail}. The connection covers one workspace and only the capabilities you tick.
          </p>
          {/* The name above is chosen by whoever registered the client, and registration is open,
              so it proves nothing. Where the approval is sent does: a client on this machine comes
              back to a loopback address, and anything else is a program somewhere on the internet. */}
          <p className="text-xs text-muted-foreground">
            Approval goes to{' '}
            <span className="font-mono text-foreground break-all">{destination.host}</span>
            {destination.loopback
              ? ' — software running on this machine.'
              : ' — a program on another machine. Only continue if you set it up.'}
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="mcp-workspace" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Workspace</label>
          <select
            id="mcp-workspace"
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          >
            {props.workspaces.map(w => (
              <option key={w.id} value={w.id}>{w.name} ({w.role})</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Allow {props.clientName} to</span>
          <ul className="space-y-1.5">
            {ACTIVE_SCOPES.map(scope => {
              const permitted = grantable.has(scope);
              return (
                <li key={scope} className="flex items-start gap-2.5">
                  <input
                    id={`scope-${scope}`}
                    type="checkbox"
                    className="mt-1"
                    disabled={!permitted}
                    checked={permitted && chosen.has(scope)}
                    onChange={(e) => {
                      const next = new Set(chosen);
                      if (e.target.checked) next.add(scope); else next.delete(scope);
                      setChosen(next);
                    }}
                  />
                  <label htmlFor={`scope-${scope}`} className={`text-sm ${permitted ? '' : 'text-muted-foreground'}`}>
                    {SCOPE_SUMMARY[scope]}
                    {!permitted && <span className="block text-xs">Needs a higher role than {role} in this workspace</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => submit('deny')} disabled={busy !== null}>
            {busy === 'deny' ? 'Cancelling…' : 'Cancel'}
          </Button>
          <Button size="sm" onClick={() => submit('approve')} disabled={busy !== null || allowed.length === 0}>
            {busy === 'approve' ? 'Connecting…' : 'Connect'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          You can revoke this from Settings at any time. Tokens expire and are refreshed by the connector.
        </p>
      </div>
    </main>
  );
}
