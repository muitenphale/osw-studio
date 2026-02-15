'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ExternalLink, Loader2, Terminal, TriangleAlert } from 'lucide-react';
import { ConnectionBadge } from '@/components/settings/connection-badge';
import { toast } from 'sonner';
import { configManager } from '@/lib/config/storage';
import { parseCodexAuthJson, connectCodex, disconnectCodex, checkCodexStatus } from '@/lib/auth/codex-auth';

interface CodexAuthPanelProps {
  onAuthChange?: () => void;
}

export function CodexAuthPanel({ onAuthChange }: CodexAuthPanelProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(() =>
    !!configManager.getCodexAuth()
  );
  const [pasteValue, setPasteValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const auth = configManager.getCodexAuth();

  const dispatchAuthEvent = useCallback((hasKey: boolean) => {
    onAuthChange?.();
    window.dispatchEvent(new CustomEvent('apiKeyUpdated', {
      detail: { provider: 'openai-codex', hasKey }
    }));
  }, [onAuthChange]);

  // Reconcile localStorage vs HttpOnly cookie on mount
  useEffect(() => {
    let cancelled = false;

    async function reconcile() {
      try {
        const hasCookie = await checkCodexStatus();
        if (cancelled) return;

        const localAuth = configManager.getCodexAuth();

        if (localAuth && !hasCookie) {
          // localStorage present but cookie gone (e.g., expired) → stale
          configManager.clearCodexAuth();
          if (!cancelled) {
            setIsAuthenticated(false);
            dispatchAuthEvent(false);
          }
        } else if (!localAuth && hasCookie) {
          // Orphaned cookie, no localStorage → clean up
          await disconnectCodex();
          if (!cancelled) {
            setIsAuthenticated(false);
            dispatchAuthEvent(false);
          }
        }
      } catch {
        // Network error — leave state as-is
      }
    }

    reconcile();
    return () => { cancelled = true; };
  }, [dispatchAuthEvent]);

  const handlePasteToken = async () => {
    setIsLoading(true);
    try {
      const parsed = parseCodexAuthJson(pasteValue);

      // Send to server — stores refresh_token in HttpOnly cookie
      const serverResult = await connectCodex(parsed);

      // Store only non-sensitive fields in localStorage
      configManager.setCodexAuth(serverResult);
      setIsAuthenticated(true);
      setPasteValue('');
      toast.success('Token saved! Tokens will refresh automatically.');
      dispatchAuthEvent(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid JSON';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    try {
      await disconnectCodex();
      configManager.clearModelCache('openai-codex');
      setIsAuthenticated(false);
      toast.success('Disconnected from ChatGPT');
      dispatchAuthEvent(false);
    } catch {
      toast.error('Failed to disconnect. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatExpiry = () => {
    if (!auth?.expires_at) return '';
    const diff = auth.expires_at - Math.floor(Date.now() / 1000);
    if (diff <= 0) return 'Expired (will auto-refresh)';
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  };

  const warningBanner = (
    <div className="p-2.5 border border-yellow-600/30 rounded-md bg-yellow-950/20 text-xs text-yellow-200/80 space-y-1">
      <div className="flex items-start gap-2">
        <TriangleAlert className="h-3.5 w-3.5 text-yellow-500 mt-0.5 shrink-0" />
        <div>
          <p>
            <span className="font-medium text-yellow-400">Use at your own risk.</span>{' '}
            This routes requests through an unofficial backend using your ChatGPT session token. Your token is sent to ChatGPT servers but the usage is outside the intended Codex CLI.
          </p>
          <p className="mt-1">
            OpenAI may restrict or revoke access to this endpoint at any time. For reliable, long-term use consider an{' '}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:underline">OpenAI API key</a>{' '}
            instead.
          </p>
        </div>
      </div>
    </div>
  );

  // --- Authenticated state ---
  if (isAuthenticated && auth) {
    return (
      <div className="space-y-3">
        {warningBanner}

        <ConnectionBadge
          method="ChatGPT"
          extra={auth.user_email}
          info={auth.expires_at ? `Expires in ${formatExpiry()}` : undefined}
          onDisconnect={handleDisconnect}
          disconnecting={isLoading}
        />
      </div>
    );
  }

  // --- Unauthenticated state ---
  return (
    <div className="space-y-3">
      <Label>ChatGPT Authentication</Label>
      <p className="text-xs text-muted-foreground">
        Use your ChatGPT Plus/Pro subscription instead of an API key.
        Tokens refresh automatically once connected.
      </p>

      {warningBanner}

      <div className="p-3 border rounded-md bg-muted/50 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Terminal className="h-4 w-4" />
          Setup Instructions
        </div>

        <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
          <li>
            Install the{' '}
            <a
              href="https://github.com/openai/codex"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-0.5"
            >
              Codex CLI <ExternalLink className="h-2.5 w-2.5" />
            </a>
            {': '}
            <code className="bg-muted px-1 rounded">npm i -g @openai/codex</code>
          </li>
          <li>
            Run <code className="bg-muted px-1 rounded">codex login</code> and follow the browser prompts
          </li>
          <li>
            Copy your token by running:<br />
            <code className="bg-muted px-1 rounded select-all">cat ~/.codex/auth.json | pbcopy</code>
            <span className="text-muted-foreground/60 ml-1">(macOS)</span>
            <br />
            <code className="bg-muted px-1 rounded select-all">cat ~/.codex/auth.json | xclip -sel c</code>
            <span className="text-muted-foreground/60 ml-1">(Linux)</span>
          </li>
          <li>
            Paste below with <code className="bg-muted px-1 rounded">Cmd+V</code> / <code className="bg-muted px-1 rounded">Ctrl+V</code>
          </li>
        </ol>
      </div>

      <div className="space-y-2">
        <Label htmlFor="codex-token" className="text-xs">Auth Token JSON</Label>
        <textarea
          id="codex-token"
          className="w-full h-24 text-xs font-mono p-2 rounded-md border bg-background resize-none"
          placeholder={'{\n  "access_token": "ey...",\n  "refresh_token": "v1.ey...",\n  "expires_at": 1234567890\n}'}
          value={pasteValue}
          onChange={(e) => setPasteValue(e.target.value)}
        />
        <Button
          size="sm"
          onClick={handlePasteToken}
          disabled={!pasteValue.trim() || isLoading}
        >
          {isLoading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
          Save Token
        </Button>
      </div>
    </div>
  );
}
