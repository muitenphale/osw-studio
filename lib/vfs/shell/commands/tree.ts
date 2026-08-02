import type { ShellEnv, ShellResult } from '../types';
import { applyRedirectGuarded, normalizePath, truncate } from '../runtime';

/** `tree` — show directory tree. */
export async function treeCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId, args, ctx, redirect } = env;

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
  if (redirect) return applyRedirectGuarded(vfs, projectId, treeResult.stdout, redirect, ctx);
  return treeResult;
}
