import type { ProjectBrief, SpecSection } from './types';

/** Known brief keys that have explicit serialization logic. */
const KNOWN_BRIEF_KEYS = new Set([
  'name', 'type', 'runtime', 'template', 'styling', 'pages',
  'capabilities', 'direction', 'notes',
]);

/** Known capability keys that have explicit serialization logic. */
const KNOWN_CAP_KEYS = new Set([
  'serverFunctions', 'database', 'auth', 'scheduledTasks', 'other',
]);

/**
 * Format an unknown value for display — handles strings, arrays, objects, booleans.
 */
function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(v => formatValue(v)).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Convert a camelCase or snake_case key to a human-readable label.
 */
function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/^\w/, c => c.toUpperCase());
}

/**
 * Converts a finalized ProjectBrief into the brief section for .PROMPT.md.
 * Known fields get explicit formatting. Unknown fields (added by the LLM)
 * are included automatically so nothing is silently dropped.
 */
export function serializeBriefToPrompt(brief: ProjectBrief, hasSpec: boolean): string {
  const lines: string[] = [];

  lines.push('# Project Brief\n');

  // --- Known fields with explicit formatting ---
  if (brief.name) lines.push(`**Name:** ${brief.name}`);
  if (brief.type) lines.push(`**Type:** ${brief.type}`);
  if (brief.runtime) lines.push(`**Runtime:** ${brief.runtime}`);
  if (brief.template && brief.template !== 'blank') lines.push(`**Template:** ${brief.template}`);
  if (brief.styling) lines.push(`**Styling:** ${brief.styling}`);
  if (brief.pages && brief.pages.length > 0) lines.push(`**Pages:** ${brief.pages.join(', ')}`);

  // Capabilities — known booleans + any extras
  if (brief.capabilities && typeof brief.capabilities === 'object') {
    const caps: string[] = [];
    const capObj = brief.capabilities;
    if (capObj.serverFunctions) caps.push('server functions');
    if (capObj.database) caps.push('database');
    if (capObj.auth) caps.push('authentication');
    if (capObj.scheduledTasks) caps.push('scheduled tasks');
    if (capObj.other) caps.push(...capObj.other);

    // Stray capability keys the LLM added
    for (const [k, v] of Object.entries(capObj)) {
      if (!KNOWN_CAP_KEYS.has(k) && v != null) {
        caps.push(`${humanizeKey(k)}: ${formatValue(v)}`);
      }
    }

    if (caps.length > 0) lines.push(`**Capabilities:** ${caps.join(', ')}`);
  }

  if (brief.direction) lines.push(`**Direction:** ${brief.direction}`);
  if (brief.notes) lines.push(`**Notes:** ${brief.notes}`);

  // --- Stray fields the LLM added beyond the known schema ---
  for (const [key, value] of Object.entries(brief)) {
    if (KNOWN_BRIEF_KEYS.has(key) || value == null) continue;
    lines.push(`**${humanizeKey(key)}:** ${formatValue(value)}`);
  }

  // Directive to read .DESIGN.md when present
  if (hasSpec) {
    lines.push('');
    lines.push('**Read /.DESIGN.md before your first task** — it contains project context from the setup conversation.');
  }

  return lines.join('\n') + '\n';
}

/**
 * Serialize accumulated spec sections into .DESIGN.md content.
 * Sections with the same heading are merged (appended).
 */
export function serializeSpec(sections: SpecSection[]): string {
  if (sections.length === 0) return '';

  const merged = new Map<string, string[]>();
  for (const s of sections) {
    const existing = merged.get(s.heading);
    if (existing) {
      existing.push(s.content);
    } else {
      merged.set(s.heading, [s.content]);
    }
  }

  const lines: string[] = ['# Project Spec\n'];
  for (const [heading, contents] of merged) {
    lines.push(`## ${heading}\n`);
    lines.push(contents.join('\n\n'));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Serialize conversation messages into .DESIGN-CONVERSATION.md.
 */
export function serializeTranscript(
  messages: Array<{ role: string; content: string }>
): string {
  const lines: string[] = ['# Setup Conversation\n'];
  for (const msg of messages) {
    const label = msg.role === 'user' ? '**User:**' : '**Agent:**';
    lines.push(`${label} ${msg.content}\n`);
  }
  return lines.join('\n');
}
