import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';

import { REVIEW_WIDGET_MARKER } from '@/lib/publishing/review-widget';
import { reviewApiBase } from '@/lib/review/api-base';
import { reviewCookieName } from '@/lib/review/session';
import { hashPassword } from '@/lib/auth/passwords';
import { getWorkspaceAdapter, closeWorkspaceAdapter } from '@/lib/vfs/adapters/server';
import { closeReviewDatabase } from '@/lib/vfs/adapters/sqlite-connection';
import type { SQLiteAdapter } from '@/lib/vfs/adapters/sqlite-adapter';
import type { Deployment, ReviewConfig, VirtualFile } from '@/lib/vfs/types';

/**
 * Publish → serve → comment, end to end.
 *
 * Every piece of review mode has unit tests, but the wiring between them had never run: the routes
 * were exercised only on their refusal paths, so no test had ever taken a cookie the entry route
 * minted and used it to fetch an asset, or written a comment through the API and read it back.
 * That seam — a real build on disk, a real signed cookie, a real per-deployment database — is what
 * this file drives.
 *
 * Three things are stubbed, and only three:
 *  - `server-only`, which is a bundler guard rather than behaviour;
 *  - `resolveDeployment`, so lookups land on a temp workspace instead of the system database;
 *  - `getSession`, so the caller is an anonymous visitor rather than a signed-in team member.
 *
 * Everything between them is the shipping code. `requireDeploymentAccess` runs for real (the
 * deployment resolves with no routing row, the legacy single-workspace shape it already allows),
 * as do the builder, the cookie minting and verification, the filesystem reads, the origin check,
 * the rate limiters and the SQLite writes.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  resolveDeployment: vi.fn(),
}));

// Marked 'server-only' for the bundler; the guard has to be neutralised to load it under vitest.
vi.mock('server-only', () => ({}));

// The caller is anonymous unless a test says otherwise. The real getSession reads next/headers,
// which has no request scope here.
vi.mock('@/lib/auth/session', () => ({ getSession: mocks.getSession }));

// Points deployment lookups at the temp workspace adapter instead of the system database's
// deployment_routing table.
vi.mock('@/lib/vfs/adapters/deployment-adapter', () => ({
  resolveDeployment: mocks.resolveDeployment,
}));

import { GET as reviewEntry, POST as reviewSubmitPassword } from '../[deploymentId]/route';
import { GET as reviewAsset } from '../[deploymentId]/[...path]/route';
import {
  GET as listComments,
  POST as createComment,
} from '../[deploymentId]/osw-api/comments/route';
import { PATCH as patchComment } from '../[deploymentId]/osw-api/comments/[id]/route';
import { PATCH as patchParticipant } from '../[deploymentId]/osw-api/participant/route';

const ORIGIN = 'http://localhost:3000';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 8, 7, 6, 5, 4]);
const HTML =
  '<html><head><title>Home</title><link rel="stylesheet" href="/styles/main.css"></head>' +
  '<body><h1>Reviewed site</h1><img src="/logo.png"></body></html>';
const PASSWORD = 'correct horse battery staple';

let dir: string;
let workspaceId: string;
let deploymentId: string;
let adapter: SQLiteAdapter;

async function addFile(filePath: string, content: string | ArrayBuffer, type: string) {
  await adapter.createFile({
    id: `f-${filePath}`, projectId: 'p1', path: filePath, name: filePath.slice(1),
    type, content, size: 16, createdAt: new Date(), updatedAt: new Date(),
  } as VirtualFile);
}

/** Create the deployment with the given review settings and run a real publish. */
async function publish(review: ReviewConfig) {
  await adapter.createDeployment({
    id: deploymentId, projectId: 'p1', name: 'Reviewed', enabled: true, review,
    createdAt: new Date(), updatedAt: new Date(),
  } as Deployment);

  const { buildStaticDeployment } = await import('@/lib/compiler/static-builder');
  const result = await buildStaticDeployment(deploymentId, workspaceId);
  expect(result.success).toBe(true);
}

/** Change review settings after publish, the way the owner closing a round would. */
async function setReview(review: ReviewConfig) {
  const deployment = await adapter.getDeployment(deploymentId);
  await adapter.updateDeployment({ ...deployment!, review });
}

const publicDir = () => path.join(dir, 'static', deploymentId);
const reviewDir = () => path.join(dir, 'deployments', deploymentId, 'review-build');
const readBuilt = (base: string, rel: string) => fs.readFileSync(path.join(base, rel), 'utf-8');

interface TestRequestInit {
  method?: string;
  body?: BodyInit;
  headers?: HeadersInit;
  /** Sent as the Cookie header, the way a browser would. */
  cookie?: string;
}

function request(url: string, init: TestRequestInit = {}): NextRequest {
  const { cookie, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest(url, { ...rest, headers });
}

/** The `name=value` pair a browser would send back, taken from the response's real Set-Cookie. */
function cookieFrom(response: Response): string {
  const header = response.headers.get('set-cookie');
  if (!header) throw new Error('response carried no Set-Cookie');

  const name = reviewCookieName(deploymentId);
  const pair = header
    .split(/,(?=\s*[^;=\s]+=)/)
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`));
  if (!pair) throw new Error(`no ${name} cookie in: ${header}`);

  return pair.split(';')[0];
}

/**
 * RFC 6265 §5.1.4 path-match, so a test can ask what a browser would actually send rather than
 * handing every request a cookie the browser may have scoped away.
 */
function pathMatches(cookiePath: string, requestPath: string): boolean {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/';
}

/** The Cookie header a browser would send to `requestPath`, given a response's Set-Cookie. */
function browserCookieHeader(response: Response, requestPath: string): string {
  const header = response.headers.get('set-cookie') ?? '';
  const sent: string[] = [];

  for (const raw of header.split(/,(?=\s*[^;=\s]+=)/)) {
    const [pair, ...attributes] = raw.trim().split(';');
    const pathAttribute = attributes
      .map(attribute => attribute.trim())
      .find(attribute => attribute.toLowerCase().startsWith('path='));
    const cookiePath = pathAttribute ? pathAttribute.slice('path='.length) : '/';
    if (pathMatches(cookiePath, requestPath)) sent.push(pair);
  }

  return sent.join('; ');
}

const entry = (cookie?: string) =>
  reviewEntry(request(`${ORIGIN}/review/${deploymentId}`, { cookie }), {
    params: Promise.resolve({ deploymentId }),
  });

const asset = (segments: string[], cookie?: string) =>
  reviewAsset(request(`${ORIGIN}/review/${deploymentId}/${segments.join('/')}`, { cookie }), {
    params: Promise.resolve({ deploymentId, path: segments }),
  });

function post(body: unknown, cookie: string, origin: string | null = ORIGIN) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (origin) headers.origin = origin;
  return createComment(
    request(`${ORIGIN}${reviewApiBase(deploymentId)}/comments`, {
      method: 'POST', body: JSON.stringify(body), headers, cookie,
    }),
    { params: Promise.resolve({ deploymentId }) }
  );
}

beforeEach(async () => {
  vi.clearAllMocks();

  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-review-e2e-'));
  // Fresh ids per test, because the adapter and the review-database connection are both cached in
  // module scope by id — reusing one would hand the next test a handle onto a deleted temp file.
  workspaceId = randomUUID();
  deploymentId = randomUUID();

  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
  vi.stubEnv('DEPLOYMENTS_DIR', path.join(dir, 'deployments'));
  vi.stubEnv('DEPLOYMENTS_STATIC_DIR', path.join(dir, 'static'));
  vi.stubEnv('SESSION_SECRET', 'test-session-secret-for-review-end-to-end');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', ORIGIN);

  adapter = getWorkspaceAdapter(workspaceId);
  await adapter.init();

  await adapter.createProject({
    id: 'p1', name: 'Reviewed', createdAt: new Date(), updatedAt: new Date(),
    settings: { runtime: 'static' },
  } as never);
  await addFile('/index.html', HTML, 'html');
  await addFile('/styles/main.css', 'body { color: red }', 'css');
  await addFile('/logo.png', PNG.buffer.slice(0) as ArrayBuffer, 'image');

  mocks.getSession.mockResolvedValue(null);
  // Re-read on every call so a mid-test change to the review settings is what the routes see,
  // exactly as a fresh database read would be in production.
  mocks.resolveDeployment.mockImplementation(async (id: string) => {
    const deployment = await adapter.getDeployment(id);
    // workspaceId null is the legacy single-workspace shape requireDeploymentAccess allows for an
    // authenticated caller, so the team path runs without stubbing the workspace check.
    return deployment ? { adapter, deployment, workspaceId: null } : null;
  });
});

afterEach(async () => {
  closeReviewDatabase(deploymentId);
  closeWorkspaceAdapter(workspaceId);
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('review mode — build', () => {
  it('writes a widget-bearing review copy alongside a clean public one', async () => {
    await publish({ enabled: true });

    const review = readBuilt(reviewDir(), 'index.html');
    expect(review).toContain(REVIEW_WIDGET_MARKER);
    expect(readBuilt(publicDir(), 'index.html')).not.toContain(REVIEW_WIDGET_MARKER);

    // Assets in the review copy are addressed through the gated route, not the public web root.
    expect(review).toContain(`/review/${deploymentId}/styles/main.css`);
    expect(review).toContain(`/review/${deploymentId}/logo.png`);
  });
});

describe('review mode — serve', () => {
  it('admits an anonymous visitor of an open review and mints a session', async () => {
    await publish({ enabled: true });

    const response = await entry();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('Reviewed site');
    expect(response.headers.get('set-cookie')).toContain(reviewCookieName(deploymentId));
  });

  it('serves an asset to the cookie the entry route just handed out', async () => {
    await publish({ enabled: true });
    const cookie = cookieFrom(await entry());

    const response = await asset(['styles', 'main.css'], cookie);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/css');
    // Compared against the built file rather than the source, since publishing minifies.
    expect(await response.text()).toBe(readBuilt(reviewDir(), 'styles/main.css'));
  });

  it('refuses the same asset to a caller with no cookie', async () => {
    await publish({ enabled: true });

    const response = await asset(['styles', 'main.css']);

    expect(response.status).toBe(404);
  });
});

describe('review mode — comments', () => {
  async function admitted(): Promise<string> {
    await publish({ enabled: true });
    return cookieFrom(await entry());
  }

  it('creates a comment for the participant in the cookie', async () => {
    const cookie = await admitted();

    const response = await post({ body: 'The hero image is stretched', page_path: '/index.html' }, cookie);

    expect(response.status).toBe(201);
    const { comment } = await response.json();
    expect(comment.body).toBe('The hero image is stretched');
    expect(comment.page_path).toBe('/index.html');
    expect(comment.is_team).toBe(false);
  });

  it('carries the session on the widget call a browser would actually make', async () => {
    // The tests around this one hand the cookie to the API by hand, which is not what happens in a
    // browser. The widget is served inside `/review/{id}/...` and calls the base in
    // lib/review/api-base.ts, while the session cookie is minted with `path: /review/{id}`
    // (lib/review/session.ts). Anything outside that prefix — `/api/review/{id}/comments`, where
    // these endpoints used to live — does not path-match, so the browser scopes the cookie away
    // from the one endpoint that needs it and every client comment arrives anonymous.
    await publish({ enabled: true });
    const admission = await entry();

    // Control on the helper: the same Set-Cookie does reach the review copy's own paths, so a
    // failure below is the scoping and not a mis-parsed header.
    expect(browserCookieHeader(admission, `/review/${deploymentId}/styles/main.css`)).toContain(
      reviewCookieName(deploymentId)
    );

    const apiPath = `${reviewApiBase(deploymentId)}/comments`;
    const cookie = browserCookieHeader(admission, apiPath);

    const response = await post({ body: 'Sent by the widget', page_path: '/index.html' }, cookie);

    expect(response.status).toBe(201);
  });

  it('refuses a comment posted from another origin', async () => {
    // Control for the test above: it proves the accepted POST was accepted on its origin and not
    // because the check is inert. A published site is attacker-authorable HTML on this same
    // instance, so the visitor's cookie is sent whether or not the page is the review copy.
    const cookie = await admitted();

    const response = await post(
      { body: 'posted by a page the visitor did not open', page_path: '/index.html' },
      cookie,
      'https://evil.example'
    );

    expect(response.status).toBe(403);
  });

  it('reads the comment back without any email on the wire', async () => {
    const cookie = await admitted();
    await post({ body: 'Needs a wider margin', page_path: '/index.html' }, cookie);

    // Stored so the digest mailer can reach them — and so the redaction below has something to hide.
    const named = await patchParticipant(
      request(`${ORIGIN}${reviewApiBase(deploymentId)}/participant`, {
        method: 'PATCH',
        body: JSON.stringify({ display_name: 'Dana', email: 'dana@client.example' }),
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        cookie,
      }),
      { params: Promise.resolve({ deploymentId }) }
    );
    expect(named.status).toBe(200);

    // Positive control: the address really is in the deployment's database, so the absence of it
    // below is redaction rather than the PATCH having quietly dropped it.
    const { participant } = await named.json();
    const { ReviewDatabase } = await import('@/lib/vfs/adapters/review-database');
    const stored = new ReviewDatabase(deploymentId);
    stored.init();
    expect(stored.getParticipant(participant.id)?.email).toBe('dana@client.example');

    const response = await listComments(
      request(`${ORIGIN}${reviewApiBase(deploymentId)}/comments`, { cookie }),
      { params: Promise.resolve({ deploymentId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.comments).toHaveLength(1);
    expect(payload.comments[0].body).toBe('Needs a wider margin');

    // Serialised whole, so a leak through a field nobody expected is caught too.
    const serialised = JSON.stringify(payload);
    expect(serialised).not.toContain('dana@client.example');
    expect(serialised).not.toMatch(/"[a-z_]*email[a-z_]*"\s*:/i);
  });

  it('lets only a team member resolve a comment', async () => {
    const cookie = await admitted();
    const created = await post({ body: 'Typo in the footer', page_path: '/index.html' }, cookie);
    const { comment } = await created.json();

    const patch = () =>
      patchComment(
        request(`${ORIGIN}${reviewApiBase(deploymentId)}/comments/${comment.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'resolved' }),
          headers: { 'content-type': 'application/json', origin: ORIGIN },
          cookie,
        }),
        { params: Promise.resolve({ deploymentId, id: comment.id }) }
      );

    expect((await patch()).status).toBe(403);

    mocks.getSession.mockResolvedValue({
      userId: 'u1', email: 'agency@example.com', isAdmin: false, exp: 253402300799,
    });

    const allowed = await patch();
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).comment.status).toBe('resolved');
  });
});

describe('review mode — refusals', () => {
  it('gates a password-protected review and opens it on the right password', async () => {
    await publish({ enabled: true, passwordHash: await hashPassword(PASSWORD) });

    const gate = await entry();
    expect(gate.status).toBe(200);
    const gateHtml = await gate.text();
    expect(gateHtml).toContain('name="password"');
    // The gate must not be the site, and must not be a 404 either — the client needs somewhere to
    // type the password they were sent.
    expect(gateHtml).not.toContain('Reviewed site');
    expect(gate.headers.get('set-cookie')).toBeNull();

    const submit = (password: string) => {
      const form = new FormData();
      form.set('password', password);
      return reviewSubmitPassword(
        new NextRequest(`${ORIGIN}/review/${deploymentId}`, { method: 'POST', body: form }),
        { params: Promise.resolve({ deploymentId }) }
      );
    };

    expect((await submit('not the password')).status).toBe(401);

    const accepted = await submit(PASSWORD);
    expect(accepted.status).toBe(303);

    const opened = await entry(cookieFrom(accepted));
    expect(opened.status).toBe(200);
    expect(await opened.text()).toContain('Reviewed site');
  });

  it('stops answering a cookie minted before the review expired', async () => {
    await publish({ enabled: true, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const cookie = cookieFrom(await entry());

    // Proof the cookie was good while the round was open, so the refusals below are the expiry.
    expect((await asset(['styles', 'main.css'], cookie)).status).toBe(200);

    await setReview({ enabled: true, expiresAt: new Date(Date.now() - 1_000).toISOString() });

    expect((await entry(cookie)).status).toBe(404);
    expect((await asset(['styles', 'main.css'], cookie)).status).toBe(404);
  });

  it('contains a traversal out of the review build', async () => {
    await publish({ enabled: true });
    const cookie = cookieFrom(await entry());

    // A sibling of the review build, inside the deployment directory: what a traversal one level
    // up would reach if the join were not contained.
    const secret = 'deployment-private-do-not-serve';
    const secretPath = path.join(dir, 'deployments', deploymentId, 'secret.txt');
    fs.writeFileSync(secretPath, secret);
    // Positive control: an uncontained join really would land on a readable file here.
    expect(fs.readFileSync(path.resolve(reviewDir(), '..', 'secret.txt'), 'utf-8')).toBe(secret);

    for (const segments of [
      ['..', 'secret.txt'],
      ['..', '..', '..', '..', 'etc', 'passwd'],
      // Next percent-decodes each segment after normalising the path, so `%2e%2e%2f` arrives here
      // as a single segment whose text is `../` — no `..` segment the router could have stripped.
      ['../secret.txt'],
      ['../../../../etc/passwd'],
    ]) {
      const response = await asset(segments, cookie);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain(secret);
    }
  });
});
