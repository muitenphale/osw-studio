/**
 * esbuild-wasm Bundler for React/TypeScript Projects
 *
 * Lazy-loads esbuild-wasm and bundles TSX/TS/JSX source files into a single
 * bundle.js (+ optional bundle.css). Bare npm imports are rewritten to esm.sh
 * CDN URLs and marked external so the browser fetches them at runtime.
 *
 * Only loaded when a project contains recognized entry points — existing
 * HTML/CSS/JS projects never trigger this module.
 */

import type { VirtualFile } from '../vfs/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BundleInput {
  files: VirtualFile[];
  entryPoint: string;
  cdnBase?: string;
}

export interface BundleOutput {
  js: string;
  css: string | null;
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Lazy esbuild singleton
// ---------------------------------------------------------------------------

let esbuildInstance: typeof import('esbuild-wasm') | null = null;
let initPromise: Promise<typeof import('esbuild-wasm')> | null = null;

async function ensureEsbuild(): Promise<typeof import('esbuild-wasm')> {
  if (esbuildInstance) return esbuildInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const esbuild = await import('esbuild-wasm');

      if (typeof window !== 'undefined') {
        await esbuild.initialize({ wasmURL: '/esbuild.wasm' });
      }

      esbuildInstance = esbuild;
      return esbuild;
    } catch (err) {
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}

// ---------------------------------------------------------------------------
// Entry point detection
// ---------------------------------------------------------------------------

const ENTRY_PRIORITY = [
  '/src/main.tsx',
  '/src/main.ts',
  '/src/index.tsx',
  '/src/index.ts',
  '/src/main.jsx',
  '/src/index.jsx',
  '/src/App.tsx',
  '/src/App.jsx',
  '/main.tsx',
  '/main.ts',
  '/index.tsx',
  '/index.ts',
];

/**
 * Returns the first matching entry point path, or null if the project
 * should use the existing HTML pipeline.
 */
export function detectBundleEntryPoint(files: VirtualFile[]): string | null {
  const paths = new Set(files.map(f => f.path));
  for (const candidate of ENTRY_PRIORITY) {
    if (paths.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Returns true for source file extensions that get compiled into the bundle
 * and should be excluded from direct serving.
 */
export function isBundleableSource(path: string): boolean {
  return /\.(tsx|ts|jsx)$/.test(path);
}

// ---------------------------------------------------------------------------
// VFS resolver plugin
// ---------------------------------------------------------------------------

const RESOLVE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.json', '.css',
  '/index.ts', '/index.tsx', '/index.js', '/index.jsx',
];

function createVfsPlugin(
  fileMap: Map<string, string>,
  cdnBase: string,
) {
  return {
    name: 'vfs-resolver',
    setup(build: import('esbuild-wasm').PluginBuild) {
      // Bare imports → CDN external
      build.onResolve({ filter: /^[^./]/ }, (args) => {
        // Skip esbuild internal or already-resolved
        if (args.path.startsWith('data:') || args.path.startsWith('https://') || args.path.startsWith('http://')) {
          return { external: true };
        }
        return {
          path: `${cdnBase}/${args.path}`,
          external: true,
        };
      });

      // Relative / absolute imports → resolve against VFS
      build.onResolve({ filter: /^[./]/ }, (args) => {
        let resolved = resolvePath(args.resolveDir, args.path);

        // Direct hit
        if (fileMap.has(resolved)) {
          const loader = loaderForPath(resolved);
          return { path: resolved, namespace: 'vfs', pluginData: { loader } };
        }

        // Extension probing
        for (const ext of RESOLVE_EXTENSIONS) {
          const candidate = resolved + ext;
          if (fileMap.has(candidate)) {
            const loader = loaderForPath(candidate);
            return { path: candidate, namespace: 'vfs', pluginData: { loader } };
          }
        }

        return { errors: [{ text: `Could not resolve "${args.path}" from "${args.resolveDir}"` }] };
      });

      // Load from VFS
      build.onLoad({ filter: /.*/, namespace: 'vfs' }, (args) => {
        const contents = fileMap.get(args.path);
        if (contents === undefined) {
          return { errors: [{ text: `File not found in VFS: ${args.path}` }] };
        }
        const loader = args.pluginData?.loader || loaderForPath(args.path);
        return {
          contents,
          loader: loader as import('esbuild-wasm').Loader,
          resolveDir: parentDir(args.path),
        };
      });
    },
  };
}

function resolvePath(dir: string, rel: string): string {
  if (rel.startsWith('/')) return rel;

  const parts = dir.split('/').filter(Boolean);
  for (const seg of rel.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return '/' + parts.join('/');
}

function parentDir(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx > 0 ? p.slice(0, idx) : '/';
}

function loaderForPath(p: string): string {
  const ext = p.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'tsx': return 'tsx';
    case 'ts': return 'ts';
    case 'jsx': return 'jsx';
    case 'js': case 'mjs': return 'js';
    case 'json': return 'json';
    case 'css': return 'css';
    default: return 'js';
  }
}

// ---------------------------------------------------------------------------
// Main bundle function
// ---------------------------------------------------------------------------

export async function bundleProject(input: BundleInput): Promise<BundleOutput> {
  const cdnBase = input.cdnBase || 'https://esm.sh';

  // Build file map (path → content string)
  const fileMap = new Map<string, string>();
  for (const file of input.files) {
    if (typeof file.content === 'string') {
      fileMap.set(file.path, file.content);
    }
  }

  const esbuild = await ensureEsbuild();

  const result = await esbuild.build({
    stdin: {
      contents: fileMap.get(input.entryPoint) || '',
      loader: loaderForPath(input.entryPoint) as import('esbuild-wasm').Loader,
      resolveDir: parentDir(input.entryPoint),
      sourcefile: input.entryPoint,
    },
    bundle: true,
    format: 'esm',
    target: ['es2020'],
    outdir: '/',
    write: false,
    jsx: 'automatic',
    jsxImportSource: `${cdnBase}/react`,
    plugins: [createVfsPlugin(fileMap, cdnBase)],
    logLevel: 'silent',
  });

  const errors = result.errors.map(
    e => `[esbuild] ${e.location ? `${e.location.file}:${e.location.line}:${e.location.column} ` : ''}${e.text}`
  );
  const warnings = result.warnings.map(
    w => `[esbuild] ${w.location ? `${w.location.file}:${w.location.line}:${w.location.column} ` : ''}${w.text}`
  );

  let js = '';
  let css: string | null = null;

  for (const file of result.outputFiles || []) {
    if (file.path.endsWith('.css')) {
      css = file.text;
    } else {
      js = file.text;
    }
  }

  return { js, css, errors, warnings };
}
