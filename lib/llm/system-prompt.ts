import { skillsService } from '@/lib/vfs/skills';
import type { AgentType } from './agent';

/**
 * Prompt appended as a user message when requesting conversation compaction.
 * Instructs the model to produce a structured summary for context continuation.
 */
export const COMPACTION_PROMPT = `You have been working on a coding task but have not yet completed it.
The conversation history is approaching the context limit and needs to be summarized.

Write a continuation summary that will allow you to resume work efficiently.
The conversation history will be replaced with this summary. Include:

1. **Current task**: What the user asked for and the overall goal
2. **What was accomplished**: Files created/modified, key decisions made, approaches taken
3. **Current state**: Where you left off, what's working, what's not
4. **What remains**: Next steps, unresolved issues, pending work
5. **Key context**: Important file paths, error messages, or technical details needed to continue

Be structured and concise. Focus on actionable information needed to continue the work.
Do not include pleasantries or meta-commentary about the summarization process.
Respond in plain text only. Do not call any tools or functions.`;

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

export async function buildShellSystemPrompt(chatMode?: boolean, serverContext?: ServerContextMetadata | null, projectId?: string, agentType?: AgentType): Promise<string> {
  if (agentType === 'explore') return buildExplorePrompt(serverContext, projectId);
  if (agentType === 'plan') return buildPlanPrompt(serverContext, projectId);
  if (agentType === 'task') return buildTaskAgentPrompt(serverContext, projectId);
  if (chatMode) {
    return buildChatModePrompt(serverContext, projectId);
  }
  return await buildCodeModePrompt(serverContext, projectId);
}

/**
 * Shared preamble for both chat and code modes.
 * Contains: role, tool calling, file reading preferences, command list.
 */
function buildSharedPreamble(isReadOnly: boolean, hasServerContext: boolean): string {
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
- Preview: curl localhost/[path] (view compiled HTML output)`;

  if (hasServerContext) {
    prompt += `
- Database (Server Mode): sqlite3 "SQL QUERY"`;
  }

  if (!isReadOnly) {
    prompt += `
- Create: mkdir [-p] path, touch file
- Move/copy: mv src dest, cp [-r] src dest
- Remove: rm [-rf] path
- Substitute: sed -i 's/old/new/g' file (single-line only)
- Edit: ss /file << 'EOF' (multiline search===replace — primary editing tool)
- Entity edit: ss --entity /file << 'EOF' (give opening line only — auto-finds closing tag/bracket)
- New file: cat > /file << 'EOF'\\ncontent\\nEOF (creation and full rewrites only)
- Pipes: cmd1 | cmd2, cmd > file, cmd >> file`;
  }

  prompt += `

grep supports -A/-B/-C context flags. Use rg for the best search experience.`;

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

  section += `\nCreating backend features (use shell commands):\n`;
  section += `- Secret: cat > /.server/secrets/NAME.json << 'EOF'\n{"name":"NAME","description":"..."}\nEOF\n`;
  section += `- Edge function: cat > /.server/edge-functions/name.json << 'EOF'\n{"name":"name","method":"GET","enabled":true,"code":"..."}\nEOF\n`;
  section += `- Server function: cat > /.server/server-functions/name.json << 'EOF'\n{"name":"name","enabled":true,"code":"..."}\nEOF\n`;
  section += `- Scheduled: cat > /.server/scheduled-functions/name.json << 'EOF'\n{"name":"name","functionName":"edgeFn","cronExpression":"0 * * * *","timezone":"UTC","enabled":true,"config":{}}\nEOF\n`;
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
        const isLast = index === skillsMetadata.length - 1 && !serverContext && !fileTree;
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
      if (serverContext.scheduledFunctionCount > 0) {
        context += `\u2502   \u251C\u2500\u2500 scheduled-functions/\n`;
      }
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
  } else {
    content += `\n\nThis project runs in Browser Mode (client-side only). Backend features (edge functions, server functions, database, scheduled functions, secrets) are NOT available. The /.server/ directory does not exist. If the user asks for backend or multiplayer features, explain that these require Server Mode (self-hosted) and suggest client-side alternatives.`;
  }

  return content;
}

async function buildExplorePrompt(serverContext?: ServerContextMetadata | null, projectId?: string): Promise<string> {
  let prompt = `You are exploring a codebase to answer a question or find specific information.

${buildSharedPreamble(true, !!serverContext)}

Search broadly first (rg, find, tree), then read specifically (head, tail, cat).
Return a clear, factual summary of what you found.
Do not speculate about code you haven't read.`;

  prompt += await buildDynamicContent(projectId, serverContext);
  return prompt;
}

async function buildPlanPrompt(serverContext?: ServerContextMetadata | null, projectId?: string): Promise<string> {
  let prompt = `You are analyzing a codebase to design an implementation approach.

${buildSharedPreamble(true, !!serverContext)}

Read relevant files to understand current architecture and patterns.
Return a structured analysis:
- What exists (files, patterns, conventions)
- What needs to change
- Recommended approach with specific file references`;

  prompt += await buildDynamicContent(projectId, serverContext);
  return prompt;
}

const SS_EDITING_DOCS = `Editing files — use ss for all edits to existing files:
  shell({ cmd: "ss /file << 'EOF'\\nexact text to find\\n===\\nreplacement text\\nEOF" })
Copy the exact text you want to replace (use rg -C 5 or head/tail to inspect first).
To replace a whole function, element, or CSS rule — give just the opening line and ss --entity finds the end:
  ss --entity /file << 'EOF'
  function initApp() {
  ===
  function initApp() { /* new body */ }
  EOF
For creating new files or complete rewrites only: cat > /file << 'EOF'
For single-line regex substitution: sed -i 's/old/new/' /file`;

async function buildTaskAgentPrompt(serverContext?: ServerContextMetadata | null, projectId?: string): Promise<string> {
  let prompt = buildSharedPreamble(false, !!serverContext);

  prompt += `

You are executing a focused coding task. Complete the task efficiently.

${SS_EDITING_DOCS}

Build command (run after writing files):
  shell({ cmd: "build" })

Status command (always run before finishing):
  shell({ cmd: "status --task 'the task' --done 'work done' --remaining 'none' --complete" })

All paths are relative to the project root (/).`;

  prompt += await buildDynamicContent(projectId, serverContext);
  return prompt;
}

async function buildChatModePrompt(serverContext?: ServerContextMetadata | null, projectId?: string): Promise<string> {
  let prompt = buildSharedPreamble(true, !!serverContext);

  prompt += `

Read-only mode — file modifications are disabled.
Disabled: mkdir, touch, mv, rm, cp, echo >, sed -i, status command.
Focus on exploration, analysis, and planning.`;

  prompt += await buildDynamicContent(projectId, serverContext);
  return prompt;
}

async function buildCodeModePrompt(serverContext?: ServerContextMetadata | null, projectId?: string): Promise<string> {
  let prompt = buildSharedPreamble(false, !!serverContext);

  prompt += `

You have exactly ONE tool: shell. Do not call any other tool.
ss, sed, cat, and all other commands are shell commands — always call them via the shell tool.

${SS_EDITING_DOCS}
Do not use cat > to edit existing files — use ss instead.

Build command (run after writing files):
  shell({ cmd: "build" })
Returns "Build successful — 0 errors" or lists compilation errors.
Run build after writing a batch of files to verify they compile. Do not inspect bundle.js or grep compiled output — use build instead.

Status command (always run before finishing):
  shell({ cmd: "status --task 'the original request' --done 'work completed' --remaining 'none' --complete" })
End with --complete when done, or --incomplete if more work remains.

All paths are relative to the project root (/).
Reuse snippets from earlier in the conversation when possible.

The user sees a live preview that updates as you write files — you cannot see it.
After writing code, run build to check for errors, then run status when done.
Do not run diagnostic loops (repeated curl/grep/rg/wc) to verify visual output — you cannot assess rendering from raw HTML.

Delegate to keep your context focused — sub-agents explore or edit independently and return a summary:
  shell({ cmd: "delegate explore 'What colors are used?' 'What fonts?' 'What layout patterns?'" })
  shell({ cmd: "delegate task 'Add nav to index.html' 'Add nav to about.html' 'Add nav to contact.html'" })
  shell({ cmd: "delegate plan 'How should we add a blog section?'" })
Always use ONE delegate call with multiple quoted prompts — never make separate delegate calls. Each starts fresh, so never delegate tasks that depend on each other's output. Build foundational work (e.g. a primary page) yourself first, then delegate independent follow-up work. For quick lookups (1-2 files), just use cat/rg directly.`;

  prompt += await buildDynamicContent(projectId, serverContext);
  return prompt;
}
