import { describe, it, expect } from 'vitest';
import {
  newPromptSuggestion,
  seedPromptSuggestions,
  usablePromptSuggestions,
} from '@/lib/vfs/prompt-suggestions';
import type { PromptSuggestion } from '@/lib/vfs/types';

const one = (over: Partial<PromptSuggestion> = {}): PromptSuggestion => ({
  id: 's1',
  label: 'Write a post',
  prompt: 'Add a blog post and list it in /data.json.',
  ...over,
});

describe('seedPromptSuggestions', () => {
  it('copies what the template declared', () => {
    expect(seedPromptSuggestions([one()])).toEqual([one()]);
  });

  it('leaves the field off for a template that ships none', () => {
    // Undefined rather than [], so the project has no suggestions of its own and the chat row
    // falls back to the generic starters instead of showing an empty row.
    expect(seedPromptSuggestions(undefined)).toBeUndefined();
    expect(seedPromptSuggestions([])).toBeUndefined();
  });

  it('does not hand the project the template’s own objects', () => {
    // A template is a module-level constant shared by every project made from it. Editing one
    // project's suggestions must not reach back into the template or into another project.
    const declared = [one()];
    const seeded = seedPromptSuggestions(declared)!;

    expect(seeded[0]).not.toBe(declared[0]);
    seeded[0].label = 'Changed';
    expect(declared[0].label).toBe('Write a post');
  });

  it('keeps only the fields a suggestion is made of', () => {
    const withExtra = { ...one(), stray: 'should not survive' } as unknown as PromptSuggestion;
    expect(Object.keys(seedPromptSuggestions([withExtra])![0]).sort()).toEqual([
      'id',
      'label',
      'prompt',
    ]);
  });
});

describe('usablePromptSuggestions', () => {
  it('trims whitespace off the label and prompt', () => {
    const cleaned = usablePromptSuggestions([one({ label: '  Spaced  ', prompt: '  Do it.  ' })]);
    expect(cleaned).toEqual([one({ label: 'Spaced', prompt: 'Do it.' })]);
  });

  it('drops a row with no label or no prompt', () => {
    // A row half-filled in the editor is expected; one that reached storage is not. A suggestion
    // with no label renders as an invisible button that still takes an inline slot.
    const cleaned = usablePromptSuggestions([
      one({ id: 'keep' }),
      one({ id: 'no-label', label: '   ' }),
      one({ id: 'no-prompt', prompt: '' }),
    ]);
    expect(cleaned.map((s) => s.id)).toEqual(['keep']);
  });

  it('returns an empty list when nothing is usable', () => {
    expect(usablePromptSuggestions([one({ label: '', prompt: '' })])).toEqual([]);
  });

  it('keeps the order they were given in', () => {
    // The first few are the ones shown on the row, so order is meaningful rather than cosmetic.
    const cleaned = usablePromptSuggestions([
      one({ id: 'a' }),
      one({ id: 'b' }),
      one({ id: 'c' }),
    ]);
    expect(cleaned.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('newPromptSuggestion', () => {
  it('starts blank so the editor has something to fill in', () => {
    const blank = newPromptSuggestion();
    expect(blank.label).toBe('');
    expect(blank.prompt).toBe('');
  });

  it('gives each one its own id', () => {
    expect(newPromptSuggestion().id).not.toBe(newPromptSuggestion().id);
  });
});

// ---------------------------------------------------------------------------
// Page scoping
// ---------------------------------------------------------------------------

describe('paths', () => {
  /**
   * Both functions rebuild each entry field by field rather than spreading, which is deliberate but
   * means a new field is dropped unless it is listed. That is silent: the suggestion still works, it
   * just stops being page-scoped.
   */
  it('survives seeding from a template', () => {
    const seeded = seedPromptSuggestions([
      { id: 'a', label: 'Add an article', prompt: 'Add one', paths: ['/articles/*.html'] },
    ]);
    expect(seeded?.[0].paths).toEqual(['/articles/*.html']);
  });

  it('is copied on seed, not shared with the template', () => {
    const declared = [{ id: 'a', label: 'A', prompt: 'A', paths: ['/one.html'] }];
    const seeded = seedPromptSuggestions(declared)!;
    seeded[0].paths!.push('/two.html');
    expect(declared[0].paths).toEqual(['/one.html']);
  });

  it('normalises patterns on save', () => {
    const [saved] = usablePromptSuggestions([
      { id: 'a', label: 'A', prompt: 'A', paths: ['  articles/*.html  ', '', '   '] },
    ]);
    expect(saved.paths).toEqual(['/articles/*.html']);
  });

  it('drops the field when nothing survives, rather than writing an empty array', () => {
    // `paths: []` reads as unscoped but differs on the wire, so an emptied toggle must not persist.
    const [saved] = usablePromptSuggestions([
      { id: 'a', label: 'A', prompt: 'A', paths: ['   ', ''] },
    ]);
    expect('paths' in saved).toBe(false);
  });

  it('leaves an unscoped suggestion without the field', () => {
    const [saved] = usablePromptSuggestions([{ id: 'a', label: 'A', prompt: 'A' }]);
    expect('paths' in saved).toBe(false);
  });
});
