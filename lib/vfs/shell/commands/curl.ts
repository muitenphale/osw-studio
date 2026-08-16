import type { ShellEnv, ShellResult } from '../types';
import { applyRedirectGuarded, ensureDirectory, normalizePath, truncate } from '../runtime';
import { base64ToArrayBuffer } from '@/lib/vfs/binary-encoding';
import { isExternalCurl } from '@/lib/llm/permissions';

/** `curl` — fetch a compiled page; -o writes the response. */
export async function curlCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId, args, ctx, redirect } = env;

          // curl localhost/path — fetch compiled HTML from preview engine
          // Flags: -s/--silent, -I/--head, -o FILE/--output FILE, -X METHOD, -H header, -d body
          const curlFlags = { silent: false, head: false, outputFile: '', method: '', headers: [] as string[], body: '', markdown: false };
          const curlUrls: string[] = [];

          for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (a === '-s' || a === '--silent') { curlFlags.silent = true; continue; }
            if (a === '-I' || a === '--head') { curlFlags.head = true; continue; }
            if (a === '--markdown') { curlFlags.markdown = true; continue; }
            if ((a === '-o' || a === '--output') && args[i + 1]) { curlFlags.outputFile = args[++i]; continue; }
            if ((a === '-X' || a === '--request') && args[i + 1]) { curlFlags.method = args[++i]; continue; }
            if ((a === '-H' || a === '--header') && args[i + 1]) { curlFlags.headers.push(args[++i]); continue; }
            if ((a === '-d' || a === '--data' || a === '--data-raw') && args[i + 1]) { curlFlags.body = args[++i]; continue; }
            if (!a.startsWith('-') && a) {
              // Assume http:// when no protocol is specified
              curlUrls.push(a.includes('://') ? a : 'http://' + a);
            }
          }

          if (curlUrls.length === 0) {
            return {
              stdout: '',
              stderr: `curl: no URL specified

  Usage: curl [OPTIONS] URL

  Options:
    -s, --silent     Suppress progress output
    -I, --head       Show response headers only
    -o, --output FILE  Write output to FILE
    --markdown       Convert fetched HTML to readable markdown

  Examples:
    curl localhost/                    - compiled index.html
    curl localhost/about               - compiled about page
    curl -I localhost/                 - response headers only
    curl -s localhost/ | grep '<title>'  - pipe to grep
    curl localhost/ > /output.html     - redirect to file
    curl https://example.com            - fetch an external page
    curl --markdown https://example.com - fetch and convert to readable markdown
    curl -o /logo.png https://.../x.png - download a binary asset into the project

  Localhost URLs fetch compiled HTML from the preview engine; external URLs are fetched through the outbound proxy.`,
              exitCode: 2
            };
          }

          // Per-URL fetch. Decides local-vs-external via the same classifier as the
          // permission gate so the runtime path and the gate stay in sync. Multiple
          // URLs are fetched in order and their output concatenated (like real curl),
          // while the whole batch is covered by one permission prompt.
          const fetchOneUrl = async (u: string): Promise<ShellResult> => {
          const external = isExternalCurl(['curl', u]);

          if (external) {
            // External curl requires the browser runtime (relative fetch to our own
            // API route). Server-side generation has no origin for '/api/web/fetch'.
            if (typeof window === 'undefined') {
              return { stdout: '', stderr: 'curl: external URLs require the browser runtime (open the app to fetch the internet).', exitCode: 1 };
            }
            try {
              const resp = await fetch('/api/web/fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  url: u,
                  method: curlFlags.method || (curlFlags.head ? 'HEAD' : 'GET'),
                  headers: curlFlags.headers,
                  body: curlFlags.body || undefined,
                }),
              });
              const data = await resp.json();
              if (data.error) {
                return { stdout: '', stderr: `curl: ${data.error}`, exitCode: 1 };
              }

              // Write to file (-o). Binary content is base64; decode to bytes.
              if (curlFlags.outputFile) {
                const outPath = normalizePath(curlFlags.outputFile);
                if (!outPath) return { stdout: '', stderr: 'curl: -o: missing file path', exitCode: 2 };
                const dirPath = outPath.split('/').slice(0, -1).join('/') || '/';
                if (dirPath !== '/') await ensureDirectory(vfs, projectId, dirPath);
                const content: string | ArrayBuffer =
                  data.encoding === 'base64' ? base64ToArrayBuffer(data.body) : data.body;
                try { await vfs.createFile(projectId, outPath, content); }
                catch { await vfs.updateFile(projectId, outPath, content); }
                const msg = curlFlags.silent ? '' : `Saved to ${outPath}`;
                return { stdout: msg, stderr: '', exitCode: 0 };
              }

              // Headers only (-I / HEAD)
              if (curlFlags.head) {
                const headers = [`HTTP/1.1 ${data.status} OK`, `Content-Type: ${data.contentType}`, ''].join('\n');
                if (redirect) return applyRedirectGuarded(vfs, projectId, headers, redirect, ctx);
                return { stdout: headers, stderr: '', exitCode: 0 };
              }

              let out: string;
              if (data.encoding === 'base64') {
                out = '[binary content omitted; use -o FILE to save]';
              } else {
                out = data.body || '';
                if (curlFlags.markdown) {
                  const { htmlToMarkdown } = await import('@/lib/web/extract');
                  out = htmlToMarkdown(out, u);
                }
              }
              const curlResult: ShellResult = { stdout: truncate(out), stderr: '', exitCode: 0 };
              if (redirect) return applyRedirectGuarded(vfs, projectId, curlResult.stdout, redirect, ctx);
              return curlResult;
            } catch (e: any) {
              return { stdout: '', stderr: `curl: request failed: ${e?.message || 'network error'}`, exitCode: 1 };
            }
          }

          // Extract path from URL
          let urlPath = '/';
          try {
            const parsed = new URL(u);
            urlPath = parsed.pathname || '/';
          } catch {
            // Fallback: extract path manually
            const pathMatch = u.match(/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/.*)?$/i);
            urlPath = pathMatch?.[1] || '/';
          }

          // Resolve path to VFS file path
          // / → /index.html
          // /about → /about.html
          // /about.html → /about.html
          // /products/ → /products/index.html
          let resolvedPath = urlPath;
          if (resolvedPath === '/') {
            resolvedPath = '/index.html';
          } else if (resolvedPath.endsWith('/')) {
            resolvedPath = resolvedPath + 'index.html';
          } else if (!resolvedPath.includes('.')) {
            resolvedPath = resolvedPath + '.html';
          }

          try {
            // Dynamic import VirtualServer to avoid adding to cli-shell's initial bundle
            const { VirtualServer } = await import('@/lib/preview/virtual-server');
            const project = await vfs.getProject(projectId);
            const server = new VirtualServer(vfs, projectId, { runtime: project?.settings?.runtime });
            const compiled = await server.getCompiledFile(resolvedPath);

            if (!compiled) {
              return {
                stdout: '',
                stderr: `curl: 404 Not Found — ${resolvedPath}\n\nThe file does not exist in the project. Check the path and try again.\n\nResolved: ${urlPath} → ${resolvedPath}`,
                exitCode: 1
              };
            }

            let content = typeof compiled.content === 'string' ? compiled.content : '';

            // Strip preview instrumentation (asset interceptor + console capture) —
            // only relevant inside the preview iframe, pure noise for the LLM
            const { stripPreviewScripts } = await import('@/lib/preview/strip-preview-scripts');
            content = stripPreviewScripts(content);

            // Same reason, one layer down: preview-only element provenance. This runs *before* the
            // -o branch below, which is the one path in the app that writes a compiled artifact
            // back into project source — a leak there is permanent, not just noise in the output.
            // Belt and braces: the VirtualServer above is constructed without the provenance
            // option, so there should be nothing to strip.
            const { stripProvenance } = await import('@/lib/preview/provenance');
            content = stripProvenance(content);

            if (curlFlags.head) {
              // Headers only
              const headers = [
                'HTTP/1.1 200 OK',
                `Content-Type: ${compiled.mimeType || 'text/html'}`,
                `Content-Length: ${new TextEncoder().encode(content).length}`,
                ''
              ].join('\n');
              const headResult: ShellResult = { stdout: headers, stderr: '', exitCode: 0 };
              if (redirect) return applyRedirectGuarded(vfs, projectId, headResult.stdout, redirect, ctx);
              return headResult;
            }

            if (curlFlags.outputFile) {
              // Write to file
              const outPath = normalizePath(curlFlags.outputFile);
              if (!outPath) return { stdout: '', stderr: 'curl: -o: missing file path', exitCode: 2 };
              const dirPath = outPath.split('/').slice(0, -1).join('/') || '/';
              if (dirPath !== '/') await ensureDirectory(vfs, projectId, dirPath);
              try { await vfs.createFile(projectId, outPath, content); }
              catch { await vfs.updateFile(projectId, outPath, content); }
              const msg = curlFlags.silent ? '' : `  % Total    Received\n  100  ${content.length}    ${content.length}\n\nSaved to ${outPath}`;
              return { stdout: msg, stderr: '', exitCode: 0 };
            }

            // Default: return compiled HTML
            const curlResult: ShellResult = { stdout: truncate(content), stderr: '', exitCode: 0 };
            if (redirect) return applyRedirectGuarded(vfs, projectId, curlResult.stdout, redirect, ctx);
            return curlResult;
          } catch (e: any) {
            // Compilation errors from Handlebars are still useful for the LLM
            return { stdout: '', stderr: `curl: error compiling ${resolvedPath}: ${e?.message || 'unknown error'}`, exitCode: 1 };
          }
          };

          // Single URL: behave exactly as before (including redirect handling).
          if (curlUrls.length === 1) {
            return await fetchOneUrl(curlUrls[0]);
          }

          // Multiple URLs: fetch each in order and concatenate output (like real curl).
          const curlStdouts: string[] = [];
          const curlStderrs: string[] = [];
          let curlExitCode = 0;
          for (const u of curlUrls) {
            const r = await fetchOneUrl(u);
            if (r.stdout) curlStdouts.push(r.stdout);
            if (r.stderr) curlStderrs.push(r.stderr);
            if (r.exitCode !== 0) curlExitCode = 1;
          }
          return {
            stdout: curlStdouts.join('\n\n'),
            stderr: curlStderrs.join('\n'),
            exitCode: curlExitCode,
          };
}
