/**
 * The shared look of the built-in templates.
 *
 * Extracted from `deepstudio/osw-template-theme.html`, which is the spec. Its
 * section 07 is explicit: "Identical markup and identical component CSS. Only
 * token values differ." So this file is the component CSS, byte for byte, and a
 * template contributes nothing but its `:root`.
 *
 * Section 09 lists what a template may vary, and it is four things: accent hue,
 * whether it leans light or dark, density, and whether a serif appears at all.
 * Layout is not one of them. If a template seems to need a component this does
 * not have, add it here so every template gets it, rather than adding a rule to
 * one stylesheet.
 */

/** Every component rule, shared by all templates. */
export const TEMPLATE_COMPONENT_CSS = `* {
  box-sizing: border-box;
}

/*
 * The [hidden] attribute is a browser default, and any author rule beats a
 * browser default. So a component that sets its own display (.notice, .chat,
 * .list-item, an absolutely positioned fallback) stays on screen when a script
 * hides it, and the script looks like it did nothing. This is the one place
 * that can be fixed once for every template.
 */
[hidden] {
  display: none !important;
}

body {
  margin: 0;
  background: var(--canvas);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 1rem;
  font-weight: 400;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  transition: background var(--t-base) var(--ease), color var(--t-base) var(--ease);
}

::selection {
  background: var(--accent-soft);
  color: var(--accent-text);
}

.wrap {
  max-width: 940px;
  margin: 0 auto;
  padding: clamp(2rem,5vw,4rem) clamp(1.25rem,4vw,2.5rem) 6rem;
}

.prose {
  max-width: var(--measure);
}

h1, h2, h3, h4 {
  margin: 0;
  font-weight: 400;
  text-wrap: balance;
}

h1 {
  font-size: clamp(2.2rem,5vw,3.1rem);
  letter-spacing: -0.03em;
  line-height: 1.08;
}

h2 {
  font-size: clamp(1.3rem,2.4vw,1.7rem);
  letter-spacing: -0.02em;
  line-height: 1.12;
}

h3 {
  font-size: 1.0625rem;
  letter-spacing: -0.01em;
}

h4 {
  font-size: 0.9375rem;
}

p {
  margin: 0;
  max-width: var(--measure);
}

p + p {
  margin-top: 0.85rem;
}

a {
  color: var(--accent-text);
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}

code, .mono {
  font-family: var(--mono);
  font-size: 0.875em;
}

.label {
  font-family: var(--font-label);
  font-size: 0.6875rem;
  font-weight: var(--label-weight);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--accent-quiet);
}

.label-mono {
  --font-label: var(--mono);
  --label-weight: 500;
}

.muted {
  color: var(--ink-soft);
}

.faint {
  color: var(--ink-faint);
}

.keyline {
  border: 0;
  border-top: 1px solid var(--line);
  margin: 1.25rem 0;
}

.demo {
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  overflow: hidden;
  background: var(--canvas);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font: inherit;
  font-size: 0.90625rem;
  font-weight: 600;
  padding: 0.65rem 1.25rem;
  border-radius: var(--r-pill);
  border: 1px solid transparent;
  cursor: pointer;
  text-decoration: none;
  transition: transform var(--t-fast) var(--ease), background var(--t-fast) var(--ease),
                box-shadow var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease);
}

.btn:hover {
  transform: translateY(-2px);
}

.btn-primary {
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: var(--shadow-sm);
}

.btn-primary:hover {
  background: var(--accent-hover);
  box-shadow: var(--shadow-md);
}

.btn-line {
  background: var(--ink);
  color: var(--canvas);
  box-shadow: var(--shadow-sm);
}

.btn-line:hover {
  box-shadow: var(--shadow-md);
}

.btn-quiet {
  background: transparent;
  color: var(--ink);
  border-color: var(--line-strong);
}

.btn-quiet:hover {
  border-color: var(--ink-soft);
}

.btn-sm {
  font-size: 0.8125rem;
  padding: 0.4rem 0.85rem;
}

.btn:disabled {
  opacity: 0.45;
  cursor: default;
  transform: none;
  box-shadow: none;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field > span {
  font-size: 0.8125rem;
  color: var(--ink-soft);
}

.field input, .field textarea, .field select {
  font: inherit;
  font-size: 0.9375rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-md);
  background: var(--sunken);
  color: var(--ink);
  width: 100%;
}

.field textarea {
  resize: vertical;
  min-height: 5.5rem;
}

.field input::placeholder, .field textarea::placeholder {
  color: var(--ink-faint);
}

.field input:focus, .field textarea:focus {
  background: var(--raised);
}

.field .hint {
  font-size: 0.75rem;
  color: var(--ink-faint);
}

.field .err {
  font-size: 0.75rem;
  color: var(--stop);
}

.field.is-error input {
  border-color: var(--stop);
}

.tag {
  font-family: var(--mono);
  font-size: 0.6875rem;
  padding: 0.18rem 0.55rem;
  border-radius: var(--r-sm);
  background: var(--base);
  color: var(--ink-soft);
  border: 1px solid var(--line);
}

.tag-accent {
  background: var(--accent-soft);
  color: var(--accent-text);
  border-color: transparent;
}

.tag-ok {
  color: var(--ok);
}

.tag-warn {
  color: var(--warn);
}

.tag-stop {
  color: var(--stop);
}

.filter {
  font: inherit;
  font-size: 0.75rem;
  padding: 0.28rem 0.7rem;
  cursor: pointer;
  border-radius: var(--r-pill);
  border: 1px solid var(--line-strong);
  background: transparent;
  color: var(--ink-soft);
  transition: border-color var(--t-fast) var(--ease), color var(--t-fast) var(--ease);
}

.filter:hover {
  color: var(--ink);
  border-color: var(--ink-soft);
}

.filter[aria-pressed="true"] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}

.notice {
  display: flex;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-md);
  background: var(--base);
  font-size: 0.875rem;
  max-width: var(--measure);
}

.notice .bar {
  width: 2px;
  border-radius: 2px;
  flex-shrink: 0;
  background: var(--warn);
}

.notice-stop .bar {
  background: var(--stop);
}

.notice-ok .bar {
  background: var(--ok);
}

.list {
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  overflow: hidden;
}

.list-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem 1rem;
  background: var(--raised);
}

.list-item + .list-item {
  border-top: 1px solid var(--line);
}

.list-item:hover {
  background: var(--base);
}

.list-item .lead {
  font-size: 0.9375rem;
}

.list-item .sub {
  font-size: 0.8125rem;
  color: var(--ink-soft);
}

.table-scroll {
  overflow-x: auto;
}

table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.875rem;
  min-width: 30rem;
}

th, td {
  text-align: left;
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid var(--line);
}

th {
  font-family: var(--mono);
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ink-faint);
  font-weight: 500;
}

td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

pre {
  margin: 0;
  padding: 1rem;
  background: var(--sunken);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  overflow-x: auto;
  font-size: 0.8125rem;
  line-height: 1.6;
}

.site-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 0.85rem 1.25rem;
  border-bottom: 1px solid var(--line);
  background: var(--canvas);
}

.brand {
  font-size: 1.0625rem;
  letter-spacing: -0.015em;
  text-decoration: none;
  color: var(--ink);
}

.brand em {
  font-style: normal;
  color: var(--accent-text);
}

.site-nav {
  display: flex;
  gap: 1.35rem;
  align-items: center;
}

.site-nav a {
  font-size: 0.875rem;
  color: var(--ink-soft);
  text-decoration: none;
}

.site-nav a:hover {
  color: var(--ink);
}

.hero {
  padding: 3rem 1.25rem 3.25rem;
  background: var(--base);
  border-bottom: 1px solid var(--line);
}

.hero .lede {
  font-size: 1.0625rem;
  color: var(--ink-soft);
  max-width: 44ch;
  margin: 1rem 0 1.75rem;
}

.row-set {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px,1fr));
  gap: 1rem;
}

.card {
  padding: 1.35rem;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--raised);
}

.card p {
  font-size: 0.875rem;
  color: var(--ink-soft);
  margin: 0.5rem 0 0;
}

.card .from {
  margin-top: 0.9rem;
  font-size: 0.875rem;
  color: var(--ink);
}

.chat {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 1.25rem;
  background: var(--base);
}

.bubble {
  max-width: 82%;
  padding: 0.65rem 0.9rem;
  border-radius: var(--r-lg);
  font-size: 0.9375rem;
}

.bubble-bot {
  background: var(--raised);
  border: 1px solid var(--line);
  border-bottom-left-radius: 4px;
  align-self: flex-start;
}

.bubble-you {
  background: var(--accent);
  color: var(--on-accent);
  border-bottom-right-radius: 4px;
  align-self: flex-end;
}

.bubble-wait {
  color: var(--ink-faint);
  font-style: italic;
}

.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.9rem 1.25rem;
  border-top: 1px solid var(--line);
  background: var(--canvas);
}

.board {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px,1fr));
  gap: 1rem;
}

.col-head {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.col-count {
  font-family: var(--mono);
  font-size: 0.75rem;
  color: var(--ink-faint);
}

.task {
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 0.75rem 0.85rem;
  margin-bottom: 0.6rem;
}

.task .t {
  font-size: 0.9375rem;
}

.task .m {
  font-family: var(--mono);
  font-size: 0.6875rem;
  color: var(--ink-faint);
  margin-top: 0.35rem;
  display: block;
}

.task.done {
  opacity: 0.7;
}

.task.done .t {
  text-decoration: line-through;
  text-decoration-color: var(--ok);
}

.read {
  font-size: 1.0625rem;
  line-height: 1.75;
  max-width: 60ch;
  letter-spacing: 0.003em;
}

.read h3 {
  margin: 1.5rem 0 0.5rem;
}

.read ul {
  margin: 0 0 1rem 1.15rem;
  padding: 0;
}

.read li {
  margin-bottom: 0.35rem;
}

.read blockquote {
  margin: 0 0 1rem;
  padding-left: 1rem;
  border-left: 2px solid var(--line-strong);
  color: var(--ink-soft);
}

.read p {
  margin-bottom: 1rem;
}

.empty {
  padding: 2.5rem 1.5rem;
  text-align: center;
  color: var(--ink-soft);
}

.empty h3 {
  color: var(--ink);
  margin-bottom: 0.4rem;
}

.empty p {
  max-width: 42ch;
  margin: 0 auto;
  font-size: 0.9375rem;
}

.site-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 2rem;
  justify-content: space-between;
  padding: 1.25rem;
  border-top: 1px solid var(--line);
  font-size: 0.8125rem;
  color: var(--ink-faint);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
  }

  .btn:hover {
    transform: none;
  }
}`;

export interface TemplateTokens {
  /** The one accent, as an OKLCH hue. This is the main thing that distinguishes templates. */
  hue: number;
  /** Chroma at the accent. Greens and cyans cannot hold the 0.19 the artifact uses. */
  chroma?: number;
  /** Lightness of the accent fill. Tuned so white on it stays legible. */
  lightness?: number;
  /** Corner radius. The artifact tightens this to 6px for the library skin. */
  radius?: number;
  scheme?: 'light' | 'dark';
}

/**
 * The `:root` block for one template.
 *
 * Surfaces stay neutral on purpose. A warm ground under a muted accent is how
 * this drifted into a stock palette once already: the identity lives in the
 * accent, not in the paper.
 */
export function templateTokens(t: TemplateTokens): string {
  const hue = t.hue;
  const c = t.chroma ?? 0.19;
  const l = t.lightness ?? 0.57;
  const r = t.radius ?? 13;
  const dark = t.scheme === 'dark';

  const surfaces = dark
    ? ['--canvas: #0B0A08;', '--sunken: #0F0D0B;', '--base: #141210;', '--raised: #1C1814;',
       '--ink: #DCE4E2;', '--ink-soft: #93A09D;', '--ink-faint: #5C6866;',
       '--line: rgba(240,225,205,0.09);', '--line-strong: rgba(240,225,205,0.16);']
    : ['--canvas: #FFFFFF;', '--sunken: #F1F2F4;', '--base: #FAFAFA;', '--raised: #FFFFFF;',
       '--ink: #1D1813;', '--ink-soft: #5F574C;', '--ink-faint: #8A8073;',
       '--line: rgba(18,20,26,0.11);', '--line-strong: rgba(18,20,26,0.19);'];

  const semantic = dark
    ? ['--ok: #5BBD7A;', '--warn: #E0A93B;', '--stop: #E5485E;']
    : ['--ok: #2F7D4F;', '--warn: #8A6116;', '--stop: #B33A34;'];

  // The component CSS asks for both of these on every raised button. Omit them and nothing
  // errors; the buttons just sit flat on the page and the reason is invisible.
  const shadows = dark
    ? ['--shadow-sm: 0 2px 8px -2px rgba(0,0,0,0.5);',
       '--shadow-md: 0 8px 24px -6px rgba(0,0,0,0.6);']
    : ['--shadow-sm: 0 1px 2px rgba(40,28,16,0.06), 0 2px 8px -2px rgba(40,28,16,0.08);',
       '--shadow-md: 0 6px 20px -4px rgba(40,28,16,0.12);'];

  return [
    ':root {',
    `  color-scheme: ${dark ? 'dark' : 'light'};`,
    '',
    ...surfaces.map((s) => '  ' + s),
    '',
    `  --accent: oklch(${l} ${c} ${hue});`,
    `  --accent-hover: oklch(${(l + (dark ? 0.06 : -0.05)).toFixed(2)} ${c} ${hue});`,
    `  --accent-soft: oklch(${l} ${c} ${hue} / 0.12);`,
    `  --accent-text: oklch(${(l - (dark ? -0.15 : 0.07)).toFixed(2)} ${(c * 0.92).toFixed(3)} ${hue});`,
    `  --accent-quiet: oklch(${dark ? 0.62 : 0.48} 0.03 ${hue});`,
    '  --on-accent: #FFFFFF;',
    '',
    ...semantic.map((s) => '  ' + s),
    '',
    ...shadows.map((s) => '  ' + s),
    '',
    `  --r-sm: ${Math.max(4, Math.round(r * 0.46))}px; --r-md: ${Math.round(r * 0.7)}px; --r-lg: ${r}px; --r-pill: 999px;`,
    '',
    '  --t-fast: 130ms; --t-base: 200ms; --ease: cubic-bezier(.2,.7,.2,1);',
    '',
    '  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;',
    '  --serif: ui-serif, Georgia, "Times New Roman", serif;',
    '  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;',
    '  --font-label: var(--sans);',
    '  --label-weight: 500;',
    '',
    '  --measure: 66ch;',
    '}',
  ].join('\n');
}

/** A template's whole stylesheet: its tokens, then the shared components. */
export function templateStylesheet(tokens: TemplateTokens): string {
  return templateTokens(tokens) + '\n\n' + TEMPLATE_COMPONENT_CSS;
}
