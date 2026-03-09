export const PREACT_DOMAIN_PROMPT = `PROJECT TYPE: Preact + TypeScript (auto-bundled)

This project uses Preact with TypeScript. Source files are compiled by esbuild-wasm in the browser — no build tools or npm needed during development.

ARCHITECTURE:
- /index.html — HTML shell with <div id="root"> and <script type="module" src="/bundle.js">
- /src/main.tsx — Entry point: render(<App />, document.getElementById("root")!)
- /src/App.tsx — Root component
- /src/components/ — Reusable components (one per file)
- .css files — Imported directly in TSX: import "./styles.css"

WRITING COMPONENTS:
- Create components in /src/components/Name.tsx
- Use functional components with hooks
- No need for "import { h }" — JSX transform is automatic (jsxImportSource: preact)
- Export components as default or named exports

PREACT-SPECIFIC APIs:
- Hooks: import { useState, useEffect, useRef, useMemo } from "preact/hooks"
- Signals (reactive state): import { signal, computed } from "@preact/signals"
  const count = signal(0);
  count.value++; // auto-updates all subscribers
- Entry: import { render } from "preact"
- Compat: import from "preact/compat" for React-compatible libraries

IMPORTING NPM PACKAGES:
- Import by package name — resolved via CDN automatically:
  import { useState } from "preact/hooks";
  import { signal } from "@preact/signals";
  import confetti from "canvas-confetti";
  import { format } from "date-fns";
- Do NOT use require() or CommonJS
- Do NOT create node_modules or package.json

CSS STYLING:
- Import CSS files directly: import "./App.css"
- CSS modules are NOT supported — use plain CSS with unique class names
- For Tailwind CSS, add to index.html <head>: <script src="https://cdn.tailwindcss.com"></script>
- For other CSS frameworks, use CDN links in index.html

ROUTING (Single Page App):
- Use hash-based routing for SPAs: window.location.hash
- Example: #/about, #/contact
- Create a simple router component or use a hash-based approach

STATE MANAGEMENT:
- useState / useReducer from "preact/hooks" for local state
- Signals from "@preact/signals" for reactive shared state (preferred)
- useContext for shared state when needed

FILE STRUCTURE EXAMPLE:
/index.html
/src/main.tsx
/src/App.tsx
/src/App.css
/src/components/Header.tsx
/src/components/Footer.tsx
/src/components/Button.tsx
/src/hooks/useLocalStorage.ts
/src/utils/helpers.ts

DO NOT:
- Create .hbs / .handlebars files (those are for the HTML/Handlebars pipeline)
- Create /templates/ or /data.json (Handlebars-specific)
- Write vanilla DOM manipulation (document.getElementById, etc.)
- Use require() or CommonJS modules
- Create build configs (vite.config.ts, webpack.config.js, etc.)
- Try to install packages with npm/yarn
- Import from "react" — use "preact/hooks" and "preact/compat" instead

IMPORTANT:
- The preview rebuilds automatically when any file changes
- Component state is lost on rebuild (expected behavior)
- TypeScript types are stripped, not checked (like Vite)
- All imports resolve at runtime from esm.sh CDN — internet required
- Preact is ~3KB — much smaller than React, same API`;
