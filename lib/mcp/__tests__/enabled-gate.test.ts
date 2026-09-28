import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mcpEnabled } from '@/lib/mcp/auth';

/**
 * `MCP_ENABLED` is not sufficient on its own.
 *
 * Browser mode has no accounts, workspaces or sessions, so the endpoint has nothing to authorize
 * against: the consent screen cannot run and dynamic client registration would answer to anyone.
 * The docs list Server Mode as the first requirement and the MCP settings pane is already gated on
 * it, so a browser-mode instance that set the flag got a route no one could have intended.
 */
describe('mcpEnabled', () => {
  const saved = { mcp: process.env.MCP_ENABLED, server: process.env.NEXT_PUBLIC_SERVER_MODE };

  beforeEach(() => {
    delete process.env.MCP_ENABLED;
    delete process.env.NEXT_PUBLIC_SERVER_MODE;
  });

  afterEach(() => {
    if (saved.mcp === undefined) delete process.env.MCP_ENABLED; else process.env.MCP_ENABLED = saved.mcp;
    if (saved.server === undefined) delete process.env.NEXT_PUBLIC_SERVER_MODE; else process.env.NEXT_PUBLIC_SERVER_MODE = saved.server;
  });

  it('is on with the flag and server mode together', () => {
    process.env.MCP_ENABLED = 'true';
    process.env.NEXT_PUBLIC_SERVER_MODE = 'true';
    expect(mcpEnabled()).toBe(true);
  });

  it('is off in browser mode even with the flag set', () => {
    process.env.MCP_ENABLED = 'true';
    expect(mcpEnabled()).toBe(false);
  });

  it('is off in server mode without the flag', () => {
    process.env.NEXT_PUBLIC_SERVER_MODE = 'true';
    expect(mcpEnabled()).toBe(false);
  });

  it('is off with neither', () => {
    expect(mcpEnabled()).toBe(false);
  });
});
