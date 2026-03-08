/**
 * React Domain Prompt
 *
 * Per-project .PROMPT.md content for React/TypeScript projects.
 * Guides the AI to write TSX components, use CDN imports for npm packages,
 * and follow the /src/ directory structure.
 */

export const REACT_DOMAIN_PROMPT = `PROJECT TYPE: React + TypeScript (auto-bundled)

This project uses React with TypeScript. Source files are compiled by esbuild-wasm in the browser — no build tools or npm needed during development.

ARCHITECTURE:
- /index.html — HTML shell with <div id="root"> and <script type="module" src="/bundle.js">
- /src/main.tsx — Entry point: createRoot + render <App />
- /src/App.tsx — Root component
- /src/components/ — Reusable components (one per file)
- .css files — Imported directly in TSX: import "./styles.css"

WRITING COMPONENTS:
- Create components in /src/components/Name.tsx
- Use functional components with hooks
- No need for "import React" — JSX transform is automatic
- Export components as default or named exports

IMPORTING NPM PACKAGES:
- Import by package name — resolved via CDN automatically:
  import { useState } from "react";
  import { motion } from "framer-motion";
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
- Do NOT use react-router-dom (requires server-side config)

STATE MANAGEMENT:
- useState / useReducer for local state
- useContext for shared state
- For complex state: import { create } from "zustand"

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

IMPORTANT:
- The preview rebuilds automatically when any file changes
- React state is lost on rebuild (expected behavior)
- TypeScript types are stripped, not checked (like Vite)
- All imports resolve at runtime from esm.sh CDN — internet required`;
