import { skillsService } from '@/lib/vfs/skills';

// Server context metadata type (matches VFS.getServerContextMetadata())
export interface ServerContextMetadata {
  projectId: string;
  runtimeDeploymentId?: string;
  hasDatabase: boolean;
  edgeFunctionCount: number;
  serverFunctionCount: number;
  secretCount: number;
  scheduledFunctionCount: number;
}

export async function buildShellSystemPrompt(chatMode?: boolean, serverContext?: ServerContextMetadata | null, projectId?: string): Promise<string> {
  if (chatMode) {
    return buildChatModePrompt(serverContext, projectId);
  }
  return await buildCodeModePrompt(serverContext, projectId);
}

/**
 * Shared preamble for both chat and code modes.
 * Contains: role, tool calling, file reading preferences, command list.
 */
function buildSharedPreamble(isReadOnly: boolean): string {
  let prompt = `You are an AI assistant helping users with coding projects in a sandboxed virtual file system.

Invoke tools via function calling — never output tool syntax as text.
The shell tool accepts a 'cmd' string parameter: "ls -la /"

Prefer targeted reads over cat to save tokens:
  rg -C 5 'pattern' /  — search with context (best)
  head -n 50 /file     — sample start
  tail -n 50 /file     — sample end
  tree -L 2 /          — project structure
  cat /file             — full file (small files only, last resort)

Shell commands:
- Search: rg [-C n] [-n] [-i] pattern path
- Read: head [-n N] file, tail [-n N] file, cat file
- List: ls [-R] path, tree [-L depth] path
- Find: find path -name pattern
- Count: wc [-l] [-w] [-c] file
- Preview: curl localhost/[path] (view compiled HTML output)
- Database (Server Mode): sqlite3 "SQL QUERY"`;

  if (!isReadOnly) {
    prompt += `
- Create: mkdir [-p] path, touch file
- Move/copy: mv src dest, cp [-r] src dest
- Remove: rm [-rf] path
- Text: sed [-i] 's/old/new/g' file, echo text
- Pipes: cmd1 | cmd2, cmd > file, cmd >> file
- Heredoc (for large files): cat > /file << 'EOF'\\ncontent\\nEOF`;
  }

  prompt += `

grep does not support -A/-B/-C flags. Use rg for context around matches.`;

  return prompt;
}

/**
 * Build the server context section for the system prompt (compressed).
 */
function buildServerContextSection(serverContext: ServerContextMetadata): string {
  let section = `\n\nBACKEND FEATURES:\n`;
  if (serverContext.runtimeDeploymentId) {
    section += `Runtime deployment connected — sqlite3 commands available.\n`;
  } else {
    section += `No runtime deployment connected. Define backend features here; deploy to execute them.\n`;
  }

  section += `\nAvailable:\n`;
  if (serverContext.hasDatabase) section += `- Database: SQLite via sqlite3 command\n`;
  if (serverContext.edgeFunctionCount > 0) section += `- Edge Functions: ${serverContext.edgeFunctionCount} in /.server/edge-functions/\n`;
  if (serverContext.serverFunctionCount > 0) section += `- Server Functions: ${serverContext.serverFunctionCount} in /.server/server-functions/\n`;
  if (serverContext.scheduledFunctionCount > 0) section += `- Scheduled Functions: ${serverContext.scheduledFunctionCount} in /.server/scheduled-functions/\n`;
  section += `- Secrets: ${serverContext.secretCount} in /.server/secrets/\n`;

  if (serverContext.hasDatabase) {
    section += `\nDatabase commands:\n`;
    section += `  sqlite3 "SELECT name FROM sqlite_master WHERE type='table'"  — list tables\n`;
    section += `  sqlite3 "SELECT * FROM products"                             — query data\n`;
    section += `  sqlite3 -json "SELECT * FROM products"                       — JSON output\n`;
    section += `Put complete SQL in double quotes. Do not use dot commands. Schema: cat /.server/db/schema.sql\n`;
  }

  section += `\nCreating backend features (use write tool):\n`;
  section += `- Secret: write /.server/secrets/NAME.json rewrite '{"name":"NAME","description":"..."}'\n`;
  section += `- Edge function: write /.server/edge-functions/name.json rewrite '{"name":"name","method":"GET","enabled":true,"code":"..."}'\n`;
  section += `- Server function: write /.server/server-functions/name.json rewrite '{"name":"name","enabled":true,"code":"..."}'\n`;
  section += `- Scheduled: write /.server/scheduled-functions/name.json rewrite '{"name":"name","functionName":"edgeFn","cronExpression":"0 * * * *","timezone":"UTC","enabled":true,"config":{}}'\n`;
  section += `Call edge functions from client: fetch('/function-name') — the platform auto-routes.\n`;
  section += `Full reference: cat /.server/README.md\n`;

  return section;
}

/**
 * Build project context for injection into the first user message.
 * Contains skills list and file tree — project state, not behavioral instructions.
 */
export async function buildProjectContext(
  fileTree?: string,
  serverContext?: ServerContextMetadata | null
): Promise<string> {
  let context = '';

  const skillsMetadata = await skillsService.getEnabledSkillsMetadata();

  // File tree with virtual directories
  if (fileTree || skillsMetadata.length > 0 || serverContext) {
    context += `Current project structure:\n`;

    // Add skills directory first (as a top-level entry)
    if (skillsMetadata.length > 0) {
      context += `\u251C\u2500\u2500 .skills/\n`;
      skillsMetadata.forEach((skill, index) => {
        const isLast = index === skillsMetadata.length - 1 && !serverContext;
        const connector = isLast ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 ';
        const filename = skill.path.split('/').pop();
        context += `\u2502   ${connector}${filename}\n`;
      });
    }

    // Add server context directory
    if (serverContext) {
      context += `\u251C\u2500\u2500 .server/\n`;
      context += `\u2502   \u251C\u2500\u2500 README.md\n`;
      if (serverContext.hasDatabase) {
        context += `\u2502   \u251C\u2500\u2500 db/\n`;
        context += `\u2502   \u2502   \u2514\u2500\u2500 schema.sql\n`;
      }
      if (serverContext.edgeFunctionCount > 0) {
        context += `\u2502   \u251C\u2500\u2500 edge-functions/\n`;
      }
      if (serverContext.serverFunctionCount > 0) {
        context += `\u2502   \u251C\u2500\u2500 server-functions/\n`;
      }
      // Always show secrets folder (can create placeholders)
      context += `\u2502   \u2514\u2500\u2500 secrets/\n`;
    }

    // Add project files (strip "Project Structure:\n" header if present)
    if (fileTree) {
      const treeContent = fileTree.replace(/^Project Structure:\n/, '');
      context += treeContent;
    }
  }

  // Skills list
  if (skillsMetadata.length > 0) {
    context += `\nAvailable skills (read before starting related work):\n`;
    for (const skill of skillsMetadata) {
      context += `- ${skill.path}: ${skill.description}\n`;
    }
    context += `To use: cat /.skills/<skill-name>.md\n`;
  }

  return context;
}

/**
 * Build dynamic system prompt content shared between chat and code modes:
 * .PROMPT.md and server context instructions (behavioral content only).
 */
async function buildDynamicContent(
  projectId?: string,
  serverContext?: ServerContextMetadata | null
): Promise<string> {
  let content = '';

  // .PROMPT.md section — only show if content exists
  if (projectId) {
    try {
      const { vfs } = await import('@/lib/vfs');
      const promptFile = await vfs.readFile(projectId, '/.PROMPT.md');
      if (promptFile && typeof promptFile.content === 'string' && promptFile.content.trim()) {
        content += `\n\nDOMAIN INSTRUCTIONS (.PROMPT.md) — do not modify:\n${promptFile.content}\n`;
      }
    } catch {
      // .PROMPT.md doesn't exist — operate with base prompt only
    }
  }

  // Server context instructions (behavioral — stays in system prompt)
  if (serverContext) {
    content += buildServerContextSection(serverContext);
  }

  return content;
}

async function buildChatModePrompt(serverContext?: ServerContextMetadata | null, projectId?: string): Promise<string> {
  let prompt = buildSharedPreamble(true);

  prompt += `

Read-only mode — file modifications are disabled.
Disabled: mkdir, touch, mv, rm, cp, echo >, sed -i, write tool, evaluation tool.
Focus on exploration, analysis, and planning.`;

  prompt += await buildDynamicContent(projectId, serverContext);
  return prompt;
}

async function buildCodeModePrompt(serverContext?: ServerContextMetadata | null, projectId?: string): Promise<string> {
  let prompt = buildSharedPreamble(false);

  // Write tool section
  prompt += `

File Editing with write:

Inspect the relevant snippet before editing (rg -C 5, head, or tail — not cat).
Make one write call per response.

Operation types:
- UPDATE: replace exact string (oldStr must be unique in file)
- REWRITE: replace entire file content
- REPLACE_ENTITY: replace code entity by opening pattern (function, HTML element, CSS rule)

Examples:

UPDATE (title change):
{"file_path": "/index.html", "operations": [{"type": "update", "oldStr": "<title>Old Title</title>", "newStr": "<title>New Title</title>"}]}

REWRITE (small file):
{"file_path": "/README.md", "operations": [{"type": "rewrite", "content": "# New Project\\n\\nComplete new content."}]}

REPLACE_ENTITY (function):
{"file_path": "/utils/helpers.js", "operations": [{"type": "replace_entity", "selector": "function calculateTotal(", "replacement": "function calculateTotal(items, tax = 0.1) {\\n  const subtotal = items.reduce((sum, item) => sum + item.price, 0);\\n  return subtotal * (1 + tax);\\n}"}]}

Rules:
- oldStr must match exactly and be unique — include more context if ambiguous
- For replace_entity, copy the opening pattern without leading indentation
- Inspect the snippet before editing (rg -C 5, head, or tail)
- One write call per response
- If update keeps failing, switch to rewrite
- Prefer editing existing files over creating new ones
- For large files (200+ lines), build progressively: skeleton rewrite, then fill with updates`;

  // Evaluation section
  prompt += `

Evaluation Tool:
Use evaluation to track progress on complex tasks (3+ operations).
Set goal_achieved=true when done, list remaining_work if continuing.
Skip for simple tasks.`;

  // General notes
  prompt += `

All paths are relative to the project root (/).
Reuse snippets from earlier in the conversation when possible.`;

  prompt += await buildDynamicContent(projectId, serverContext);
  return prompt;
}
