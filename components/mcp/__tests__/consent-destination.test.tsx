// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ConsentForm } from '../consent-form';

/**
 * Registration is open by design, so `client_name` is whatever the registrant typed: a client
 * calling itself "Claude Code" and sending the code to its own host looked identical to the real
 * one. The redirect destination is the part that cannot be faked, because it has to match a URI
 * the client registered, so the screen shows it.
 */

let container: HTMLDivElement;
let root: Root;

function mount(redirectUri: string) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <ConsentForm
        clientName="Claude Code"
        clientId="c1"
        redirectUri={redirectUri}
        state=""
        codeChallenge="abc"
        resource=""
        accountEmail="me@example.test"
        workspaces={[{ id: 'w1', name: 'Mine', role: 'owner' }]}
        requestedScopes={[]}
        grantableByRole={{ w1: ['projects:read'] }}
      />
    );
  });
}

afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('the consent screen names where approval goes', () => {
  it('shows a remote host and warns about it', () => {
    mount('https://not-really-claude.example/callback');
    expect(container.textContent).toContain('not-really-claude.example');
    expect(container.textContent).toContain('another machine');
  });

  it('marks a loopback client as local', () => {
    mount('http://localhost:47100/callback');
    expect(container.textContent).toContain('localhost:47100');
    expect(container.textContent).toContain('this machine');
  });
});
