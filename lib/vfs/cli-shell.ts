import { VirtualFileSystem } from './index';

export type ShellOpts = {
  cwd?: string;
  timeoutMs?: number;
};

export type ShellResult = {
  stdout: string;
  stderr: string;
  exitCode: number; // 0 success
};

const TRUNCATE_CHARS = 100000;

function truncate(out: string): string {
  if (out.length > TRUNCATE_CHARS) {
    return out.slice(0, TRUNCATE_CHARS) + "\n… [truncated]";
  }
  return out;
}

function normalizePath(p?: string): string | undefined {
  if (!p) return p;
  if (p.startsWith('/workspace')) {
    const rest = p.slice('/workspace'.length);
    p = rest.length ? rest : '/';
  }
  if (!p.startsWith('/')) p = '/' + p;
  return p;
}

async function ensureDirectory(vfs: VirtualFileSystem, projectId: string, path: string) {
  if (path === '/' || !path) return;
  const parts = path.split('/').filter(Boolean);
  let cur = '';
  for (let i = 0; i < parts.length; i++) {
    cur = '/' + parts.slice(0, i + 1).join('/');
    try {
      // relies on createDirectory being idempotent
      await vfs.createDirectory(projectId, cur);
    } catch {
      // ignore
    }
  }
}

async function vfsShellExecute(
  vfs: VirtualFileSystem,
  projectId: string,
  cmd: string[],
  _opts: ShellOpts = {}
): Promise<ShellResult> {
  // Validate inputs
  if (!projectId || typeof projectId !== 'string') {
    return { stdout: '', stderr: 'Invalid project ID provided', exitCode: 2 };
  }

  if (!cmd || cmd.length === 0) {
    return { stdout: '', stderr: 'No command provided', exitCode: 2 };
  }

  // Filter out empty/undefined arguments
  const cleanCmd = cmd.filter(arg => arg !== undefined && arg !== null && arg !== '');
  if (cleanCmd.length === 0) {
    return { stdout: '', stderr: 'No valid command arguments provided', exitCode: 2 };
  }

  // Handle && command chaining - execute sequentially, stop on first failure
  if (cleanCmd.some(arg => arg === '&&')) {
    const commands: string[][] = [];
    let currentCmd: string[] = [];

    for (const arg of cleanCmd) {
      if (arg === '&&') {
        if (currentCmd.length > 0) {
          commands.push(currentCmd);
          currentCmd = [];
        }
      } else {
        currentCmd.push(arg);
      }
    }
    if (currentCmd.length > 0) {
      commands.push(currentCmd);
    }

    // Execute commands sequentially
    const allStdout: string[] = [];
    const allStderr: string[] = [];

    for (const singleCmd of commands) {
      const result = await vfsShellExecuteSingle(vfs, projectId, singleCmd, _opts);
      if (result.stdout) allStdout.push(result.stdout);
      if (result.stderr) allStderr.push(result.stderr);

      // Stop on first failure (that's && semantics)
      if (result.exitCode !== 0) {
        return {
          stdout: allStdout.join('\n'),
          stderr: allStderr.join('\n'),
          exitCode: result.exitCode
        };
      }
    }

    return {
      stdout: allStdout.join('\n'),
      stderr: allStderr.join('\n'),
      exitCode: 0
    };
  }

  return vfsShellExecuteSingle(vfs, projectId, cleanCmd, _opts);
}

async function vfsShellExecuteSingle(
  vfs: VirtualFileSystem,
  projectId: string,
  cleanCmd: string[],
  _opts: ShellOpts = {}
): Promise<ShellResult> {
  // Detect unsupported pipe operator
  if (cleanCmd.some(arg => arg === '|' || arg.includes('|'))) {
    return {
      stdout: '',
      stderr: 'Pipes (|) are not supported in the VFS shell. Commands run independently.\n\nInstead of piping commands, use the appropriate flags:\n  head -n 20 /file.txt      (first 20 lines)\n  tail -n 20 /file.txt      (last 20 lines)\n  rg -C 3 "pattern" /file   (search with context)',
      exitCode: 2
    };
  }

  const [program, ...args] = cleanCmd;

  try {
    switch (program) {
      case 'ls': {
        // Support basic flags like -R (recursive). Ignore unknown flags gracefully.
        const flags = new Set<string>();
        const paths: string[] = [];
        for (const a of args) {
          if (a && a.startsWith('-')) flags.add(a);
          else if (a) paths.push(a);
        }
        const recursive = flags.has('-R') || flags.has('-r');
        const path = normalizePath(paths[0]) || '/';
        if (!recursive) {
          const files = await vfs.listDirectory(projectId, path, { includeTransient: true });
          const lines = files.map(f => f.path).sort().join('\n');
          return { stdout: truncate(lines), stderr: '', exitCode: 0 };
        } else {
          const entries = await vfs.getAllFilesAndDirectories(projectId, { includeTransient: true });
          const prefix = path === '/' ? '/' : (path.endsWith('/') ? path : path + '/');
          const res = entries
            .filter((e: any) => e.path === path || e.path.startsWith(prefix))
            .map((e: any) => e.path)
            .sort()
            .join('\n');
          return { stdout: truncate(res), stderr: '', exitCode: 0 };
        }
      }
      case 'tree': {
        // tree [path] [-L depth]
        let maxDepth = Infinity;
        let targetPath = '/';

        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (a === '-L' && args[i + 1]) {
            maxDepth = parseInt(args[++i]) || Infinity;
          } else if (!a.startsWith('-')) {
            targetPath = a;
          }
        }

        const basePath = normalizePath(targetPath) || '/';
        const entries = await vfs.getAllFilesAndDirectories(projectId, { includeTransient: true });
        const prefix = basePath === '/' ? '' : basePath;

        // Build a set of all paths including implied directories
        const allPaths = new Set<string>();
        const dirPaths = new Set<string>();

        for (const entry of entries) {
          const entryPath = entry.path;
          // Only include entries under the target path
          if (basePath !== '/' && !entryPath.startsWith(basePath + '/') && entryPath !== basePath) {
            continue;
          }

          allPaths.add(entryPath);
          const isDir = 'type' in entry && entry.type === 'directory';
          if (isDir) dirPaths.add(entryPath);

          // Add implied parent directories (for transient files like /.skills/foo.md)
          const parts = entryPath.split('/').filter(Boolean);
          let currentPath = '';
          for (let i = 0; i < parts.length - 1; i++) {
            currentPath += '/' + parts[i];
            if (!allPaths.has(currentPath)) {
              allPaths.add(currentPath);
              dirPaths.add(currentPath);
            }
          }
        }

        // Convert to sorted array, filtering by base path and depth
        const sortedPaths = Array.from(allPaths)
          .filter(p => {
            if (basePath === '/') return p !== '/';
            return p.startsWith(basePath + '/') || p === basePath;
          })
          .sort();

        // Build tree output with proper indentation
        interface TreeNode {
          name: string;
          path: string;
          isDir: boolean;
          children: TreeNode[];
        }

        // Build tree structure
        const root: TreeNode = { name: basePath === '/' ? '.' : basePath.split('/').pop() || '.', path: basePath, isDir: true, children: [] };
        const nodeMap = new Map<string, TreeNode>();
        nodeMap.set(basePath === '/' ? '' : basePath, root);

        for (const p of sortedPaths) {
          if (p === basePath) continue;
          const relativePath = basePath === '/' ? p : p.slice(basePath.length);
          const parts = relativePath.split('/').filter(Boolean);
          const depth = parts.length;
          if (depth > maxDepth) continue;

          const name = parts[parts.length - 1];
          const parentPath = basePath === '/'
            ? '/' + parts.slice(0, -1).join('/')
            : basePath + '/' + parts.slice(0, -1).join('/');
          const normalizedParent = parentPath === '/' ? '' : parentPath.replace(/\/$/, '');

          const node: TreeNode = {
            name,
            path: p,
            isDir: dirPaths.has(p),
            children: []
          };

          const parent = nodeMap.get(normalizedParent) || root;
          parent.children.push(node);
          nodeMap.set(p, node);
        }

        // Render tree with proper characters
        const lines: string[] = [basePath];

        function renderNode(node: TreeNode, prefix: string, isLast: boolean, isRoot: boolean): void {
          if (!isRoot) {
            const connector = isLast ? '└── ' : '├── ';
            const suffix = node.isDir ? '/' : '';
            lines.push(prefix + connector + node.name + suffix);
          }

          const childPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '│   ');
          node.children.sort((a, b) => {
            // Directories first, then alphabetical
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

          for (let i = 0; i < node.children.length; i++) {
            renderNode(node.children[i], childPrefix, i === node.children.length - 1, false);
          }
        }

        renderNode(root, '', true, true);

        return { stdout: truncate(lines.join('\n')), stderr: '', exitCode: 0 };
      }
      case 'cat': {
        // Support up to 5 files at once
        const MAX_FILES = 5;
        const filePaths = args.filter(a => a && !a.startsWith('-')).map(p => normalizePath(p));

        if (filePaths.length === 0) {
          return { stdout: '', stderr: 'cat: missing file path', exitCode: 2 };
        }

        if (filePaths.length > MAX_FILES) {
          return {
            stdout: '',
            stderr: `cat: too many files. You requested ${filePaths.length} files, but cat supports a maximum of ${MAX_FILES} files at a time. Please split into multiple cat calls.`,
            exitCode: 2
          };
        }

        const outputs: string[] = [];
        let hadError = false;
        let errorMessages: string[] = [];

        for (const path of filePaths) {
          if (!path) {
            errorMessages.push('cat: invalid path');
            hadError = true;
            continue;
          }

          if (path.startsWith('/-')) {
            errorMessages.push(`cat: invalid path "${path}" (looks like an option)`);
            hadError = true;
            continue;
          }

          try {
            const file = await vfs.readFile(projectId, path);
            if (typeof file.content !== 'string') {
              errorMessages.push(`cat: ${path}: binary or non-text file`);
              hadError = true;
            } else {
              // For multiple files, add a header
              if (filePaths.length > 1) {
                outputs.push(`=== ${path} ===\n${file.content}`);
              } else {
                outputs.push(file.content);
              }
            }
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            errorMessages.push(`cat: ${path}: ${errMsg}`);
            hadError = true;
          }
        }

        const stdout = outputs.join('\n\n');
        const stderr = errorMessages.join('\n');

        return {
          stdout: truncate(stdout),
          stderr,
          exitCode: hadError ? 1 : 0
        };
      }
      case 'head': {
        // head [-n lines] <file>
        let numLines = 10;
        let filePath = '';

        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (a === '-n' && args[i + 1]) {
            numLines = parseInt(args[++i]) || 10;
          } else if (!a.startsWith('-')) {
            filePath = a;
          }
        }

        const path = normalizePath(filePath);
        if (!path) return { stdout: '', stderr: 'head: missing file path', exitCode: 2 };

        try {
          const file = await vfs.readFile(projectId, path);
          if (typeof file.content !== 'string') {
            return { stdout: '', stderr: `head: ${path}: binary file`, exitCode: 1 };
          }

          const lines = (file.content as string).split(/\r?\n/);
          const output = lines.slice(0, numLines).join('\n');
          return { stdout: truncate(output), stderr: '', exitCode: 0 };
        } catch (e: any) {
          return { stdout: '', stderr: `head: ${path}: ${e?.message || 'file not found'}`, exitCode: 1 };
        }
      }
      case 'tail': {
        // tail [-n lines] <file>
        let numLines = 10;
        let filePath = '';

        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (a === '-n' && args[i + 1]) {
            numLines = parseInt(args[++i]) || 10;
          } else if (!a.startsWith('-')) {
            filePath = a;
          }
        }

        const path = normalizePath(filePath);
        if (!path) return { stdout: '', stderr: 'tail: missing file path', exitCode: 2 };

        try {
          const file = await vfs.readFile(projectId, path);
          if (typeof file.content !== 'string') {
            return { stdout: '', stderr: `tail: ${path}: binary file`, exitCode: 1 };
          }

          const lines = (file.content as string).split(/\r?\n/);
          const output = lines.slice(-numLines).join('\n');
          return { stdout: truncate(output), stderr: '', exitCode: 0 };
        } catch (e: any) {
          return { stdout: '', stderr: `tail: ${path}: ${e?.message || 'file not found'}`, exitCode: 1 };
        }
      }
      case 'grep': {
        // Supported: grep [-n] [-i] [-r] [-F] pattern path
        // -F: treat pattern as fixed string (literal) instead of regex
        const flags: Record<string, boolean> = { n: false, i: false, r: false, F: false };
        const fargs: string[] = [];
        for (const a of args) {
          if (a.startsWith('-')) {
            for (const ch of a.slice(1)) if (ch in flags) flags[ch] = true;
          } else {
            fargs.push(a);
          }
        }
        const pattern = fargs[0];
        const path = normalizePath(fargs[1]) || '/';
        if (!pattern) {
          return {
            stdout: '',
            stderr: `grep: missing pattern

Usage: grep [FLAGS] PATTERN [PATH]

Supported flags:
  -n  Show line numbers
  -i  Case insensitive search
  -F  Treat pattern as literal string (not regex)

Examples:
  {"cmd": ["grep", "searchterm", "/path"]}
  {"cmd": ["grep", "-n", "pattern", "/file.txt"]}
  {"cmd": ["grep", "-i", "TODO", "/"]}
  {"cmd": ["grep", "-F", "exact.string", "/src"]}

Note: grep always searches recursively. For context around matches, use rg (ripgrep) instead.`,
            exitCode: 2
          };
        }

        // Create regex - escape special chars if -F flag is used
        let regex: RegExp;
        if (flags.F) {
          // Escape special regex characters for literal string matching
          const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          regex = new RegExp(escaped, flags.i ? 'i' : '');
        } else {
          regex = new RegExp(pattern, flags.i ? 'i' : '');
        }

        const entries = await vfs.getAllFilesAndDirectories(projectId, { includeTransient: true });
        const dirPrefix = path === '/' ? '/' : (path.endsWith('/') ? path : path + '/');
        const outLines: string[] = [];
        for (const e of entries) {
          if ('type' in e && e.type === 'directory') continue;
          const file = e as any;
          if (!file.path.startsWith(dirPrefix) && file.path !== path) continue;
          if (typeof file.content !== 'string') continue;
          const lines = (file.content as string).split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (regex.test(line)) {
              outLines.push(
                `${file.path}${flags.n ? ':' + (i + 1) : ''}:${line}`
              );
            }
          }
        }
        const output = outLines.join('\n');
        if (outLines.length === 0) {
          const location = path === '/' ? 'workspace root' : path;
          return { stdout: '', stderr: `grep: pattern "${pattern}" not found in ${location}`, exitCode: 1 };
        }
        return { stdout: truncate(output), stderr: '', exitCode: 0 };
      }
      case 'rg': {
        // ripgrep with context flags: rg [-n] [-i] [-C num] [-A num] [-B num] pattern [path]
        // Also supports combined flags like -nC, -ni, etc.
        const flags: Record<string, any> = { n: true, i: false, C: 0, A: 0, B: 0 };
        const fargs: string[] = [];
        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (a.startsWith('-') && a.length > 1 && !/^-\d+$/.test(a)) {
            // Handle combined flags like -nC, -ni, -iC, etc.
            const flagStr = a.slice(1);
            for (let j = 0; j < flagStr.length; j++) {
              const ch = flagStr[j];
              if (ch === 'n') flags.n = true;
              else if (ch === 'i') flags.i = true;
              else if (ch === 'C') { flags.C = parseInt(args[++i]) || 2; break; }
              else if (ch === 'A') { flags.A = parseInt(args[++i]) || 2; break; }
              else if (ch === 'B') { flags.B = parseInt(args[++i]) || 2; break; }
            }
          } else {
            fargs.push(a);
          }
        }
        const pattern = fargs[0];
        const path = normalizePath(fargs[1]) || '/';
        if (!pattern) {
          return {
            stdout: '',
            stderr: `rg: missing pattern

Usage: rg [FLAGS] PATTERN [PATH]

Supported flags:
  -C NUM  Show NUM lines of context (before and after)
  -A NUM  Show NUM lines after each match
  -B NUM  Show NUM lines before each match
  -i      Case insensitive search
  -n      Show line numbers (enabled by default)

Examples:
  {"cmd": ["rg", "searchterm", "/"]}
  {"cmd": ["rg", "-C", "3", "pattern", "/"]}
  {"cmd": ["rg", "-A", "5", "-B", "2", "function", "/src"]}
  {"cmd": ["rg", "-i", "todo", "/"]}

Tip: Use -C for balanced context. PATH defaults to / if omitted.`,
            exitCode: 2
          };
        }

        const regex = new RegExp(pattern, flags.i ? 'i' : '');
        const entries = await vfs.getAllFilesAndDirectories(projectId, { includeTransient: true });
        const dirPrefix = path === '/' ? '/' : (path.endsWith('/') ? path : path + '/');
        const outLines: string[] = [];

        for (const e of entries) {
          if ('type' in e && e.type === 'directory') continue;
          const file = e as any;
          if (!file.path.startsWith(dirPrefix) && file.path !== path) continue;
          if (typeof file.content !== 'string') continue;

          const lines = (file.content as string).split(/\r?\n/);
          const matchedLines = new Set<number>();

          // Find all matches
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              matchedLines.add(i);
            }
          }

          if (matchedLines.size === 0) continue;

          // Add context lines
          const contextLines = new Set<number>();
          const beforeContext = flags.C || flags.B;
          const afterContext = flags.C || flags.A;

          for (const lineNum of matchedLines) {
            for (let j = Math.max(0, lineNum - beforeContext); j <= Math.min(lines.length - 1, lineNum + afterContext); j++) {
              contextLines.add(j);
            }
          }

          // Output with line numbers
          const sortedLines = Array.from(contextLines).sort((a, b) => a - b);
          if (outLines.length > 0) outLines.push(''); // Separator between files

          for (const lineNum of sortedLines) {
            const lineNumStr = flags.n ? `${lineNum + 1}:` : '';
            const isMatch = matchedLines.has(lineNum);
            outLines.push(`${file.path}:${lineNumStr}${lines[lineNum]}`);
          }
        }

        if (outLines.length === 0) {
          const location = path === '/' ? 'workspace root' : path;
          return { stdout: '', stderr: `rg: pattern "${pattern}" not found in ${location}`, exitCode: 1 };
        }
        return { stdout: truncate(outLines.join('\n')), stderr: '', exitCode: 0 };
      }
      case 'find': {
        // Supported: find <path> [-type f|d] [-name <pattern>] [-maxdepth <depth>]
        let rootArg: string | undefined;
        let pattern: string | undefined;
        let typeFilter: 'f' | 'd' | undefined;

        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (!a) continue;
          if (a === '-name') { pattern = args[i + 1]; i++; continue; }
          if (a === '-type') {
            const typeVal = args[i + 1];
            if (typeVal === 'f' || typeVal === 'd') {
              typeFilter = typeVal;
            }
            i++;
            continue;
          }
          if (a === '-maxdepth') { i++; continue; }
          if (!a.startsWith('-') && !rootArg) rootArg = a;
        }

        const root = normalizePath(rootArg) || '/';
        const entries = await vfs.getAllFilesAndDirectories(projectId, { includeTransient: true });
        const prefix = root === '/' ? '/' : (root.endsWith('/') ? root : root + '/');
        const toGlob = (s: string) => new RegExp('^' + s.replace(/[.+^${}()|\[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
        const regex = pattern ? toGlob(pattern) : null;

        const res = entries
          .filter((e: any) => e.path === root || e.path.startsWith(prefix))
          .filter((e: any) => {
            // Filter by type if specified
            if (typeFilter === 'f') {
              return !('type' in e) || e.type !== 'directory';
            }
            if (typeFilter === 'd') {
              return 'type' in e && e.type === 'directory';
            }
            return true; // No type filter, include all
          })
          .map((e: any) => e.path)
          .filter(p => (regex ? regex.test(p.split('/').pop() || p) : true))
          .sort();

        return { stdout: truncate(res.join('\n')), stderr: '', exitCode: 0 };
      }
      case 'mkdir': {
        // Support: mkdir [-p] <path1> <path2> ... (multiple paths like real bash)
        const hasP = args.includes('-p');
        const paths = args.filter(a => a && a !== '-p').map(p => normalizePath(p));

        if (paths.length === 0) {
          return { stdout: '', stderr: 'mkdir: missing operand', exitCode: 2 };
        }

        let hadError = false;
        const errors: string[] = [];

        for (const path of paths) {
          if (!path) continue;

          // Block mkdir under /.server/ - these are transient/auto-generated
          if (path.startsWith('/.server/')) {
            errors.push(`mkdir: cannot create '${path}': server context directories are auto-generated`);
            hadError = true;
            continue;
          }

          try {
            if (hasP) {
              await ensureDirectory(vfs, projectId, path);
            } else {
              await vfs.createDirectory(projectId, path);
            }
          } catch (e: any) {
            hadError = true;
            errors.push(`mkdir: cannot create directory '${path}': ${e?.message || 'unknown error'}`);
          }
        }

        return {
          stdout: '',
          stderr: errors.join('\n'),
          exitCode: hadError ? 1 : 0
        };
      }
      case 'touch': {
        // touch <file1> <file2> ... - create empty files or update timestamp (multiple files like real bash)
        const paths = args.filter(a => a && !a.startsWith('-')).map(p => normalizePath(p));

        if (paths.length === 0) {
          return { stdout: '', stderr: 'touch: missing file operand', exitCode: 2 };
        }

        let hadError = false;
        const errors: string[] = [];

        for (const path of paths) {
          if (!path) continue;

          try {
            // Check if file exists
            await vfs.readFile(projectId, path);
            // File exists, just continue (we don't update timestamps)
          } catch {
            // File doesn't exist, create it with empty content
            try {
              await vfs.createFile(projectId, path, '');
            } catch (e: any) {
              hadError = true;
              errors.push(`touch: cannot touch '${path}': ${e?.message || 'cannot create file'}`);
            }
          }
        }

        return {
          stdout: '',
          stderr: errors.join('\n'),
          exitCode: hadError ? 1 : 0
        };
      }
      case 'rm': {
        // Enhanced rm command: rm [-rfv] <file/dir...>
        // Parse flags including combined flags like -rf, -rfv
        let recursive = false;
        let force = false;
        let verbose = false;
        const targets: string[] = [];

        for (const arg of args) {
          if (arg && arg.startsWith('-')) {
            // Handle combined flags like -rf, -rfv
            if (arg.includes('r') || arg.includes('R')) recursive = true;
            if (arg.includes('f')) force = true;
            if (arg.includes('v')) verbose = true;
          } else if (arg) {
            targets.push(arg);
          }
        }

        if (targets.length === 0) return { stdout: '', stderr: 'rm: missing operand', exitCode: 2 };

        let hadError = false;
        const verboseOutput: string[] = [];
        const errorMessages: string[] = [];

        for (const target of targets) {
          const path = normalizePath(target);
          if (!path) {
            if (!force) hadError = true;
            continue;
          }

          // Handle server context files (/.server/)
          if (path.startsWith('/.server/')) {
            try {
              await vfs.deleteServerContextFile(path);
              if (verbose) verboseOutput.push(`removed '${path}'`);
            } catch (e: any) {
              if (!force) {
                hadError = true;
                const msg = `rm: cannot remove '${path}': ${e?.message || 'unknown error'}`;
                errorMessages.push(msg);
                if (verbose) verboseOutput.push(msg);
              }
            }
            continue;
          }

          try {
            // Try to delete as file first
            await vfs.deleteFile(projectId, path);
            if (verbose) verboseOutput.push(`removed '${path}'`);
          } catch {
            // If not a file, try as directory
            if (recursive) {
              try {
                await vfs.deleteDirectory(projectId, path);
                if (verbose) verboseOutput.push(`removed directory '${path}'`);
              } catch {
                if (!force) {
                  hadError = true;
                  const msg = `rm: cannot remove '${path}': No such file or directory`;
                  errorMessages.push(msg);
                  if (verbose) verboseOutput.push(msg);
                }
              }
            } else {
              if (!force) {
                hadError = true;
                const msg = `rm: cannot remove '${path}': Is a directory (use -r to remove directories)`;
                errorMessages.push(msg);
                if (verbose) verboseOutput.push(msg);
              }
            }
          }
        }

        const stdout = verbose ? verboseOutput.join('\n') : '';
        const stderr = hadError ? errorMessages.join('\n') : '';
        return { stdout: truncate(stdout), stderr, exitCode: hadError ? 1 : 0 };
      }
      case 'mv': {
        const [rold, rnew] = args;
        const oldPath = normalizePath(rold);
        const newPath = normalizePath(rnew);
        if (!oldPath || !newPath) return { stdout: '', stderr: 'mv: missing operands', exitCode: 2 };
        // Try file move
        try {
          await vfs.renameFile(projectId, oldPath, newPath);
          return { stdout: '', stderr: '', exitCode: 0 };
        } catch {
          // Try directory move
          await vfs.renameDirectory(projectId, oldPath, newPath);
          return { stdout: '', stderr: '', exitCode: 0 };
        }
      }
      case 'cp': {
        // Support: cp <src> <dst> | cp -r <srcDir> <dstDir>
        const recursive = args.includes('-r');
        const filtered = args.filter(a => a !== '-r');
        let [src, dst] = filtered;
        src = normalizePath(src) as string;
        dst = normalizePath(dst) as string;
        if (!src || !dst) return { stdout: '', stderr: 'cp: missing operands', exitCode: 2 };
        // Attempt file copy
        try {
          const file = await vfs.readFile(projectId, src);
          const content = typeof file.content === 'string' ? file.content : file.content;
          try {
            await vfs.createFile(projectId, dst, content as any);
          } catch {
            await vfs.updateFile(projectId, dst, content as any);
          }
          return { stdout: '', stderr: '', exitCode: 0 };
        } catch {
          if (!recursive) {
            return { stdout: '', stderr: 'cp: -r required for directories', exitCode: 1 };
          }
          // Directory copy: copy all files under src prefix
          const entries = await vfs.getAllFilesAndDirectories(projectId, { includeTransient: true });
          const srcPrefix = src.endsWith('/') ? src : src + '/';
          for (const e2 of entries) {
            if ('type' in e2 && e2.type === 'directory') continue;
            const file = e2 as any;
            if (file.path === src || file.path.startsWith(srcPrefix)) {
              const rel = file.path.slice(src.length);
              const target = (dst.endsWith('/') ? dst.slice(0, -1) : dst) + rel;
              await ensureDirectory(vfs, projectId, target.split('/').slice(0, -1).join('/'));
              const content = typeof file.content === 'string' ? file.content : file.content;
              try {
                await vfs.createFile(projectId, target, content as any);
              } catch {
                await vfs.updateFile(projectId, target, content as any);
              }
            }
          }
          return { stdout: '', stderr: '', exitCode: 0 };
        }
      }
      case 'echo': {
        // Support: echo text or echo "text" > /file.txt
        const redirectIndex = args.indexOf('>');

        if (redirectIndex === -1) {
          // No redirection, just output to stdout
          return { stdout: truncate(args.join(' ')), stderr: '', exitCode: 0 };
        }

        // Handle redirection: echo text > /file.txt
        const content = args.slice(0, redirectIndex).join(' ');
        const targetFile = args[redirectIndex + 1];
        const path = normalizePath(targetFile);

        if (!path) {
          return { stdout: '', stderr: 'echo: missing file path after >', exitCode: 2 };
        }

        try {
          // Ensure parent directory exists
          const dirPath = path.split('/').slice(0, -1).join('/') || '/';
          if (dirPath !== '/') {
            await ensureDirectory(vfs, projectId, dirPath);
          }

          // Create or overwrite the file
          try {
            await vfs.createFile(projectId, path, content);
          } catch {
            await vfs.updateFile(projectId, path, content);
          }
          return { stdout: '', stderr: '', exitCode: 0 };
        } catch (e: any) {
          return { stdout: '', stderr: `echo: ${path}: ${e?.message || 'cannot write file'}`, exitCode: 1 };
        }
      }
      case 'sqlite3': {
        // This case is reached when sqlite3 is called without a siteId context
        // When siteId is available, tool-registry.ts routes the call to the server API
        return {
          stdout: '',
          stderr: `sqlite3: requires Server Mode with a published site

The sqlite3 command requires:
1. Server Mode (not Browser Mode)
2. A site to be selected and published

If you are in Server Mode with a published site, this error indicates the site context is not set.
Please ensure the site is selected in the workspace before using sqlite3.

Alternative: Use edge functions for database access via db.query() and db.run()`,
          exitCode: 1
        };
      }
      default: {
        const bashHint = program === 'bash' ? `
Don't use "bash" as a command - call the shell tool directly with your command.
Wrong: {"cmd": ["bash", "-c", "ls -la"]}
Right: {"cmd": ["ls", "-la"]}
` : '';

        return {
          stdout: '',
          stderr: `${program}: command not found${bashHint}

Supported commands: ls, tree, cat, head, tail, rg, grep, find, mkdir, touch, rm, mv, cp, echo, sqlite3

Correct shell tool usage:
  {"cmd": ["ls", "/"]}                        - List files
  {"cmd": ["ls", "-R", "/"]}                  - List files recursively
  {"cmd": ["tree", "/", "-L", "2"]}           - Show directory tree (max depth 2)
  {"cmd": ["cat", "/file.txt"]}               - Read entire file
  {"cmd": ["head", "-n", "20", "/file.txt"]}  - Read first 20 lines
  {"cmd": ["tail", "-n", "20", "/file.txt"]}  - Read last 20 lines
  {"cmd": ["rg", "-C", "3", "pattern", "/"]}  - Search with 3 lines context (recommended)
  {"cmd": ["rg", "-A", "2", "-B", "1", "pattern"]} - Search with custom context
  {"cmd": ["grep", "-n", "pattern", "/file.txt"]} - Search with line numbers
  {"cmd": ["grep", "-F", "literal", "/file.txt"]} - Search literal string
  {"cmd": ["find", "/", "-name", "*.js"]}     - Find files by name
  {"cmd": ["mkdir", "-p", "/path/to/dir"]}    - Create directory (with parents)
  {"cmd": ["touch", "/file.txt"]}             - Create empty file
  {"cmd": ["rm", "-rf", "/dirname"]}          - Delete directory recursively
  {"cmd": ["mv", "/old.txt", "/new.txt"]}     - Move/rename files
  {"cmd": ["cp", "-r", "/src", "/dest"]}      - Copy files/directories
  {"cmd": ["echo", "Hello World"]}            - Output text
  {"cmd": ["echo", "content", ">", "/file.txt"]} - Write text to file
  {"cmd": ["sqlite3", "SELECT * FROM users"]} - Execute SQL (Server Mode)
  {"cmd": ["sqlite3", "-json", "SELECT * FROM products"]} - SQL output as JSON

Note: Use json_patch tool for file editing. Use rg (ripgrep) instead of grep for better context management.
Note: sqlite3 is only available in Server Mode and when a site context is selected.`,
          exitCode: 127
        };
      }
    }
  } catch (e: any) {
    return { stdout: '', stderr: e?.message || String(e), exitCode: 1 };
  }
}

// Create a global instance that can be imported
export const vfsShell = {
  execute: async (projectId: string, cmd: string[]): Promise<{ success: boolean; stdout?: string; stderr?: string }> => {
    // Import singleton vfs to ensure transient files (skills) are available
    const { vfs } = await import('./index');
    await vfs.init();
    const result = await vfsShellExecute(vfs, projectId, cmd);
    return {
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }
};
