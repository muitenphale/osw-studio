'use client';

import { useEffect, useRef, MutableRefObject } from 'react';
import type { Monaco } from '@monaco-editor/react';
import type { IDisposable } from 'monaco-editor';
import { vfs } from '@/lib/vfs';
import { logger } from '@/lib/utils';
import type { ProjectRuntime } from '@/lib/vfs/types';
import { getRuntimeConfig } from '@/lib/runtimes/registry';

// Module-level cache: CDN types fetched once per session
let cachedJsxTypes: Map<string, string> | null = null;
let fetchingJsxTypes: Promise<Map<string, string>> | null = null;

const CDN_TYPE_FILES = [
  { url: 'https://cdn.jsdelivr.net/npm/@types/react@19/index.d.ts', path: 'file:///node_modules/@types/react/index.d.ts' },
  { url: 'https://cdn.jsdelivr.net/npm/@types/react@19/jsx-runtime.d.ts', path: 'file:///node_modules/@types/react/jsx-runtime.d.ts' },
  { url: 'https://cdn.jsdelivr.net/npm/@types/react@19/global.d.ts', path: 'file:///node_modules/@types/react/global.d.ts' },
  { url: 'https://cdn.jsdelivr.net/npm/@types/react-dom@19/index.d.ts', path: 'file:///node_modules/@types/react-dom/index.d.ts' },
  { url: 'https://cdn.jsdelivr.net/npm/@types/react-dom@19/client.d.ts', path: 'file:///node_modules/@types/react-dom/client.d.ts' },
];

async function fetchJsxTypes(): Promise<Map<string, string>> {
  if (cachedJsxTypes) return cachedJsxTypes;
  if (fetchingJsxTypes) return fetchingJsxTypes;

  fetchingJsxTypes = (async () => {
    const types = new Map<string, string>();
    const results = await Promise.allSettled(
      CDN_TYPE_FILES.map(async ({ url, path }) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
        const text = await res.text();
        return { path, text };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        types.set(result.value.path, result.value.text);
      } else {
        logger.warn('Failed to fetch type definition:', result.reason);
      }
    }

    cachedJsxTypes = types;
    fetchingJsxTypes = null;
    return types;
  })();

  return fetchingJsxTypes;
}

const TS_EXTENSIONS = /\.(ts|tsx|js|jsx)$/;

export function useTypescriptIntelliSense(
  projectId: string,
  runtime: ProjectRuntime | undefined,
  monacoRef: MutableRefObject<Monaco | null>
) {
  const isJsx = runtime ? getRuntimeConfig(runtime).jsxImportSource != null : false;

  // Track disposables for cleanup
  const typeDisposablesRef = useRef<IDisposable[]>([]);
  const fileDisposablesRef = useRef<Map<string, IDisposable>>(new Map());

  // --- (a) Compiler options ---
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco || !isJsx) return;

    const ts = monaco.languages.typescript;

    ts.typescriptDefaults.setCompilerOptions({
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      allowJs: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      allowNonTsExtensions: true,
      noEmit: true,
      isolatedModules: true,
      skipLibCheck: true,
      strict: false,
    });

    // Also reduce diagnostic noise
    ts.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });

    return () => {
      // Reset to defaults on cleanup
      ts.typescriptDefaults.setCompilerOptions({});
      ts.typescriptDefaults.setDiagnosticsOptions({});
    };
  }, [isJsx, monacoRef]);

  // --- (b) React type definitions from CDN ---
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco || !isJsx) return;

    let cancelled = false;
    const ts = monaco.languages.typescript;

    fetchJsxTypes().then((types) => {
      if (cancelled) return;

      const disposables: IDisposable[] = [];
      for (const [path, content] of types) {
        const disposable = ts.typescriptDefaults.addExtraLib(content, path);
        disposables.push(disposable);
      }
      typeDisposablesRef.current = disposables;
    });

    return () => {
      cancelled = true;
      for (const d of typeDisposablesRef.current) {
        d.dispose();
      }
      typeDisposablesRef.current = [];
    };
  }, [isJsx, monacoRef]);

  // --- (c) Project file sync ---
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco || !isJsx) return;

    const ts = monaco.languages.typescript;
    const fileMap = fileDisposablesRef.current;

    // Register a single file as an extra lib
    function registerFile(path: string, content: string) {
      const uri = `file://${path}`;
      // Dispose previous registration if exists
      fileMap.get(path)?.dispose();
      const disposable = ts.typescriptDefaults.addExtraLib(content, uri);
      fileMap.set(path, disposable);
    }

    // Initial load of all project files
    async function loadProjectFiles() {
      try {
        await vfs.init();
        const files = await vfs.listFiles(projectId);
        for (const file of files) {
          if (TS_EXTENSIONS.test(file.path) && typeof file.content === 'string') {
            registerFile(file.path, file.content);
          }
        }
      } catch (err) {
        logger.warn('Failed to load project files for IntelliSense:', err);
      }
    }

    loadProjectFiles();

    // Listen for file changes (debounced)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function handleFilesChanged() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          await vfs.init();
          const files = await vfs.listFiles(projectId);

          const currentPaths = new Set<string>();
          for (const file of files) {
            if (TS_EXTENSIONS.test(file.path) && typeof file.content === 'string') {
              currentPaths.add(file.path);
              registerFile(file.path, file.content);
            }
          }

          // Remove files that no longer exist
          for (const [path, disposable] of fileMap) {
            if (!currentPaths.has(path)) {
              disposable.dispose();
              fileMap.delete(path);
            }
          }
        } catch (err) {
          logger.warn('Failed to sync project files for IntelliSense:', err);
        }
      }, 300);
    }

    window.addEventListener('filesChanged', handleFilesChanged);

    return () => {
      window.removeEventListener('filesChanged', handleFilesChanged);
      if (debounceTimer) clearTimeout(debounceTimer);
      // Dispose all registered files
      for (const d of fileMap.values()) {
        d.dispose();
      }
      fileMap.clear();
    };
  }, [isJsx, projectId, monacoRef]);
}
