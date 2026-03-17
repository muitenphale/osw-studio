import { VirtualFileSystem } from './index';

type ShellResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
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

/**
 * Strip bash stderr/stdout redirect operators that are no-ops in the virtual shell.
 * LLMs reflexively append patterns like `2>/dev/null`, `&>/dev/null`, `2>&1`, etc.
 * Handles both fused (`2>/dev/null`) and split (`2>` `/dev/null`) token forms.
 */
function stripBashRedirects(args: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    // Exact fd-duplication: 2>&1
    if (token === '2>&1') continue;
    // Bare redirect operator (2>, 2>>, 1>, 1>>, &>, &>>) — skip it AND the next token (the target path)
    if (/^(?:2|1|&)>>?$/.test(token)) { i++; continue; }
    // Fused redirect+path (2>/dev/null, 1>/tmp/err, &>/dev/null, 2>>/dev/null, etc.)
    if (/^(?:2|1|&)>>?./.test(token)) continue;
    result.push(token);
  }
  return result;
}

/**
 * Extract redirect operator from args: > (overwrite) or >> (append)
 * Returns cleaned args and redirect info
 */
function extractRedirect(args: string[]): { cleanArgs: string[]; redirect?: { file: string; append: boolean } } {
  const appendIdx = args.indexOf('>>');
  const overwriteIdx = args.indexOf('>');

  // Use whichever redirect appears first; prefer >> when at the same position
  let idx: number;
  if (appendIdx !== -1 && overwriteIdx !== -1) {
    idx = appendIdx <= overwriteIdx ? appendIdx : overwriteIdx;
  } else {
    idx = appendIdx !== -1 ? appendIdx : overwriteIdx;
  }
  if (idx === -1) return { cleanArgs: args };

  const append = args[idx] === '>>';
  const file = args[idx + 1];
  if (!file) return { cleanArgs: args }; // No file after redirect — leave as-is

  const cleanArgs = [...args.slice(0, idx), ...args.slice(idx + 2)];
  return { cleanArgs, redirect: { file, append } };
}

/**
 * Apply redirect: write stdout to file (> = overwrite, >> = append)
 */
async function applyRedirect(
  vfs: VirtualFileSystem,
  projectId: string,
  content: string,
  redirect: { file: string; append: boolean }
): Promise<ShellResult> {
  const path = normalizePath(redirect.file);
  if (!path) return { stdout: '', stderr: 'redirect: missing file path', exitCode: 2 };

  try {
    const dirPath = path.split('/').slice(0, -1).join('/') || '/';
    if (dirPath !== '/') await ensureDirectory(vfs, projectId, dirPath);

    if (redirect.append) {
      // Append: read existing + append
      let existing = '';
      try {
        const file = await vfs.readFile(projectId, path);
        if (typeof file.content === 'string') existing = file.content;
      } catch { /* file doesn't exist yet */ }
      const newContent = existing ? existing + '\n' + content : content;
      try { await vfs.createFile(projectId, path, newContent); }
      catch { await vfs.updateFile(projectId, path, newContent); }
    } else {
      // Overwrite
      try { await vfs.createFile(projectId, path, content); }
      catch { await vfs.updateFile(projectId, path, content); }
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  } catch (e: any) {
    return { stdout: '', stderr: `redirect: ${path}: ${e?.message || 'cannot write file'}`, exitCode: 1 };
  }
}

/**
 * Convert sed's Basic Regular Expression (BRE) to JavaScript Extended Regular Expression (ERE).
 * In BRE: ( ) { } + ? | are LITERAL unless preceded by \
 * In ERE/JS: ( ) { } + ? | are SPECIAL unless preceded by \
 * This swap ensures sed patterns like `darken(var(--primary), 10%)` match literally.
 */
function breToEre(pat: string): string {
  let result = '';
  let escaped = false;
  let inCharClass = false;
  for (let i = 0; i < pat.length; i++) {
    const ch = pat[i];
    if (escaped) {
      if (inCharClass) {
        // Inside [...], keep escapes as-is — no BRE-to-ERE swap
        result += '\\' + ch;
      } else {
        // \( in BRE = grouping → ( in ERE
        // \) in BRE = grouping → ) in ERE
        // \{ \} \+ \? \| — same swap
        if ('(){}+?|'.includes(ch)) {
          result += ch; // drop the backslash, keep special meaning
        } else {
          result += '\\' + ch; // keep escape as-is (\n, \d, \/, etc.)
        }
      }
      escaped = false;
      continue;
    }
    if (ch === '\\') { escaped = true; continue; }
    // Track character class boundaries
    if (ch === '[' && !inCharClass) {
      inCharClass = true;
      result += ch;
      continue;
    }
    if (ch === ']' && inCharClass) {
      inCharClass = false;
      result += ch;
      continue;
    }
    // Inside [...], all chars are literal — no BRE-to-ERE transformation
    if (inCharClass) {
      result += ch;
      continue;
    }
    // Unescaped ( ) { } + ? | in BRE are literal → escape for ERE
    if ('(){}+?|'.includes(ch)) {
      result += '\\' + ch;
    } else {
      result += ch;
    }
  }
  if (escaped) result += '\\'; // trailing backslash
  return result;
}

function parseSedExpression(expr: string): { pattern: RegExp; replacement: string } | { error: string } {
  if (!expr.startsWith('s')) return { error: `sed: invalid expression: ${expr}` };

  const delim = expr[1];
  if (!delim || !/[\/|#@]/.test(delim)) {
    return { error: `sed: invalid delimiter in expression: ${expr}` };
  }

  // Split on unescaped delimiter
  const parts: string[] = [];
  let current = '';
  let escaped = false;
  for (let i = 2; i < expr.length; i++) {
    const ch = expr[i];
    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === '\\') { escaped = true; current += ch; continue; }
    if (ch === delim) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  parts.push(current); // flags part (may be empty)

  if (parts.length < 2) {
    return { error: `sed: incomplete expression: ${expr}\n\nUsage: sed 's/pattern/replacement/[flags]'\n  flags: g (global)` };
  }

  const [patStr, replStr, flagStr] = parts;
  const globalFlag = (flagStr || '').includes('g');

  try {
    // Convert BRE pattern to JavaScript ERE (unescaped parens become literal, etc.)
    const erePattern = breToEre(patStr);
    const pattern = new RegExp(erePattern, globalFlag ? 'g' : '');
    // Unescape the replacement string (remove backslash-delimiter escapes)
    const replacement = replStr.replace(new RegExp('\\\\' + delim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), delim);
    return { pattern, replacement };
  } catch (e: any) {
    return { error: `sed: invalid regex "${patStr}": ${e?.message || 'parse error'}` };
  }
}

/** Address type for sed range commands */
type SedAddress = { type: 'line'; line: number } | { type: 'pattern'; pattern: RegExp } | { type: 'last' };

/** Parsed sed command — substitution, delete, change, insert, append, or print */
type SedCommand =
  | { kind: 'substitute'; pattern: RegExp; replacement: string; start?: SedAddress; end?: SedAddress }
  | { kind: 'delete'; start: SedAddress; end?: SedAddress }
  | { kind: 'change'; start: SedAddress; end?: SedAddress; text: string }
  | { kind: 'insert'; start: SedAddress; text: string }
  | { kind: 'append'; start: SedAddress; text: string }
  | { kind: 'print'; start: SedAddress; end?: SedAddress };

/**
 * Parse a sed address like /pattern/, a line number, or $
 * Returns the address and the remaining string after it.
 */
function parseSedAddress(expr: string): { addr: SedAddress; rest: string } | null {
  if (!expr) return null;

  // Line number
  const lineMatch = expr.match(/^(\d+)(.*)/);
  if (lineMatch) {
    return { addr: { type: 'line', line: parseInt(lineMatch[1], 10) }, rest: lineMatch[2] };
  }

  // $ = last line
  if (expr[0] === '$') {
    return { addr: { type: 'last' }, rest: expr.slice(1) };
  }

  // /pattern/ or \xpatternx (alternate delimiter)
  if (expr[0] === '/' || expr[0] === '\\') {
    const delim = expr[0] === '\\' ? expr[1] : '/';
    const start = expr[0] === '\\' ? 2 : 1;
    let pattern = '';
    let escaped = false;
    let i = start;
    for (; i < expr.length; i++) {
      if (escaped) { pattern += expr[i]; escaped = false; continue; }
      if (expr[i] === '\\') { escaped = true; pattern += '\\'; continue; }
      if (expr[i] === delim) { i++; break; }
      pattern += expr[i];
    }
    try {
      return { addr: { type: 'pattern', pattern: new RegExp(breToEre(pattern)) }, rest: expr.slice(i) };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Parse a full sed command expression including optional addresses.
 * Supports: /addr1/,/addr2/d  /addr1/,/addr2/c\text  /addr1/,/addr2/p  s/old/new/g
 */
function parseSedCommand(expr: string): SedCommand | { error: string } {
  // Try substitution first (most common)
  if (expr.startsWith('s') && expr.length > 2 && /[\/|#@]/.test(expr[1])) {
    const parsed = parseSedExpression(expr);
    if ('error' in parsed) return parsed;
    return { kind: 'substitute', ...parsed };
  }

  // Try address-based commands: /pattern/,/pattern/d  or  5,10d  etc.
  const addr1Result = parseSedAddress(expr);
  if (!addr1Result) {
    return { error: `sed: unrecognized command: ${expr}` };
  }

  let addr2: SedAddress | undefined;
  let remaining = addr1Result.rest;

  // Check for ,addr2
  if (remaining.startsWith(',')) {
    const addr2Result = parseSedAddress(remaining.slice(1));
    if (!addr2Result) {
      return { error: `sed: invalid end address in: ${expr}` };
    }
    addr2 = addr2Result.addr;
    remaining = addr2Result.rest;
  }

  // Parse the command character
  remaining = remaining.trim();
  if (remaining === 'd') {
    return { kind: 'delete', start: addr1Result.addr, end: addr2 };
  }
  if (remaining === 'p') {
    return { kind: 'print', start: addr1Result.addr, end: addr2 };
  }
  if (remaining.startsWith('c\\') || remaining.startsWith('c ')) {
    const text = remaining.slice(2).replace(/\\n/g, '\n');
    return { kind: 'change', start: addr1Result.addr, end: addr2, text };
  }
  // i\ — insert text before matched line (single address only)
  if (remaining.startsWith('i\\') || remaining.startsWith('i ')) {
    const text = remaining.slice(2).replace(/\\n/g, '\n');
    return { kind: 'insert', start: addr1Result.addr, text };
  }
  // a\ — append text after matched line (single address only)
  if (remaining.startsWith('a\\') || remaining.startsWith('a ')) {
    const text = remaining.slice(2).replace(/\\n/g, '\n');
    return { kind: 'append', start: addr1Result.addr, text };
  }
  // Address + substitution: 6s/old/new/ or /pattern/s/old/new/g
  if (remaining.startsWith('s') && remaining.length > 2 && /[\/|#@]/.test(remaining[1])) {
    const parsed = parseSedExpression(remaining);
    if ('error' in parsed) return parsed;
    return { kind: 'substitute', ...parsed, start: addr1Result.addr, end: addr2 };
  }

  return { error: `sed: unsupported command "${remaining}" in: ${expr}` };
}

/** Check if a sed address matches a given line */
function addressMatches(addr: SedAddress, lineNum: number, lineContent: string, totalLines: number): boolean {
  switch (addr.type) {
    case 'line': return lineNum === addr.line;
    case 'last': return lineNum === totalLines;
    case 'pattern': return addr.pattern.test(lineContent);
  }
}

async function vfsShellExecute(
  vfs: VirtualFileSystem,
  projectId: string,
  cmd: string[],
  stdin?: string
): Promise<ShellResult> {
  // Validate inputs
  if (!projectId || typeof projectId !== 'string') {
    return { stdout: '', stderr: 'Invalid project ID provided', exitCode: 2 };
  }

  if (!cmd || cmd.length === 0) {
    return { stdout: '', stderr: 'No command provided', exitCode: 2 };
  }

  const cleanCmd = stripBashRedirects(
    cmd.filter(arg => arg !== undefined && arg !== null && arg !== '')
  );
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
      const result = await vfsShellExecuteSingle(vfs, projectId, singleCmd);
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

  // Handle || fallback - execute sequentially, skip remaining on first success
  if (cleanCmd.some(arg => arg === '||')) {
    const commands: string[][] = [];
    let currentCmd: string[] = [];

    for (const arg of cleanCmd) {
      if (arg === '||') {
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

    // Execute commands sequentially, stop on first success
    let lastResult: ShellResult = { stdout: '', stderr: '', exitCode: 1 };
    for (const singleCmd of commands) {
      lastResult = await vfsShellExecuteSingle(vfs, projectId, singleCmd);
      if (lastResult.exitCode === 0) {
        return lastResult;
      }
    }

    return lastResult;
  }

  // Handle pipe chains: cmd1 | cmd2 | cmd3
  if (cleanCmd.some(arg => arg === '|')) {
    const segments: string[][] = [];
    let currentSeg: string[] = [];

    for (const arg of cleanCmd) {
      if (arg === '|') {
        if (currentSeg.length > 0) {
          segments.push(currentSeg);
          currentSeg = [];
        }
      } else {
        currentSeg.push(arg);
      }
    }
    if (currentSeg.length > 0) segments.push(currentSeg);

    if (segments.length < 2) {
      return vfsShellExecuteSingle(vfs, projectId, cleanCmd);
    }

    // Execute pipe chain left-to-right, passing stdout as stdin
    let pipeStdin: string | undefined = stdin;
    for (let i = 0; i < segments.length; i++) {
      const result = await vfsShellExecuteSingle(vfs, projectId, segments[i], pipeStdin);
      if (result.exitCode !== 0) return result;
      pipeStdin = result.stdout;
    }

    return { stdout: pipeStdin || '', stderr: '', exitCode: 0 };
  }

  return vfsShellExecuteSingle(vfs, projectId, cleanCmd, stdin);
}

async function vfsShellExecuteSingle(
  vfs: VirtualFileSystem,
  projectId: string,
  cleanCmd: string[],
  stdin?: string
): Promise<ShellResult> {
  // Extract redirect operators (> or >>) before processing the command
  const { cleanArgs: argsAfterRedirect, redirect } = extractRedirect(cleanCmd.slice(1));
  const program = cleanCmd[0];
  const args = argsAfterRedirect;

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
        let lsOutput: string;
        if (!recursive) {
          const files = await vfs.listDirectory(projectId, path, { includeTransient: true });
          lsOutput = files.map(f => f.path).sort().join('\n');
        } else {
          const entries = await vfs.getAllFilesAndDirectories(projectId, { includeTransient: true });
          const prefix = path === '/' ? '/' : (path.endsWith('/') ? path : path + '/');
          lsOutput = entries
            .filter((e: any) => e.path === path || e.path.startsWith(prefix))
            .map((e: any) => e.path)
            .sort()
            .join('\n');
        }
        const lsResult: ShellResult = { stdout: truncate(lsOutput), stderr: '', exitCode: 0 };
        if (redirect) return applyRedirect(vfs, projectId, lsResult.stdout, redirect);
        return lsResult;
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

        const treeResult: ShellResult = { stdout: truncate(lines.join('\n')), stderr: '', exitCode: 0 };
        if (redirect) return applyRedirect(vfs, projectId, treeResult.stdout, redirect);
        return treeResult;
      }
      case 'cat': {
        // Support up to 5 files at once
        const MAX_FILES = 5;
        const filePaths = args.filter(a => a && !a.startsWith('-')).map(p => normalizePath(p));

        // If no file args but stdin is available, pass through stdin
        if (filePaths.length === 0 && stdin !== undefined) {
          const result: ShellResult = { stdout: truncate(stdin), stderr: '', exitCode: 0 };
          if (redirect) return applyRedirect(vfs, projectId, result.stdout, redirect);
          return result;
        }

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

        const catResult: ShellResult = { stdout: truncate(stdout), stderr, exitCode: hadError ? 1 : 0 };
        if (redirect && !hadError) return applyRedirect(vfs, projectId, catResult.stdout, redirect);
        return catResult;
      }
      case 'head': {
        // head [-n lines | -lines] <file>  (or stdin via pipe)
        let numLines = 10;
        let filePath = '';

        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (a === '-n' && args[i + 1]) {
            numLines = parseInt(args[++i]) || 10;
          } else if (/^-\d+$/.test(a)) {
            // Shorthand: head -20 (same as head -n 20)
            numLines = parseInt(a.slice(1)) || 10;
          } else if (!a.startsWith('-')) {
            filePath = a;
          }
        }

        // Use stdin if no file path and stdin is available
        if (!filePath && stdin !== undefined) {
          const lines = stdin.split(/\r?\n/);
          const output = lines.slice(0, numLines).join('\n');
          const result: ShellResult = { stdout: truncate(output), stderr: '', exitCode: 0 };
          if (redirect) return applyRedirect(vfs, projectId, result.stdout, redirect);
          return result;
        }

        const path = normalizePath(filePath);
        if (!path) return { stdout: '', stderr: 'head: missing file path', exitCode: 2 };

        try {
          const file = await vfs.readFile(projectId, path);
          if (typeof file.content !== 'string') {
            return { stdout: '', stderr: `head: ${path}: binary file`, exitCode: 1 };
          }

          const lines = file.content.split(/\r?\n/);
          const output = lines.slice(0, numLines).join('\n');
          const result: ShellResult = { stdout: truncate(output), stderr: '', exitCode: 0 };
          if (redirect) return applyRedirect(vfs, projectId, result.stdout, redirect);
          return result;
        } catch (e: any) {
          return { stdout: '', stderr: `head: ${path}: ${e?.message || 'file not found'}`, exitCode: 1 };
        }
      }
      case 'tail': {
        // tail [-n lines | -lines] <file>  (or stdin via pipe)
        let numLines = 10;
        let filePath = '';

        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (a === '-n' && args[i + 1]) {
            numLines = parseInt(args[++i]) || 10;
          } else if (/^-\d+$/.test(a)) {
            // Shorthand: tail -20 (same as tail -n 20)
            numLines = parseInt(a.slice(1)) || 10;
          } else if (!a.startsWith('-')) {
            filePath = a;
          }
        }

        // Use stdin if no file path and stdin is available
        if (!filePath && stdin !== undefined) {
          const lines = stdin.split(/\r?\n/);
          const output = lines.slice(-numLines).join('\n');
          const result: ShellResult = { stdout: truncate(output), stderr: '', exitCode: 0 };
          if (redirect) return applyRedirect(vfs, projectId, result.stdout, redirect);
          return result;
        }

        const path = normalizePath(filePath);
        if (!path) return { stdout: '', stderr: 'tail: missing file path', exitCode: 2 };

        try {
          const file = await vfs.readFile(projectId, path);
          if (typeof file.content !== 'string') {
            return { stdout: '', stderr: `tail: ${path}: binary file`, exitCode: 1 };
          }

          const lines = file.content.split(/\r?\n/);
          const output = lines.slice(-numLines).join('\n');
          const result: ShellResult = { stdout: truncate(output), stderr: '', exitCode: 0 };
          if (redirect) return applyRedirect(vfs, projectId, result.stdout, redirect);
          return result;
        } catch (e: any) {
          return { stdout: '', stderr: `tail: ${path}: ${e?.message || 'file not found'}`, exitCode: 1 };
        }
      }
      case 'grep': {
        // Supported: grep [-n] [-i] [-F] pattern path  (always recursive)
        const flags: Record<string, boolean> = { n: false, i: false, F: false };
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

        const outLines: string[] = [];

        // If no file path provided and stdin is available, search stdin
        if (!fargs[1] && stdin !== undefined) {
          const stdinLines = stdin.split(/\r?\n/);
          for (let i = 0; i < stdinLines.length; i++) {
            if (regex.test(stdinLines[i])) {
              outLines.push(flags.n ? `${i + 1}:${stdinLines[i]}` : stdinLines[i]);
            }
          }
        } else {
          const entries = await vfs.getAllFilesAndDirectories(projectId, { includeTransient: true });
          const dirPrefix = path === '/' ? '/' : (path.endsWith('/') ? path : path + '/');
          for (const e of entries) {
            if ('type' in e && e.type === 'directory') continue;
            const file = e as any;
            if (!file.path.startsWith(dirPrefix) && file.path !== path) continue;
            if (typeof file.content !== 'string') continue;
            const lines = file.content.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (regex.test(line)) {
                outLines.push(
                  `${file.path}${flags.n ? ':' + (i + 1) : ''}:${line}`
                );
              }
            }
          }
        }

        const output = outLines.join('\n');
        if (outLines.length === 0) {
          const location = stdin !== undefined ? 'stdin' : (path === '/' ? 'workspace root' : path);
          return { stdout: '', stderr: `grep: pattern "${pattern}" not found in ${location}`, exitCode: 1 };
        }
        const grepResult: ShellResult = { stdout: truncate(output), stderr: '', exitCode: 0 };
        if (redirect) return applyRedirect(vfs, projectId, grepResult.stdout, redirect);
        return grepResult;
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
        const outLines: string[] = [];

        // If no file path provided and stdin is available, search stdin
        if (!fargs[1] && stdin !== undefined) {
          const stdinLines = stdin.split(/\r?\n/);
          const matchedStdinLines = new Set<number>();
          for (let i = 0; i < stdinLines.length; i++) {
            if (regex.test(stdinLines[i])) matchedStdinLines.add(i);
          }
          if (matchedStdinLines.size > 0) {
            const contextStdinLines = new Set<number>();
            const beforeCtx = flags.C || flags.B;
            const afterCtx = flags.C || flags.A;
            for (const ln of matchedStdinLines) {
              for (let j = Math.max(0, ln - beforeCtx); j <= Math.min(stdinLines.length - 1, ln + afterCtx); j++) {
                contextStdinLines.add(j);
              }
            }
            for (const ln of Array.from(contextStdinLines).sort((a, b) => a - b)) {
              const lineNumStr = flags.n ? `${ln + 1}:` : '';
              outLines.push(`${lineNumStr}${stdinLines[ln]}`);
            }
          }
        } else {
          const entries = await vfs.getAllFilesAndDirectories(projectId, { includeTransient: true });
          const dirPrefix = path === '/' ? '/' : (path.endsWith('/') ? path : path + '/');

          for (const e of entries) {
            if ('type' in e && e.type === 'directory') continue;
            const file = e as any;
            if (!file.path.startsWith(dirPrefix) && file.path !== path) continue;
            if (typeof file.content !== 'string') continue;

            const lines = file.content.split(/\r?\n/);
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
              outLines.push(`${file.path}:${lineNumStr}${lines[lineNum]}`);
            }
          }
        }

        if (outLines.length === 0) {
          const location = stdin !== undefined ? 'stdin' : (path === '/' ? 'workspace root' : path);
          return { stdout: '', stderr: `rg: pattern "${pattern}" not found in ${location}`, exitCode: 1 };
        }
        const rgResult: ShellResult = { stdout: truncate(outLines.join('\n')), stderr: '', exitCode: 0 };
        if (redirect) return applyRedirect(vfs, projectId, rgResult.stdout, redirect);
        return rgResult;
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

        const findResult: ShellResult = { stdout: truncate(res.join('\n')), stderr: '', exitCode: 0 };
        if (redirect) return applyRedirect(vfs, projectId, findResult.stdout, redirect);
        return findResult;
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
          try {
            await vfs.createFile(projectId, dst, file.content as any);
          } catch {
            await vfs.updateFile(projectId, dst, file.content as any);
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
              try {
                await vfs.createFile(projectId, target, file.content as any);
              } catch {
                await vfs.updateFile(projectId, target, file.content as any);
              }
            }
          }
          return { stdout: '', stderr: '', exitCode: 0 };
        }
      }
      case 'echo': {
        // echo text (stdout) — redirect handled generically by extractRedirect/applyRedirect
        const output = args.join(' ');
        if (redirect) return applyRedirect(vfs, projectId, output, redirect);
        return { stdout: truncate(output), stderr: '', exitCode: 0 };
      }
      case 'sed': {
        // sed [-i] [-n] [-e expr]... 'expr' [file]
        // Supports: substitution, range delete, range change, range print
        let inPlace = false;
        let suppressOutput = false;
        const expressions: string[] = [];
        let filePath = '';

        // Parse arguments
        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          // -i (GNU), -i '' (BSD/macOS), -i.bak (backup extension) — all mean in-place
          // Guard against combined flags like -in or -ie — only match -i alone or -i with non-alpha suffix (.bak)
          if (a === '-i' || (a.startsWith('-i') && a.length > 2 && !/^-i[a-z]$/i.test(a))) { inPlace = true; continue; }
          if (a === '-n') { suppressOutput = true; continue; }
          if (a === '-e' && args[i + 1]) { expressions.push(args[++i]); continue; }
          // Substitution expression (s/old/new/g)
          if (a.startsWith('s') && a.length > 2 && /[\/|#@]/.test(a[1])) {
            expressions.push(a);
            continue;
          }
          // Address-based expression (/pattern/d, 5,10d, $d, /p1/,/p2/c\text, etc.)
          // Must distinguish from file paths like /index.html:
          //   Address: /pattern/<cmd> or /pattern/,  (closed /.../ followed by command or comma)
          //   Path:    /filename.ext                  (no closing / + command)
          if (/^\d+[,dpcians]/.test(a) || /^[\\$]/.test(a) || /^\/[^/]*\/[,dpcians]/.test(a)) {
            expressions.push(a);
            continue;
          }
          if (!a.startsWith('-') && a) filePath = a;
        }

        if (expressions.length === 0) {
          return {
            stdout: '',
            stderr: `sed: missing expression

Usage: sed [-i] [-n] [-e expr] 'expr' [file]

Commands:
  s/pattern/replacement/[g]       Substitute (BRE: parens are literal)
  /pattern1/,/pattern2/d          Delete lines in range
  /pattern1/,/pattern2/c\\text     Replace range with text
  /pattern/i\\text                 Insert text before matching line
  /pattern/a\\text                 Append text after matching line
  -n '/pattern/p'                 Print matching lines only

Examples:
  sed -i 's/old/new/g' /file.txt
  sed -i '/<nav>/,/<\\/nav>/d' /file.txt
  sed -i '/<nav>/,/<\\/nav>/c\\<nav>new</nav>' /file.txt
  sed -i '/<\\/body>/i\\<footer>My footer</footer>' /file.txt
  sed -n '/<script>/,/<\\/script>/p' /file.txt`,
            exitCode: 2
          };
        }

        // Parse all expressions using the unified parser
        const parsedCmds: SedCommand[] = [];
        for (const expr of expressions) {
          const parsed = parseSedCommand(expr);
          if ('error' in parsed) return { stdout: '', stderr: parsed.error, exitCode: 2 };
          parsedCmds.push(parsed);
        }

        // Get input content
        let inputContent: string;
        const sedPath = normalizePath(filePath);

        if (sedPath) {
          try {
            const file = await vfs.readFile(projectId, sedPath);
            if (typeof file.content !== 'string') {
              return { stdout: '', stderr: `sed: ${sedPath}: binary file`, exitCode: 1 };
            }
            inputContent = file.content;
          } catch (e: any) {
            return { stdout: '', stderr: `sed: ${sedPath}: ${e?.message || 'file not found'}`, exitCode: 1 };
          }
        } else if (stdin !== undefined) {
          inputContent = stdin;
        } else {
          return { stdout: '', stderr: 'sed: no input file or stdin', exitCode: 2 };
        }

        // Apply all commands
        const lines = inputContent.split(/\r?\n/);
        const totalLines = lines.length;
        const outputLines: string[] = [];

        // Track range state per command (for multi-line ranges)
        const inRange = new Array(parsedCmds.length).fill(false);

        for (let lineIdx = 0; lineIdx < totalLines; lineIdx++) {
          let line = lines[lineIdx];
          const lineNum = lineIdx + 1; // 1-based
          let deleted = false;
          let printed = false;
          const appendAfter: string[] = [];

          for (let ci = 0; ci < parsedCmds.length; ci++) {
            const cmd = parsedCmds[ci];

            if (cmd.kind === 'substitute') {
              // If address-constrained (e.g., 6s/old/new/), only apply on matching lines
              if (cmd.start) {
                if (cmd.end) {
                  // Range-addressed substitution: /start/,/end/s/old/new/
                  if (!inRange[ci] && addressMatches(cmd.start, lineNum, line, totalLines)) {
                    inRange[ci] = true;
                  }
                  if (inRange[ci]) {
                    // Check end-address against original line before substitution
                    const endMatch = addressMatches(cmd.end, lineNum, line, totalLines);
                    line = line.replace(cmd.pattern, cmd.replacement);
                    if (endMatch) {
                      inRange[ci] = false;
                    }
                  }
                } else {
                  // Single-addressed substitution: 6s/old/new/
                  if (addressMatches(cmd.start, lineNum, line, totalLines)) {
                    line = line.replace(cmd.pattern, cmd.replacement);
                  }
                }
              } else {
                line = line.replace(cmd.pattern, cmd.replacement);
              }
              continue;
            }

            // Address-based commands: delete, change, insert, append, print
            const startMatch = addressMatches(cmd.start, lineNum, line, totalLines);

            // Insert/append are single-address only, handled before range logic
            if (cmd.kind === 'insert' && startMatch) {
              outputLines.push(cmd.text); // insert text before the current line
              continue;
            }
            if (cmd.kind === 'append' && startMatch) {
              appendAfter.push(cmd.text); // queue text to add after the current line
              continue;
            }

            if ('end' in cmd && cmd.end) {
              // Range: /start/,/end/cmd
              if (!inRange[ci]) {
                if (startMatch) inRange[ci] = true;
              }

              if (inRange[ci]) {
                const endMatch = addressMatches(cmd.end, lineNum, line, totalLines);

                if (cmd.kind === 'delete') {
                  deleted = true;
                } else if (cmd.kind === 'print') {
                  printed = true;
                } else if (cmd.kind === 'change') {
                  deleted = true; // suppress original lines
                }

                if (endMatch) {
                  // End of range — emit change text if applicable
                  if (cmd.kind === 'change') {
                    outputLines.push(cmd.text);
                  }
                  inRange[ci] = false;
                }
              }
            } else {
              // Single address: /pattern/cmd or 5cmd
              if (startMatch) {
                if (cmd.kind === 'delete') {
                  deleted = true;
                } else if (cmd.kind === 'print') {
                  printed = true;
                } else if (cmd.kind === 'change') {
                  deleted = true;
                  outputLines.push(cmd.text);
                }
              }
            }
          }

          if (!deleted) {
            if (suppressOutput) {
              // -n mode: only output explicitly printed lines
              if (printed) outputLines.push(line);
            } else {
              outputLines.push(line);
            }
          }
          // Flush append-after-line text (from 'a' command)
          for (const text of appendAfter) {
            outputLines.push(text);
          }
        }

        const outputContent = outputLines.join('\n');

        if (inPlace) {
          if (!sedPath) {
            return { stdout: '', stderr: 'sed: -i requires a file argument (cannot edit stdin in-place)', exitCode: 2 };
          }
          try {
            await vfs.updateFile(projectId, sedPath, outputContent);
            return { stdout: '', stderr: '', exitCode: 0 };
          } catch (e: any) {
            return { stdout: '', stderr: `sed: ${sedPath}: ${e?.message || 'cannot write file'}`, exitCode: 1 };
          }
        }

        // Output to stdout (redirect handled generically)
        if (redirect) return applyRedirect(vfs, projectId, outputContent, redirect);
        return { stdout: truncate(outputContent), stderr: '', exitCode: 0 };
      }
      case 'wc': {
        // wc [-l] [-w] [-c] [file]  (or stdin via pipe)
        // Default (no flags): show lines, words, chars
        const flags = { l: false, w: false, c: false };
        let filePath = '';
        let anyFlag = false;

        for (const a of args) {
          if (a && a.startsWith('-')) {
            for (const ch of a.slice(1)) {
              if (ch === 'l') { flags.l = true; anyFlag = true; }
              else if (ch === 'w') { flags.w = true; anyFlag = true; }
              else if (ch === 'c') { flags.c = true; anyFlag = true; }
            }
          } else if (a) {
            filePath = a;
          }
        }

        // If no flags specified, show all three
        if (!anyFlag) { flags.l = true; flags.w = true; flags.c = true; }

        let inputContent: string;
        const wcPath = normalizePath(filePath);

        if (wcPath) {
          try {
            const file = await vfs.readFile(projectId, wcPath);
            if (typeof file.content !== 'string') {
              return { stdout: '', stderr: `wc: ${wcPath}: binary file`, exitCode: 1 };
            }
            inputContent = file.content;
          } catch (e: any) {
            return { stdout: '', stderr: `wc: ${wcPath}: ${e?.message || 'file not found'}`, exitCode: 1 };
          }
        } else if (stdin !== undefined) {
          inputContent = stdin;
        } else {
          return { stdout: '', stderr: 'wc: no input file or stdin', exitCode: 2 };
        }

        const lineCount = inputContent === '' ? 0 : (inputContent.match(/\r?\n/g) || []).length;
        const wordCount = inputContent.trim() === '' ? 0 : inputContent.trim().split(/\s+/).length;
        const charCount = inputContent.length;

        const parts: string[] = [];
        if (flags.l) parts.push(String(lineCount));
        if (flags.w) parts.push(String(wordCount));
        if (flags.c) parts.push(String(charCount));
        if (wcPath) parts.push(wcPath);

        const wcOutput = parts.join(' ');
        if (redirect) return applyRedirect(vfs, projectId, wcOutput, redirect);
        return { stdout: truncate(wcOutput), stderr: '', exitCode: 0 };
      }
      case 'curl': {
        // curl localhost/path — fetch compiled HTML from preview engine
        // Flags: -s/--silent, -I/--head, -o FILE/--output FILE, -X METHOD, -H header, -d body
        const curlFlags = { silent: false, head: false, outputFile: '', method: '', headers: [] as string[], body: '' };
        let curlUrl = '';

        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (a === '-s' || a === '--silent') { curlFlags.silent = true; continue; }
          if (a === '-I' || a === '--head') { curlFlags.head = true; continue; }
          if ((a === '-o' || a === '--output') && args[i + 1]) { curlFlags.outputFile = args[++i]; continue; }
          if ((a === '-X' || a === '--request') && args[i + 1]) { curlFlags.method = args[++i]; continue; }
          if ((a === '-H' || a === '--header') && args[i + 1]) { curlFlags.headers.push(args[++i]); continue; }
          if ((a === '-d' || a === '--data' || a === '--data-raw') && args[i + 1]) { curlFlags.body = args[++i]; continue; }
          if (!a.startsWith('-') && a) curlUrl = a;
        }

        // Assume http:// when no protocol is specified
        if (curlUrl && !curlUrl.includes('://')) {
          curlUrl = 'http://' + curlUrl;
        }

        if (!curlUrl) {
          return {
            stdout: '',
            stderr: `curl: no URL specified

Usage: curl [OPTIONS] URL

Options:
  -s, --silent     Suppress progress output
  -I, --head       Show response headers only
  -o, --output FILE  Write output to FILE

Examples:
  curl localhost/                    — compiled index.html
  curl localhost/about               — compiled about page
  curl -I localhost/                 — response headers only
  curl -s localhost/ | grep '<title>'  — pipe to grep
  curl localhost/ > /output.html     — redirect to file

Only localhost URLs are supported (fetches compiled HTML from preview engine).`,
            exitCode: 2
          };
        }

        // Validate localhost-only
        const urlLower = curlUrl.toLowerCase();
        const isLocalhost =
          urlLower.startsWith('http://localhost') ||
          urlLower.startsWith('https://localhost') ||
          urlLower.startsWith('http://127.0.0.1') ||
          urlLower.startsWith('https://127.0.0.1');

        if (!isLocalhost) {
          return {
            stdout: '',
            stderr: `curl: external URLs are not supported: ${curlUrl}\n\nOnly localhost URLs are supported. curl fetches compiled HTML from the preview engine.\n\nExamples:\n  curl localhost/\n  curl localhost/about`,
            exitCode: 1
          };
        }

        // Extract path from URL
        let urlPath = '/';
        try {
          const parsed = new URL(curlUrl);
          urlPath = parsed.pathname || '/';
        } catch {
          // Fallback: extract path manually
          const pathMatch = curlUrl.match(/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/.*)?$/i);
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
          const server = new VirtualServer(vfs, projectId, undefined, undefined, undefined, project?.settings?.runtime);
          const compiled = await server.getCompiledFile(resolvedPath);

          if (!compiled) {
            return {
              stdout: '',
              stderr: `curl: 404 Not Found — ${resolvedPath}\n\nThe file does not exist in the project. Check the path and try again.\n\nResolved: ${urlPath} → ${resolvedPath}`,
              exitCode: 1
            };
          }

          let content = typeof compiled.content === 'string' ? compiled.content : '';

          // Strip VFS Asset Interceptor script (only relevant for browser preview, noise for LLM)
          const interceptorRegex = /<script>\s*\/\/ VFS Asset Interceptor[\s\S]*?<\/script>\s*/;
          content = content.replace(interceptorRegex, '');

          if (curlFlags.head) {
            // Headers only
            const headers = [
              'HTTP/1.1 200 OK',
              `Content-Type: ${compiled.mimeType || 'text/html'}`,
              `Content-Length: ${new TextEncoder().encode(content).length}`,
              ''
            ].join('\n');
            const headResult: ShellResult = { stdout: headers, stderr: '', exitCode: 0 };
            if (redirect) return applyRedirect(vfs, projectId, headResult.stdout, redirect);
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
          if (redirect) return applyRedirect(vfs, projectId, curlResult.stdout, redirect);
          return curlResult;
        } catch (e: any) {
          // Compilation errors from Handlebars are still useful for the LLM
          return { stdout: '', stderr: `curl: error compiling ${resolvedPath}: ${e?.message || 'unknown error'}`, exitCode: 1 };
        }
      }
      case 'sqlite3': {
        // This case is reached when sqlite3 is called without a deploymentId context
        // When deploymentId is available, tool-registry.ts routes the call to the server API
        return {
          stdout: '',
          stderr: `sqlite3: requires Server Mode with a published deployment

The sqlite3 command requires:
1. Server Mode (not Browser Mode)
2. A deployment to be selected and published

If you are in Server Mode with a published deployment, this error indicates the deployment context is not set.
Please ensure the deployment is selected in the workspace before using sqlite3.

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

Supported commands: ls, tree, cat, head, tail, rg, grep, find, mkdir, touch, rm, mv, cp, echo, sed, wc, curl, sqlite3
Operators: | (pipe), > (redirect), >> (append), && (chain), || (fallback)

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
  {"cmd": ["sed", "s/old/new/g", "/file.txt"]}  - Text substitution (stdout)
  {"cmd": ["sed", "-i", "s/old/new/g", "/file.txt"]} - In-place edit
  {"cmd": ["cat", "/f.txt", "|", "grep", "class", "|", "head", "-n", "5"]} - Pipe chain
  {"cmd": ["grep", "-n", "div", "/f.txt", ">", "/results.txt"]} - Redirect to file
  {"cmd": ["find", "/", "-type", "f", "|", "wc", "-l"]} - Count files
  {"cmd": ["wc", "-l", "/file.txt"]}             - Count lines in file
  {"cmd": ["curl", "localhost/"]}                 - View compiled HTML output
  {"cmd": ["curl", "localhost/about"]}            - View compiled page (path resolution)
  {"cmd": ["curl", "-I", "localhost/"]}           - Response headers only
  {"cmd": ["sqlite3", "SELECT * FROM users"]} - Execute SQL (Server Mode)
  {"cmd": ["sqlite3", "-json", "SELECT * FROM products"]} - SQL output as JSON

Note: Use cat > for file creation, sed -i for substitutions. Use rg (ripgrep) instead of grep for better context management.
Note: sqlite3 is only available in Server Mode and when a deployment context is selected.`,
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
  execute: async (projectId: string, cmd: string[], stdin?: string): Promise<{ success: boolean; stdout?: string; stderr?: string }> => {
    // Import singleton vfs to ensure transient files (skills) are available
    const { vfs } = await import('./index');
    await vfs.init();
    const result = await vfsShellExecute(vfs, projectId, cmd, stdin);
    return {
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }
};
