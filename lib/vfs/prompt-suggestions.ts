import type { PromptSuggestion } from './types';

/**
 * The suggestions a project starts with, taken from whatever template made it.
 *
 * Copied rather than referenced: a template seeds a project once, and the project owns its
 * suggestions from then on. Editing a template never reaches a project already created from it,
 * which is the same rule every other part of a template follows.
 *
 * Returns undefined for a template that ships none, so the field stays absent on the project and
 * the generic starters are used instead of an empty list that would show nothing.
 */
export function seedPromptSuggestions(
  declared: PromptSuggestion[] | undefined
): PromptSuggestion[] | undefined {
  if (!declared || declared.length === 0) return undefined;
  return declared.map((suggestion) => ({
    id: suggestion.id,
    label: suggestion.label,
    prompt: suggestion.prompt,
  }));
}

/** A blank suggestion for the editor to fill in. */
export function newPromptSuggestion(): PromptSuggestion {
  return { id: crypto.randomUUID(), label: '', prompt: '' };
}

/**
 * Drops anything that would render as an unusable button.
 *
 * Applied on save rather than on render: a half-typed row in the editor is expected, one that
 * reached storage is not, and a button with no label is invisible while still taking up one of the
 * three inline slots.
 */
export function usablePromptSuggestions(suggestions: PromptSuggestion[]): PromptSuggestion[] {
  return suggestions
    .map((s) => ({ id: s.id, label: s.label.trim(), prompt: s.prompt.trim() }))
    .filter((s) => s.label !== '' && s.prompt !== '');
}
