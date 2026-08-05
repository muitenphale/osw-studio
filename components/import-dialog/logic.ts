/**
 * The import preview's pure logic, kept out of the component so it can be tested.
 *
 * Everything here is a function of a plan plus the user's decisions. Nothing reads storage and
 * nothing renders, which is what makes the two rules the dialog rests on checkable:
 *
 * 1. **An absent resolution means keep-mine.** Never applying is the safe outcome, so a decision
 *    the user did not make can only ever come out conservative.
 * 2. **A resolution is keyed by what identifies the thing.** Files by their path as the *project*
 *    spells it, backend records by `backendResolutionKey(kind, name)`, settings by their key.
 *    Name alone would let an edge function and a schedule called 'nightly' share one decision.
 */
import { backendResolutionKey } from '@/lib/vfs/archive';
import type {
  FileConflict,
  FileResolution,
  ImportPlan,
  ImportResolutions,
  ImportTarget,
  SettingChange,
  SettingResolution,
} from '@/lib/vfs/archive';
import type { BackendResolutionKind } from '@/lib/vfs/archive';
import { RUNTIME_CONFIGS } from '@/lib/runtimes/registry';

export type BackendKind = 'edge' | 'server' | 'scheduled';

export function emptyResolutions(): ImportResolutions {
  return { files: {}, backend: {}, settings: {}, skipBlocked: false };
}

/** Absent means keep-mine — see the module note. */
export function fileResolutionOf(resolutions: ImportResolutions, path: string): FileResolution {
  return resolutions.files[path] ?? 'keep-mine';
}

export function backendResolutionOf(
  resolutions: ImportResolutions,
  kind: BackendResolutionKind,
  name: string
): FileResolution {
  return resolutions.backend[backendResolutionKey(kind, name)] ?? 'keep-mine';
}

export function settingResolutionOf(
  resolutions: ImportResolutions,
  key: SettingChange['key']
): SettingResolution {
  return resolutions.settings[key] ?? 'keep-current';
}

/**
 * Which options a file conflict may offer.
 *
 * `keepBothPath` is absent when no renamed candidate fits the 200-character path limit, and a
 * third option that cannot be carried out is worse than two that can.
 */
export function fileOptionsFor(conflict: FileConflict): FileResolution[] {
  return conflict.keepBothPath
    ? ['keep-mine', 'replace', 'keep-both']
    : ['keep-mine', 'replace'];
}

export interface ReplaceCounts {
  files: number;
  backend: number;
  settings: number;
}

/** What the user has asked to overwrite. Only 'replace' destroys; 'keep-both' writes beside. */
export function countReplacements(
  plan: ImportPlan,
  resolutions: ImportResolutions,
  target: ImportTarget
): ReplaceCounts {
  // A new project has nothing to overwrite, whatever the resolution map happens to hold.
  if (target.kind === 'new-project') return { files: 0, backend: 0, settings: 0 };

  let files = 0;
  for (const conflict of plan.files.conflicts) {
    if (fileResolutionOf(resolutions, conflict.path) === 'replace') files += 1;
  }
  let backend = 0;
  for (const conflict of plan.backend.conflicts) {
    if (backendResolutionOf(resolutions, conflict.kind, conflict.name) === 'replace') backend += 1;
  }
  let settings = 0;
  for (const change of plan.settingChanges) {
    if (settingResolutionOf(resolutions, change.key) === 'use-archive') settings += 1;
  }
  return { files, backend, settings };
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

/** The confirm button's label, which states the damage rather than the action. */
export function confirmLabel(
  plan: ImportPlan,
  resolutions: ImportResolutions,
  target: ImportTarget
): string {
  if (target.kind === 'new-project') return 'Create project';
  const counts = countReplacements(plan, resolutions, target);
  const parts: string[] = [];
  if (counts.files > 0) parts.push(plural(counts.files, 'file'));
  if (counts.backend > 0) parts.push(plural(counts.backend, 'function'));
  if (counts.settings > 0) parts.push(plural(counts.settings, 'setting'));
  if (parts.length === 0) return 'Import';
  return `Import · replace ${parts.join(', ')}`;
}

/**
 * Confirm is gated on errors alone. Warnings never block: the Browser-mode one says backend
 * features will not *run* here, not that anything is wrong with the archive.
 */
export function canConfirm(plan: ImportPlan, resolutions: ImportResolutions): boolean {
  return plan.errors.length === 0 || resolutions.skipBlocked;
}

/**
 * Whether the plan would write anything at all, ignoring the resolutions.
 *
 * Deliberately blind to the unchanged buckets — a file that already matches is nothing to write.
 * That makes this the wrong question to ask on its own about *why* there is nothing to write, so
 * nothing branches on it except `selectPhase`, which asks the rest of the question.
 *
 * `secretsMetadataChanged` is deliberately not counted. A secret the project already has keeps its
 * own description — nothing in the dialog offers a choice about that, so apply writes nothing for
 * it. Counting it sent an archive whose only difference was a description to the `ready` screen,
 * where the Import button then reported 'Nothing was written.'
 */
export function hasAnythingToImport(plan: ImportPlan): boolean {
  return (
    plan.files.added.length > 0 ||
    plan.files.conflicts.length > 0 ||
    plan.backend.added.length > 0 ||
    plan.backend.conflicts.length > 0 ||
    plan.backend.secretsAdded.length > 0 ||
    plan.settingChanges.length > 0
  );
}

export function isWrongFormat(plan: ImportPlan): boolean {
  return plan.format === 'osws-backup' || plan.format === 'oswt-template';
}

/** The phases a *plan* can put the dialog in. Reading and applying own the rest. */
export type PlanPhase = 'wrong-format' | 'blocked' | 'nothing-to-do' | 'ready';

/**
 * Which screen a plan calls for.
 *
 * The distinction this exists to make: **an archive that matches the project and an archive that
 * was entirely refused both write nothing, and they are opposite outcomes.** Downloading a project
 * and importing it straight back is the round trip the whole feature is named for, and it produces
 * a plan with everything in `unchanged` and no errors. Deciding on `hasAnythingToImport` alone put
 * that on a red "every entry was refused" screen — a success reported as a failure, on the most
 * predictable action a user can take.
 *
 * So `blocked` now means what it says: nothing to import, nothing that matched, and errors to show
 * for it. Anything else with nothing to import is `nothing-to-do`, which is neutral and may still
 * list errors underneath — "it matches, except for these two I could not read" is a real state.
 */
export function selectPhase(plan: ImportPlan): PlanPhase {
  if (isWrongFormat(plan)) return 'wrong-format';
  if (hasAnythingToImport(plan)) return 'ready';
  if (hasUnchanged(plan)) return 'nothing-to-do';
  // Nothing to write and nothing that matched. Only red when there is a refusal to point at; an
  // archive that is simply empty gets the neutral screen and says so.
  return plan.errors.length > 0 ? 'blocked' : 'nothing-to-do';
}

function hasUnchanged(plan: ImportPlan): boolean {
  return plan.files.unchanged.length > 0 || plan.backend.unchanged.length > 0;
}

/** What the neutral 'nothing to do' screen says, which depends on why there is nothing to do. */
export function nothingToDoSummary(plan: ImportPlan): string {
  const files = plan.files.unchanged.length;
  const backend = plan.backend.unchanged.length;
  const parts: string[] = [];
  if (files > 0) parts.push(plural(files, 'file'));
  if (backend > 0) parts.push(plural(backend, 'server function'));
  if (parts.length === 0) {
    return 'This archive has no files to import.';
  }
  // The verb agrees with the whole subject, and leading with the count rather than 'All' keeps
  // the one-file case from reading as 'All 1 file'.
  const verb = files + backend === 1 ? 'matches' : 'match';
  return `${parts.join(' and ')} in this archive already ${verb} the project.`;
}

/** Apply-to-all for files. Rows whose only options are two never receive 'keep-both'. */
export function applyToAllFiles(
  plan: ImportPlan,
  resolution: FileResolution
): Record<string, FileResolution> {
  const next: Record<string, FileResolution> = {};
  for (const conflict of plan.files.conflicts) {
    next[conflict.path] =
      resolution === 'keep-both' && !conflict.keepBothPath ? 'keep-mine' : resolution;
  }
  return next;
}

export function applyToAllBackend(
  plan: ImportPlan,
  resolution: FileResolution
): Record<string, FileResolution> {
  const next: Record<string, FileResolution> = {};
  for (const conflict of plan.backend.conflicts) {
    next[backendResolutionKey(conflict.kind, conflict.name)] = resolution;
  }
  return next;
}

/** The one option every row in a category agrees on, or undefined when they disagree. */
export function sharedFileResolution(
  plan: ImportPlan,
  resolutions: ImportResolutions
): FileResolution | undefined {
  return shared(plan.files.conflicts.map((c) => fileResolutionOf(resolutions, c.path)));
}

export function sharedBackendResolution(
  plan: ImportPlan,
  resolutions: ImportResolutions
): FileResolution | undefined {
  return shared(
    plan.backend.conflicts.map((c) => backendResolutionOf(resolutions, c.kind, c.name))
  );
}

function shared<T>(values: T[]): T | undefined {
  if (values.length === 0) return undefined;
  const first = values[0];
  return values.every((value) => value === first) ? first : undefined;
}

export type TallyTone = 'added' | 'conflicting' | 'unchanged' | 'blocked';

export interface Tally {
  tone: TallyTone;
  count: number;
  label: string;
}

/**
 * The at-a-glance answer, above the scroll region. Zeroes are dropped rather than shown as 0.
 *
 * May legitimately come back empty — a settings-only import writes no files and no functions, and
 * a row of nothing is not a summary. The caller decides not to render rather than this returning a
 * placeholder tally, because 'nothing' would then have to be worded, and it already is: the
 * settings section states the whole change.
 */
export function planTallies(plan: ImportPlan, target: ImportTarget): Tally[] {
  const tallies: Tally[] = [];
  const push = (tone: TallyTone, count: number, label: string) => {
    if (count > 0) tallies.push({ tone, count, label });
  };

  if (target.kind === 'new-project') {
    push('added', plan.files.added.length, plan.files.added.length === 1 ? 'file' : 'files');
    const backend = plan.backend.added.length;
    push('added', backend, backend === 1 ? 'server function' : 'server functions');
  } else {
    push('added', plan.files.added.length, 'new');
    push('conflicting', plan.files.conflicts.length, 'already exist');
    push('unchanged', plan.files.unchanged.length, 'identical');
    // Backend counts belong here too, and say 'server function' where the file counts say nothing:
    // an archive that adds one edge function and replaces another is a real import, and without
    // these it reached this screen with a blank tally row. The labels also keep the tally keys
    // ('added-new' against 'added-new server function') distinct from the file ones.
    const backendAdded = plan.backend.added.length;
    push(
      'added',
      backendAdded,
      backendAdded === 1 ? 'new server function' : 'new server functions'
    );
    const backendConflicts = plan.backend.conflicts.length;
    push(
      'conflicting',
      backendConflicts,
      backendConflicts === 1 ? 'server function already exists' : 'server functions already exist'
    );
  }
  push('blocked', plan.errors.length, "can't be imported");
  return tallies;
}

/** Directory dimmed, filename not — a column of paths is scanned by name, not re-read from left. */
export function splitPath(path: string): { dir: string; name: string } {
  const cut = path.lastIndexOf('/');
  if (cut < 0) return { dir: '', name: path };
  return { dir: path.slice(0, cut + 1), name: path.slice(cut + 1) };
}

const BACKEND_KIND_LABELS: Record<BackendKind, string> = {
  edge: 'edge',
  server: 'server',
  scheduled: 'scheduled',
};

export function backendKindLabel(kind: BackendKind): string {
  return BACKEND_KIND_LABELS[kind];
}

const RUNTIME_LABELS = new Map(RUNTIME_CONFIGS.map((config) => [config.id as string, config.label]));

/**
 * How a setting's value reads in the preview.
 *
 * A runtime is stored as an id and shown as its label, because 'handlebars' is not what the
 * project settings screen calls it and a preview that names it differently is a preview the user
 * has to translate.
 */
export function formatSettingValue(key: SettingChange['key'], value: string | undefined): string {
  if (value === undefined || value === '') return 'not set';
  if (key === 'runtime') return RUNTIME_LABELS.get(value) ?? value;
  return value;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A timestamp as the row states it. Recent times are relative because 'edited 6 minutes ago' is
 * the fact that decides a conflict; anything older is a date, since 'edited 41 days ago' is not.
 */
export function formatWhen(date: Date | undefined, now: number = Date.now()): string {
  if (!date) return 'unknown';
  const elapsed = now - date.getTime();
  if (elapsed < 0) return formatDate(date);
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${plural(minutes, 'minute')} ago`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${plural(hours, 'hour')} ago`;
  }
  if (elapsed < 7 * DAY) {
    const days = Math.floor(elapsed / DAY);
    return `${plural(days, 'day')} ago`;
  }
  return formatDate(date);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A one-line report of what an apply did, for the closing screen. */
export function appliedSummary(applied: { files: number; backend: number; settings: number }): string {
  const parts: string[] = [];
  if (applied.files > 0) parts.push(plural(applied.files, 'file'));
  if (applied.backend > 0) parts.push(plural(applied.backend, 'function'));
  if (applied.settings > 0) parts.push(plural(applied.settings, 'setting'));
  if (parts.length === 0) return 'Nothing was written.';
  return `Imported ${parts.join(', ')}.`;
}
