/**
 * Content section state for the Styles tab: inline text editing and image replacement.
 * Pure functions — no side effects — so refusals are testable as return values.
 */

import { elementKind } from '@/lib/preview/toolbar-dom';
import type { FocusContextPayload } from '@/lib/preview/types';
import type { ApplyResult } from '@/lib/direct-edit/types';
import type { TextReadResult } from '@/lib/direct-edit/apply-text';
import { textIsChanged, textRefusal, type TextRefusal } from '@/components/text-popover/state';

/** The two shapes the section takes. A third would be an empty header, which is worse than none. */
export type ContentKind = 'image' | 'text';

/**
 * What the CONTENT section offers for this selection, or `null` to leave it out entirely.
 *
 * A container has no content this panel can edit, and a CONTENT heading over nothing tells the user
 * the feature is broken rather than that it does not apply. `null` for no selection too — the tab
 * renders "No element selected" and never reaches this.
 */
export function contentKind(selection: FocusContextPayload | null): ContentKind | null {
  if (!selection) return null;
  const kind = elementKind(selection);
  return kind === 'container' ? null : kind;
}

/** Both read and write must be present; a reader with no writer loses typed input. */
export interface ContentCapabilities {
  canEditText: boolean;
  canReplaceImage: boolean;
}

/** Returns the content section for this element kind, or null. Hosts omit the callbacks to hide the section entirely. */
export function contentSection(
  selection: FocusContextPayload | null,
  capabilities: ContentCapabilities,
): ContentKind | null {
  const kind = contentKind(selection);
  if (kind === 'text') return capabilities.canEditText ? 'text' : null;
  if (kind === 'image') return capabilities.canReplaceImage ? 'image' : null;
  return null;
}

/**
 * What an `<img src>` points at, as far as the *host* document can tell.
 *
 * The panel renders in the app's document, not the frame's, so a project-relative `src` is not a URL
 * it can load — the bytes have to come out of the VFS (see `./use-image-url.ts`). This says which of
 * those two it is, and refuses to guess in the one case it cannot answer: a `../` path is relative to
 * the page the element is on, which is not on the selection payload.
 */
export type ImageSource =
  /** Loadable as written — an absolute URL, a `data:` payload, or an object URL. */
  | { kind: 'external'; url: string }
  /** A path inside the project, rooted, with any query or fragment dropped. */
  | { kind: 'project'; path: string };

export function resolveImageSrc(src: string | null | undefined): ImageSource | null {
  const raw = (src ?? '').trim();
  if (raw === '') return null;
  // `//cdn.example.com/x.png` is an absolute URL with the page's scheme, and so is anything with a
  // scheme of its own. Neither is in the project.
  if (raw.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return { kind: 'external', url: raw };
  }
  const cut = raw.search(/[?#]/);
  const bare = cut === -1 ? raw : raw.slice(0, cut);
  if (bare === '') return null;
  // Relative to the containing page, which this payload does not name. Saying nothing is honest;
  // guessing `/` would show the user a different project file, or a broken tile.
  if (bare.startsWith('../') || bare === '..') return null;
  const withoutDot = bare.startsWith('./') ? bare.slice(2) : bare;
  if (withoutDot === '') return null;
  return { kind: 'project', path: withoutDot.startsWith('/') ? withoutDot : `/${withoutDot}` };
}

/** Inline text field, not a dialog. The toolbar's Text dialog is separate because it has no panel to anchor to. */
export interface TextEditState {
  /** Monotonic counter to discard late async reads after a selection change. */
  epoch: number;
  /** The text as it was read. `null` while a read is outstanding, and after one refused. */
  original: string | null;
  text: string;
  loading: boolean;
  busy: boolean;
  refusal: TextRefusal | null;
  /** A held-back edit: nothing was written, and nothing will be until the user says yes. */
  pending: { instances: number; file?: string } | null;
}

export function emptyTextEditState(): TextEditState {
  return {
    epoch: 0,
    original: null,
    text: '',
    loading: false,
    busy: false,
    refusal: null,
    pending: null,
  };
}

export type TextEditEvent =
  /** The panel's selection changed. `kind` decides whether there is anything to read. */
  | { type: 'select'; kind: ContentKind | null }
  | { type: 'read'; epoch: number; result: TextReadResult }
  | { type: 'edit'; text: string }
  | { type: 'save' }
  /** The user accepted that the write changes every instance of a shared source tag. */
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'applied'; epoch: number; result: ApplyResult };

export type TextEditCommand =
  | { kind: 'read'; epoch: number }
  | { kind: 'apply'; epoch: number; text: string; confirmedMultiInstance: boolean };

export interface TextEditTransition {
  state: TextEditState;
  commands: TextEditCommand[];
}

/**
 * Whether Save does anything.
 *
 * Unchanged text is not a write — `applyText` reports it as done with nothing written — and a live
 * button for it invites the user to press something that visibly does nothing. Compared against the
 * text as it was *read*, entities and all, because that is the string the writer compares too, which
 * is what {@link textIsChanged} exists to state once.
 */
export function textSaveEnabled(state: TextEditState): boolean {
  if (state.original === null || state.loading || state.busy || state.pending) return false;
  return textIsChanged(state.original, state.text);
}

export function reduceTextEdit(state: TextEditState, event: TextEditEvent): TextEditTransition {
  switch (event.type) {
    case 'select': {
      const next = { ...emptyTextEditState(), epoch: state.epoch + 1 };
      if (event.kind !== 'text') return { state: next, commands: [] };
      return { state: { ...next, loading: true }, commands: [{ kind: 'read', epoch: next.epoch }] };
    }

    case 'read': {
      if (event.epoch !== state.epoch) return { state, commands: [] };
      if (event.result.ok) {
        return {
          state: {
            ...state,
            loading: false,
            refusal: null,
            original: event.result.text,
            text: event.result.text,
          },
          commands: [],
        };
      }
      return {
        state: { ...state, loading: false, original: null, text: '', refusal: textRefusal(event.result) },
        commands: [],
      };
    }

    case 'edit':
      if (state.original === null) return { state, commands: [] };
      return { state: { ...state, text: event.text }, commands: [] };

    case 'save': {
      if (!textSaveEnabled(state)) return { state, commands: [] };
      return {
        state: { ...state, busy: true, refusal: null, pending: null },
        commands: [{
          kind: 'apply',
          epoch: state.epoch,
          text: state.text,
          confirmedMultiInstance: false,
        }],
      };
    }

    case 'confirm': {
      if (!state.pending) return { state, commands: [] };
      // The flag, not a second unconfirmed attempt — which would refuse identically and for ever.
      return {
        state: { ...state, busy: true, pending: null, refusal: null },
        commands: [{
          kind: 'apply',
          epoch: state.epoch,
          text: state.text,
          confirmedMultiInstance: true,
        }],
      };
    }

    case 'cancel':
      return { state: { ...state, pending: null, busy: false }, commands: [] };

    case 'applied': {
      if (event.epoch !== state.epoch) return { state, commands: [] };
      const result = event.result;
      if (result.ok) {
        return {
          state: { ...state, busy: false, pending: null, refusal: null, original: state.text },
          commands: [],
        };
      }
      if (result.reason === 'needs-confirmation') {
        return {
          state: {
            ...state,
            busy: false,
            refusal: null,
            pending: { instances: result.instances ?? 0, file: result.file },
          },
          commands: [],
        };
      }
      return {
        state: { ...state, busy: false, pending: null, refusal: textRefusal(result) },
        commands: [],
      };
    }
  }
}
