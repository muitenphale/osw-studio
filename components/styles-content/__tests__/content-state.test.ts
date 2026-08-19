import { describe, it, expect } from 'vitest';
import {
  contentKind,
  contentSection,
  emptyTextEditState,
  reduceTextEdit,
  resolveImageSrc,
  textSaveEnabled,
  type TextEditEvent,
  type TextEditState,
} from '../content-state';
import type { FocusContextPayload } from '@/lib/preview/types';

/**
 * The CONTENT section's decisions.
 *
 * All of them are here rather than in the render test for the reason `state.ts` gives: with no React
 * Testing Library in this repo, "a refusal writes nothing" is only assertable if the not-writing is a
 * visible absence in a returned command array. `content-section.test.tsx` mounts the panel and covers
 * only what needs a DOM.
 */

const payload = (over: Partial<FocusContextPayload> = {}): FocusContextPayload => ({
  domPath: 'html > body > main > p',
  tagName: 'P',
  nodeId: 'n1',
  attributes: {},
  outerHTML: '<p></p>',
  ...over,
});

const TEXT = payload({ tagName: 'H1', textBearing: true });
const IMAGE = payload({ tagName: 'IMG', attributes: { src: '/images/a.png' } });
const CONTAINER = payload({ tagName: 'DIV' });

const ABLE = { canEditText: true, canReplaceImage: true };

/** Run a sequence from the empty state, returning the state and the last transition's commands. */
function run(...events: TextEditEvent[]): { state: TextEditState; commands: unknown[] } {
  let state = emptyTextEditState();
  let commands: unknown[] = [];
  for (const event of events) {
    const transition = reduceTextEdit(state, event);
    state = transition.state;
    commands = transition.commands;
  }
  return { state, commands };
}

/** Everything a text element needs before it can be saved: selected, read, and retyped. */
function loaded(text = 'Hello', over: Partial<TextEditState> = {}): TextEditState {
  const { state } = run(
    { type: 'select', kind: 'text' },
    { type: 'read', epoch: 1, result: { ok: true, text, file: '/index.html', instances: 1 } },
  );
  return { ...state, ...over };
}

describe('which section the element gets', () => {
  it('is the element kind, and nothing for a container', () => {
    expect(contentKind(TEXT)).toBe('text');
    expect(contentKind(IMAGE)).toBe('image');
    // An empty CONTENT heading is worse than none.
    expect(contentKind(CONTAINER)).toBe(null);
    expect(contentKind(null)).toBe(null);
  });

  it('is nothing when the host gave the panel no way to do that edit', () => {
    // The absence is the same one a container produces, which is why the props are optional rather
    // than required-and-nullable: there is no disabled state to render for content.
    expect(contentSection(TEXT, { canEditText: false, canReplaceImage: true })).toBe(null);
    expect(contentSection(IMAGE, { canEditText: true, canReplaceImage: false })).toBe(null);
    expect(contentSection(TEXT, ABLE)).toBe('text');
    expect(contentSection(IMAGE, ABLE)).toBe('image');
  });
});

describe('resolveImageSrc', () => {
  it('roots a project path however it was written', () => {
    expect(resolveImageSrc('/images/a.png')).toEqual({ kind: 'project', path: '/images/a.png' });
    expect(resolveImageSrc('images/a.png')).toEqual({ kind: 'project', path: '/images/a.png' });
    expect(resolveImageSrc('./images/a.png')).toEqual({ kind: 'project', path: '/images/a.png' });
  });

  it('drops a query or a fragment, which is not part of the path in storage', () => {
    expect(resolveImageSrc('/logo.png?v=2')).toEqual({ kind: 'project', path: '/logo.png' });
    expect(resolveImageSrc('/logo.svg#icon')).toEqual({ kind: 'project', path: '/logo.svg' });
  });

  it('passes an address the document can already load straight through', () => {
    expect(resolveImageSrc('https://cdn.example.com/a.png'))
      .toEqual({ kind: 'external', url: 'https://cdn.example.com/a.png' });
    expect(resolveImageSrc('//cdn.example.com/a.png'))
      .toEqual({ kind: 'external', url: '//cdn.example.com/a.png' });
    expect(resolveImageSrc('data:image/png;base64,AAA'))
      .toEqual({ kind: 'external', url: 'data:image/png;base64,AAA' });
  });

  it('answers nothing rather than guessing', () => {
    // `../` is relative to the page the element is on, which the selection payload does not name.
    expect(resolveImageSrc('../images/a.png')).toBe(null);
    expect(resolveImageSrc('')).toBe(null);
    expect(resolveImageSrc('   ')).toBe(null);
    expect(resolveImageSrc(undefined)).toBe(null);
    expect(resolveImageSrc('?v=2')).toBe(null);
  });
});

describe('selecting an element', () => {
  it('asks what a text element says', () => {
    const { state, commands } = run({ type: 'select', kind: 'text' });
    expect(commands).toEqual([{ kind: 'read', epoch: 1 }]);
    expect(state.loading).toBe(true);
  });

  it('asks nothing for an image or a container', () => {
    expect(run({ type: 'select', kind: 'image' }).commands).toEqual([]);
    expect(run({ type: 'select', kind: null }).commands).toEqual([]);
  });

  it('takes the last element words off the screen', () => {
    const state = loaded('Hello');
    const next = reduceTextEdit(state, { type: 'select', kind: 'text' }).state;
    // A field still holding them is a field offering to write one element's text into another.
    expect(next.original).toBe(null);
    expect(next.text).toBe('');
  });
});

describe('reading what it says', () => {
  it('fills the field with the text as read', () => {
    const state = loaded('Hello');
    expect(state).toMatchObject({ loading: false, original: 'Hello', text: 'Hello' });
  });

  it('shows a refusal and no field', () => {
    const { state } = run(
      { type: 'select', kind: 'text' },
      { type: 'read', epoch: 1, result: { ok: false, reason: 'has-children', file: '/index.html' } },
    );
    expect(state.refusal).toEqual({ reason: 'has-children', file: '/index.html' });
    // An editable box over text the writer will refuse loses whatever is typed into it.
    expect(state.original).toBe(null);
  });

  it('narrows a reason it has no sentence for rather than rendering nothing', () => {
    const { state } = run(
      { type: 'select', kind: 'text' },
      { type: 'read', epoch: 1, result: { ok: false, reason: 'ambiguous-stylesheet' } },
    );
    expect(state.refusal?.reason).toBe('unresolvable');
  });

  it('drops an answer about the element the user has already left', () => {
    const { state } = run(
      { type: 'select', kind: 'text' },
      { type: 'select', kind: 'text' },
      { type: 'read', epoch: 1, result: { ok: true, text: 'stale', file: '/a.html', instances: 1 } },
    );
    expect(state.original).toBe(null);
    expect(state.text).toBe('');
    expect(state.loading).toBe(true);
  });
});

describe('saving', () => {
  it('does nothing until the text differs from what was read', () => {
    const state = loaded('Hello');
    expect(textSaveEnabled(state)).toBe(false);
    expect(reduceTextEdit(state, { type: 'save' }).commands).toEqual([]);

    const edited = reduceTextEdit(state, { type: 'edit', text: 'Goodbye' }).state;
    expect(textSaveEnabled(edited)).toBe(true);
  });

  it('ignores a keystroke against a field that is not on the screen', () => {
    const { state } = run({ type: 'select', kind: 'text' });
    expect(reduceTextEdit(state, { type: 'edit', text: 'typed' }).state.text).toBe('');
  });

  it('writes what is in the field, unconfirmed', () => {
    const edited = reduceTextEdit(loaded('Hello'), { type: 'edit', text: 'Goodbye' }).state;
    const transition = reduceTextEdit(edited, { type: 'save' });
    expect(transition.commands).toEqual([
      { kind: 'apply', epoch: 1, text: 'Goodbye', confirmedMultiInstance: false },
    ]);
    expect(transition.state.busy).toBe(true);
  });

  it('is inert while a write is in flight or a question is open', () => {
    const edited = reduceTextEdit(loaded('Hello'), { type: 'edit', text: 'Goodbye' }).state;
    expect(textSaveEnabled({ ...edited, busy: true })).toBe(false);
    expect(textSaveEnabled({ ...edited, pending: { instances: 3 } })).toBe(false);
    expect(textSaveEnabled({ ...edited, loading: true })).toBe(false);
  });

  it('goes inert again once the write lands', () => {
    const edited = reduceTextEdit(loaded('Hello'), { type: 'edit', text: 'Goodbye' }).state;
    const saved = reduceTextEdit(edited, { type: 'save' }).state;
    const done = reduceTextEdit(saved, {
      type: 'applied',
      epoch: 1,
      result: { ok: true, file: '/index.html', filesWritten: ['/index.html'] },
    }).state;
    expect(done.original).toBe('Goodbye');
    expect(done.busy).toBe(false);
    expect(textSaveEnabled(done)).toBe(false);
  });
});

describe('a shared source tag', () => {
  it('holds the write and says how many elements it would change', () => {
    const edited = reduceTextEdit(loaded('Hello'), { type: 'edit', text: 'Goodbye' }).state;
    const saved = reduceTextEdit(edited, { type: 'save' }).state;
    const transition = reduceTextEdit(saved, {
      type: 'applied',
      epoch: 1,
      result: { ok: false, reason: 'needs-confirmation', instances: 4, file: '/card.hbs', filesWritten: [] },
    });
    // Held, not written: no apply command goes out until the user says yes.
    expect(transition.commands).toEqual([]);
    expect(transition.state.pending).toEqual({ instances: 4, file: '/card.hbs' });
    expect(transition.state.refusal).toBe(null);
  });

  it('re-applies with the flag set, not with a second unconfirmed attempt', () => {
    const held: TextEditState = loaded('Hello', {
      text: 'Goodbye',
      pending: { instances: 4, file: '/card.hbs' },
    });
    const transition = reduceTextEdit(held, { type: 'confirm' });
    // An unconfirmed retry would refuse identically and for ever, and read as a dead button.
    expect(transition.commands).toEqual([
      { kind: 'apply', epoch: 1, text: 'Goodbye', confirmedMultiInstance: true },
    ]);
    expect(transition.state.pending).toBe(null);
  });

  it('writes nothing when the question is dismissed', () => {
    const held = loaded('Hello', { text: 'Goodbye', pending: { instances: 4 } });
    const transition = reduceTextEdit(held, { type: 'cancel' });
    expect(transition.commands).toEqual([]);
    expect(transition.state.pending).toBe(null);
    // The words survive: the user typed them and nothing was written.
    expect(transition.state.text).toBe('Goodbye');
  });
});

describe('a refused write', () => {
  it('is shown, and keeps what the user typed', () => {
    const busy = loaded('Hello', { text: 'Goodbye', busy: true });
    const transition = reduceTextEdit(busy, {
      type: 'applied',
      epoch: 1,
      result: { ok: false, reason: 'has-expression', file: '/index.hbs', filesWritten: [] },
    });
    expect(transition.state.refusal).toEqual({ reason: 'has-expression', file: '/index.hbs' });
    expect(transition.state.text).toBe('Goodbye');
    expect(transition.state.busy).toBe(false);
  });

  it('is dropped when it is about the element the user has already left', () => {
    const busy = loaded('Hello', { text: 'Goodbye', busy: true });
    const transition = reduceTextEdit(busy, {
      type: 'applied',
      epoch: 99,
      result: { ok: false, reason: 'has-expression', filesWritten: [] },
    });
    // Attributing one element's refusal to another is worse than saying nothing.
    expect(transition.state.refusal).toBe(null);
  });
});
