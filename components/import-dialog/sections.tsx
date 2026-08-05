'use client';

/**
 * One component per section of the import preview.
 *
 * Each takes what it needs from a plan and, where there is a decision to make, the current
 * resolutions and a way to report a change; none reads storage, keeps state that outlives a
 * disclosure triangle, or decides anything. What a resolution *means* lives in `logic.ts`; the
 * shapes these are built from live in `primitives.tsx`.
 */

import * as React from 'react';
import { Check, ChevronDown, ChevronRight, Info, Lock } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { backendResolutionKey, formatBytes } from '@/lib/vfs/archive';
import type {
  ApplyResult,
  ArchiveIssue,
  FileResolution,
  ImportPlan,
  ImportResolutions,
  ImportTarget,
  ProjectManifest,
  SettingChange,
  SettingResolution,
} from '@/lib/vfs/archive';
import {
  applyToAllBackend,
  applyToAllFiles,
  appliedSummary,
  backendKindLabel,
  backendResolutionOf,
  fileOptionsFor,
  fileResolutionOf,
  formatSettingValue,
  formatWhen,
  planTallies,
  settingResolutionOf,
  sharedBackendResolution,
  sharedFileResolution,
  splitPath,
  type TallyTone,
} from './logic';
import {
  AddedRow,
  ALL_FILE_OPTIONS,
  ApplyToAll,
  Banner,
  BlockedList,
  FILE_OPTION_LABELS,
  PathLabel,
  ResolutionRow,
  Section,
  Segmented,
  SETTING_OPTION_LABELS,
  SETTING_OPTIONS,
} from './primitives';

export { Banner, BlockedList } from './primitives';

const TALLY_TONES: Record<TallyTone, string> = {
  added: 'bg-green-500/10 text-green-600 dark:text-green-400',
  conflicting: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  unchanged: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  blocked: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

export type ResolutionPatch = (previous: ImportResolutions) => ImportResolutions;

/* -------------------------------------------------------------------------------------------- */
/* Sections                                                                                       */
/* -------------------------------------------------------------------------------------------- */

/** The at-a-glance answer. Sits above the scroll region, so it is never scrolled away from. */
export function Tallies({ plan, target }: { plan: ImportPlan; target: ImportTarget }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {planTallies(plan, target).map((tally) => (
        <span
          key={`${tally.tone}-${tally.label}`}
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            TALLY_TONES[tally.tone]
          )}
        >
          <span className="font-semibold tabular-nums">{tally.count}</span>
          {tally.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Warnings. None of them block — `plan.errors` do that — but they are not all the same weight.
 *
 * `ai-instructions` is the one a user is deciding something by: accepting it changes how the agent
 * behaves on this project, not what the project contains. It gets the orange treatment the
 * conflicting rows use, so it is not skimmed past as a remark. Still not red: nothing is refused
 * and nothing is stopped.
 *
 * The Browser-mode one uses `Lock` to match the existing "Server Mode Required" screen, so the two
 * read as one fact stated twice rather than as two different problems.
 */
export function WarningBanners({ warnings }: { warnings: ArchiveIssue[] }) {
  return (
    <>
      {warnings.map((warning, index) => (
        <Banner
          key={`${warning.code}-${index}`}
          tone={warning.code === 'ai-instructions' ? 'orange' : 'neutral'}
          icon={
            warning.code === 'server-mode-required'
              ? Lock
              : warning.code === 'ai-instructions'
                ? undefined
                : Info
          }
          title={WARNING_TITLES[warning.code] ?? 'Note'}
        >
          {warning.message}
        </Banner>
      ))}
    </>
  );
}

/**
 * A heading per warning the dialog has something to add to. The message already states the fact,
 * so a title that restates it says the same thing twice in two sizes; these name the category
 * instead, which is what a heading is for when the body is a full sentence.
 */
const WARNING_TITLES: Partial<Record<ArchiveIssue['code'], string>> = {
  'server-mode-required': 'Backend features need Server Mode',
  'ai-instructions': 'AI instructions',
};

/** A folder of HTML from somewhere else is a real thing to want; it just says what it cannot know. */
export function LooseFilesBanner({ isNewProject }: { isNewProject: boolean }) {
  return (
    <Banner tone="neutral" title="These are files, not a project archive">
      There is no <code className="font-mono text-xs">project.json</code>, so no runtime, entry
      point or server functions to read. The files import exactly as they are
      {isNewProject ? '.' : " and this project's settings stay untouched."}
    </Banner>
  );
}

export function NewProjectSection({ manifest }: { manifest: ProjectManifest }) {
  return (
    <Section title="Will be created">
      <PlainRow label="Name" value={manifest.name} />
      {manifest.runtime && (
        <PlainRow label="Runtime" value={formatSettingValue('runtime', manifest.runtime)} />
      )}
      {manifest.entryPoint && <PlainRow label="Entry point" value={manifest.entryPoint} />}
    </Section>
  );
}

function PlainRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-muted/50">
      <span className="text-sm font-medium">{label}</span>
      <span className="flex-1" />
      <span className="text-xs text-muted-foreground">{value}</span>
    </div>
  );
}

export function FileConflictsSection({
  plan,
  resolutions,
  onChange,
}: {
  plan: ImportPlan;
  resolutions: ImportResolutions;
  onChange: (patch: ResolutionPatch) => void;
}) {
  return (
    <Section
      title="Already exist"
      count={`${plan.files.conflicts.length}`}
      control={
        <ApplyToAll
          label="Resolution for all file conflicts"
          value={sharedFileResolution(plan, resolutions)}
          onChange={(next) =>
            onChange((prev) => ({ ...prev, files: applyToAllFiles(plan, next) }))
          }
        />
      }
    >
      {plan.files.conflicts.map((conflict) => (
        <FileConflictRow
          key={conflict.path}
          conflict={conflict}
          value={fileResolutionOf(resolutions, conflict.path)}
          onChange={(next) =>
            onChange((prev) => ({ ...prev, files: { ...prev.files, [conflict.path]: next } }))
          }
        />
      ))}
    </Section>
  );
}

function FileConflictRow({
  conflict,
  value,
  onChange,
}: {
  conflict: ImportPlan['files']['conflicts'][number];
  value: FileResolution;
  onChange: (value: FileResolution) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const renamed = value === 'keep-both' ? conflict.keepBothPath : undefined;

  return (
    <ResolutionRow
      label={<PathLabel path={conflict.path} />}
      chip={
        conflict.currentIsNewer ? (
          <span className="inline-flex items-center rounded-full bg-orange-500/10 px-2 py-px text-[11px] font-medium text-orange-600 dark:text-orange-400">
            Yours is newer
          </span>
        ) : undefined
      }
      rename={renamed ? splitPath(renamed).name : undefined}
      control={
        <Segmented
          ariaLabel={`Resolution for ${conflict.path}`}
          value={value}
          // Two options when no renamed candidate fits the 200-character path limit. A third
          // option that cannot be carried out is worse than two that can.
          options={fileOptionsFor(conflict)}
          labels={FILE_OPTION_LABELS}
          onChange={onChange}
        />
      }
      detailOpen={open}
      onToggleDetail={() => setOpen((prev) => !prev)}
      detail={
        <>
          <span className={cn(conflict.currentIsNewer && 'font-medium text-foreground')}>
            Yours · {formatBytes(conflict.currentSize)} · edited{' '}
            {formatWhen(conflict.currentUpdatedAt)}
          </span>
          <span className="text-muted-foreground/70">vs</span>
          <span className={cn(!conflict.currentIsNewer && 'font-medium text-foreground')}>
            archive · {formatBytes(conflict.incomingSize)} · saved{' '}
            {formatWhen(conflict.incomingUpdatedAt)}
          </span>
        </>
      }
    />
  );
}

/**
 * Server functions.
 *
 * Carries its own warning rather than leaning on the confirm button: the checkpoint an import
 * takes snapshots files and directories only, so replacing a function is categorically riskier
 * than replacing a file and the one shared button cannot say two different things.
 */
export function BackendSection({
  plan,
  resolutions,
  onChange,
}: {
  plan: ImportPlan;
  resolutions: ImportResolutions;
  onChange: (patch: ResolutionPatch) => void;
}) {
  const parts: string[] = [];
  if (plan.backend.added.length > 0) parts.push(`${plan.backend.added.length} new`);
  if (plan.backend.conflicts.length > 0) parts.push(`${plan.backend.conflicts.length} exists`);

  return (
    <Section
      title="Server functions"
      count={parts.join(' · ')}
      control={
        plan.backend.conflicts.length > 0 ? (
          <ApplyToAll
            label="Resolution for all function conflicts"
            value={sharedBackendResolution(plan, resolutions)}
            onChange={(next) =>
              onChange((prev) => ({ ...prev, backend: applyToAllBackend(plan, next) }))
            }
          />
        ) : undefined
      }
    >
      {plan.backend.conflicts.length > 0 && (
        <p className="px-2 pb-1 text-xs text-muted-foreground">
          Replacing a function cannot be undone. The previous code is not saved anywhere.
        </p>
      )}
      {plan.backend.added.map((record) => (
        <AddedRow
          key={backendResolutionKey(record.kind, record.name)}
          label={
            <>
              <span className="font-mono text-xs">{record.name}</span>
              <span className="flex-1" />
              <span className="text-xs text-muted-foreground">
                {backendKindLabel(record.kind)} · {record.detail}
              </span>
            </>
          }
        />
      ))}
      {plan.backend.conflicts.map((conflict) => {
        const value = backendResolutionOf(resolutions, conflict.kind, conflict.name);
        const key = backendResolutionKey(conflict.kind, conflict.name);
        return (
          <ResolutionRow
            key={key}
            label={<span className="font-mono text-xs">{conflict.name}</span>}
            meta={`${backendKindLabel(conflict.kind)} · ${conflict.detail}`}
            rename={value === 'keep-both' ? conflict.keepBothName : undefined}
            control={
              <Segmented
                ariaLabel={`Resolution for ${conflict.kind} function ${conflict.name}`}
                value={value}
                options={ALL_FILE_OPTIONS}
                labels={FILE_OPTION_LABELS}
                // Keyed by kind and name: an edge function and a schedule share one name grammar,
                // so 'nightly' alone would have one decision quietly governing both.
                onChange={(next) =>
                  onChange((prev) => ({ ...prev, backend: { ...prev.backend, [key]: next } }))
                }
              />
            }
          />
        );
      })}
    </Section>
  );
}

/**
 * An archive never carries secret values. Saying so here heads off a site failing at runtime.
 *
 * The changed-description half is a remark, not a promise: a secret the project already has is
 * left exactly as it is, description included. Nothing in the dialog offers a choice about that,
 * so the banner does not claim one was made.
 */
export function SecretsBanner({ plan }: { plan: ImportPlan }) {
  const added = plan.backend.secretsAdded;
  const changed = plan.backend.secretsMetadataChanged;
  return (
    <Banner
      tone="neutral"
      title={
        added.length > 0
          ? `${added.length} secret${added.length === 1 ? '' : 's'} will be created empty`
          : 'Secrets already in this project are left alone'
      }
    >
      {added.length > 0 && (
        <>
          {added.join(', ')} {added.length === 1 ? 'is' : 'are'} named in the archive, but values
          are never included in one. Add them in Project settings before publishing.
        </>
      )}
      {changed.length > 0 && (
        <span className="mt-1 block">
          The archive describes {changed.join(', ')} differently. {changed.length === 1 ? 'It keeps its' : 'They keep their'}{' '}
          current value and description.
        </span>
      )}
    </Banner>
  );
}

/** Two options, and the same no-undo warning the backend section carries, for the same reason. */
export function SettingsSection({
  plan,
  resolutions,
  onChange,
}: {
  plan: ImportPlan;
  resolutions: ImportResolutions;
  onChange: (patch: ResolutionPatch) => void;
}) {
  const setSetting = (key: SettingChange['key'], next: SettingResolution) =>
    onChange((prev) => ({ ...prev, settings: { ...prev.settings, [key]: next } }));

  return (
    <Section title="Project settings" count={`${plan.settingChanges.length} differ`}>
      <p className="px-2 pb-1 text-xs text-muted-foreground">
        Changing a setting cannot be undone. The checkpoint only covers files.
      </p>
      {plan.settingChanges.map((change) => (
        <ResolutionRow
          key={change.key}
          label={<span className="text-sm font-medium">{change.label}</span>}
          meta={`${formatSettingValue(change.key, change.from)} → ${formatSettingValue(
            change.key,
            change.to
          )}`}
          control={
            <Segmented
              ariaLabel={`Resolution for ${change.label}`}
              value={settingResolutionOf(resolutions, change.key)}
              options={SETTING_OPTIONS}
              labels={SETTING_OPTION_LABELS}
              onChange={(next) => setSetting(change.key, next)}
            />
          }
        />
      ))}
    </Section>
  );
}

export function BlockedSection({ issues }: { issues: ArchiveIssue[] }) {
  return (
    <Section title="Can't be imported" count={`${issues.length}`}>
      <BlockedList issues={issues} />
    </Section>
  );
}

/** `added` is worth inspecting, so it folds open. */
export function AddedFilesFold({ paths, label }: { paths: string[]; label: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2.5 rounded-md p-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted/50">
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        )}
        {label}
        <span className="tabular-nums text-muted-foreground/70">{paths.length}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-0.5 pt-1">
          {paths.map((path) => (
            <AddedRow key={path} path={path} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Counts, never lists, and with no disclosure to suggest otherwise.
 *
 * Re-importing your own export makes everything unchanged, and a screenful of rows nobody can act
 * on is the wrong answer to "nothing to do".
 */
export function UnchangedCounts({ plan }: { plan: ImportPlan }) {
  const files = plan.files.unchanged.length;
  const backend = plan.backend.unchanged.length;
  return (
    <div className="flex flex-col gap-1 px-2 text-xs text-muted-foreground">
      {files > 0 && (
        <span>
          {files} identical {files === 1 ? 'file' : 'files'}, nothing to do
        </span>
      )}
      {backend > 0 && (
        <span>
          {backend} identical {backend === 1 ? 'function' : 'functions'}, nothing to do
        </span>
      )}
    </div>
  );
}

/**
 * What the import actually did.
 *
 * States the limit of the undo alongside the good news, because 'a checkpoint was taken' reads as
 * a fuller promise than it is — and names the mechanism that restores *this* checkpoint. Not
 * 'Discard changes': that restores the checkpoint taken when the project was opened
 * (workspace/index.tsx), which would throw away everything since, import included.
 */
export function DoneSummary({ result }: { result: ApplyResult }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Check className="mt-0.5 w-4 h-4 shrink-0 text-green-600 dark:text-green-400" />
        <div className="text-sm">
          <p className="font-medium">{appliedSummary(result.applied)}</p>
          {result.checkpointId && (
            <p className="mt-1 text-muted-foreground">
              Your files were saved to a checkpoint first. To put them back, open the Checkpoints
              panel and restore the &ldquo;Before import&rdquo; entry. Server functions and settings
              were not saved.
            </p>
          )}
        </div>
      </div>
      {result.failed.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-medium text-muted-foreground">
            {result.failed.length} could not be written
          </p>
          <BlockedList
            issues={result.failed.map((failure) => ({
              path: failure.path,
              code: 'validation-failed' as const,
              message: failure.message,
            }))}
          />
        </div>
      )}
    </div>
  );
}
