/**
 * The password page for a review copy.
 *
 * Deliberately a hand-written string rather than a React page. This is served to a client with no
 * account, on whatever network their office runs, and it is the only door to the review copy — so
 * it carries no stylesheet, no font, no script and no image. Anything it referenced off-page would
 * be one more thing that can fail between the client and the site they were asked to look at.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #fafaf9; color: #1c1917;
  }
  main { width: 100%; max-width: 360px; }
  h1 { margin: 0 0 6px; font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
  p.lede { margin: 0 0 22px; color: #78716c; font-size: 14px; }
  form { display: flex; flex-direction: column; gap: 10px; }
  label { font-size: 13px; font-weight: 500; }
  input {
    width: 100%; padding: 10px 12px; font: inherit; color: inherit;
    background: #fff; border: 1px solid #d6d3d1; border-radius: 8px;
  }
  input:focus-visible { outline: 2px solid #ea7317; outline-offset: 1px; border-color: #ea7317; }
  button {
    margin-top: 4px; padding: 10px 14px; font: inherit; font-weight: 550; cursor: pointer;
    color: #b45309; background: rgba(234, 115, 23, 0.15);
    border: 1px solid rgba(234, 115, 23, 0.3); border-radius: 8px;
  }
  button:hover { background: rgba(234, 115, 23, 0.22); }
  .error {
    margin: 0 0 14px; padding: 9px 12px; font-size: 13px; border-radius: 8px;
    color: #b91c1c; background: rgba(220, 38, 38, 0.1);
    border: 1px solid rgba(220, 38, 38, 0.25);
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0c0a09; color: #f5f5f4; }
    p.lede { color: #a8a29e; }
    input { background: #1c1917; border-color: #44403c; }
    .error { color: #fca5a5; }
  }
`;

export interface ReviewPasswordPageOptions {
  deploymentId: string;
  /** The deployment's name, chosen by a workspace member — escaped, never trusted as markup. */
  name?: string;
  error?: string;
}

export function renderReviewPasswordPage({
  deploymentId,
  name,
  error,
}: ReviewPasswordPageOptions): string {
  const heading = name ? escapeHtml(name) : 'Private review';
  const errorBlock = error ? `<p class="error">${escapeHtml(error)}</p>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Private review</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>${heading}</h1>
<p class="lede">This review copy is password protected. Enter the password you were sent.</p>
${errorBlock}
<form method="post" action="/review/${encodeURIComponent(deploymentId)}">
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
<button type="submit">View site</button>
</form>
</main>
</body>
</html>`;
}
