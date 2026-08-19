/** Pure functions for the text popover. */

import type { ApplyResult } from '@/lib/direct-edit/types';

/**
 * The refusals reading or writing text can produce. `needs-confirmation` is handled separately —
 * it is a question, not a refusal, and the dialog renders it differently.
 */
export type TextRefusalReason =
  | 'unresolvable'
  | 'generating'
  | 'stale-index'
  | 'missing-file'
  | 'has-children'
  | 'has-expression'
  | 'unclosed'
  | 'void-element';

const TEXT_REFUSAL_REASONS: readonly TextRefusalReason[] = [
  'unresolvable', 'generating', 'stale-index', 'missing-file',
  'has-children', 'has-expression', 'unclosed', 'void-element',
];

export interface TextRefusal {
  reason: TextRefusalReason;
  file?: string;
}

/** Narrows ApplyResult reasons to those the text popover can render. */
export function textRefusal(
  result: { ok: boolean; reason?: ApplyResult['reason']; file?: string; instances?: number },
): TextRefusal | null {
  if (result.ok || result.reason === 'needs-confirmation') return null;
  const reason = TEXT_REFUSAL_REASONS.includes(result.reason as TextRefusalReason)
    ? (result.reason as TextRefusalReason)
    : 'unresolvable';
  return { reason, file: result.file };
}

/** Separate from message so the headline does not contradict the detail. */
export function textRefusalTitle(refusal: TextRefusal): string {
  switch (refusal.reason) {
    case 'generating':      return 'The agent is working';
    case 'stale-index':     return 'The preview is out of date';
    case 'missing-file':    return 'The source file is gone';
    case 'has-children':    return 'This text is mixed with other things';
    case 'has-expression':  return 'This text comes from the template';
    case 'unclosed':        return 'This element is not closed';
    case 'void-element':    return 'This element holds no text';
    case 'unresolvable':    return 'Nothing to edit here';
  }
}

export function textRefusalMessage(refusal: TextRefusal): string {
  switch (refusal.reason) {
    case 'generating':
      return 'The agent is editing this project. Text changes wait until it finishes.';
    case 'stale-index':
      return `The preview is out of date${refusal.file ? `: ${refusal.file} has changed since it was compiled` : ''}. `
        + 'Refresh the preview and select the text again.';
    case 'missing-file':
      return `${refusal.file ?? 'The source file'} no longer exists, so there is nothing to edit. `
        + 'Refreshing will not help — ask the agent to rebuild it.';
    case 'has-children':
      return 'This element holds more than plain text — there is other markup inside it, and '
        + 'replacing the words here would delete it. Select the part you want to change on its own, '
        + 'or ask the agent to reword the whole thing.';
    case 'has-expression':
      return 'These words come from the template rather than from the page, so what is written in '
        + 'the file is not what you are reading. Ask the agent to change what the template says.';
    case 'unclosed':
      return `This element is never closed${refusal.file ? ` in ${refusal.file}` : ''}, so there is no `
        + 'text to replace. Ask the agent to fix the markup first.';
    case 'void-element':
      return 'This element cannot hold text, so there is nothing to retype.';
    case 'unresolvable':
      return 'This text is built at runtime, so there is no source to edit. '
        + 'Ask the agent to change it instead.';
  }
}

/** Whether the refusal is worth offering the agent. A wait, a refresh or an empty element is not. */
export function textRefusalOffersAgent(refusal: TextRefusal): boolean {
  return refusal.reason === 'unresolvable' || refusal.reason === 'missing-file'
    || refusal.reason === 'has-children' || refusal.reason === 'has-expression'
    || refusal.reason === 'unclosed';
}

/** What the popover says before writing to a source tag that renders more than once. */
export function textConfirmationMessage(instances: number, file?: string): string {
  const where = file ? ` from ${file}` : '';
  return instances > 1
    ? `This text${where} is rendered ${instances} times. Changing it changes all ${instances}.`
    : `This text${where} is shared. Changing it changes every place it renders.`;
}

/** Unchanged text is not a write. Compared against the text as read, entities included. */
export function textIsChanged(original: string, next: string): boolean {
  return next !== original;
}
