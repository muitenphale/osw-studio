'use client';

/**
 * Where mail is configured: /w/{workspaceId}/mail.
 *
 * A page rather than a Settings pane, because every existing Settings pane writes to localStorage
 * and makes no server call, putting a server-side, instance-wide setting in there would make
 * "Settings" mean two different things.
 *
 * It carries two tiers with two different audiences. The workspace section belongs to the agency
 * that owns the workspace and is the reason the page is not admin-only: an owner has to be able to
 * point their clients' mail at their own relay without asking an operator for anything. The instance
 * section belongs to whoever runs the server and is hidden from everyone else, hiding it is
 * presentation only, and the routes behind both sections do the actual enforcing.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Mail,
  Send,
  Server,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageBody, PageHeader, PageShell } from '@/components/ui/page-shell';
import { Section, SectionBody, SectionHeader } from '@/components/ui/section';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingRow } from '@/components/ui/setting-row';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { getLoginUrl } from '@/lib/config/storage';
import { cn, logger } from '@/lib/utils';

import type { QueueStats } from '@/lib/mail/queue-stats';
import type {
  InstanceMailSettings,
  WorkspaceMailResponse,
  WorkspaceMailSettings,
} from '@/lib/mail/settings';

import {
  buildSmtpBody,
  describeWorkspaceSending,
  emptyToNull,
  instanceCanSend,
  instanceToggleState,
  presentQueue,
  presentTestResult,
  workspaceCanSend,
  type InstanceAvailability,
  type PasswordIntent,
  type SendingState,
  type SmtpForm,
  type TestPresentation,
} from './mail-logic';

/**
 * Mirrors MAX_MAIL_DISPLAY_NAME in lib/api/mail-route.ts, which is server-only and so cannot be
 * imported into a client component. The route refuses anything longer regardless; this only stops
 * the field before the refusal.
 */
const MAX_DISPLAY_NAME = 80;

interface WorkspaceDraft {
  enabled: boolean;
  mode: 'instance' | 'own';
  displayName: string;
  smtp: SmtpForm;
  password: PasswordIntent;
}

interface InstanceDraft {
  enabled: boolean;
  smtp: SmtpForm;
  password: PasswordIntent;
}

function smtpFormFrom(settings: {
  host: string | null;
  port: number | null;
  secure: SmtpForm['secure'];
  user: string | null;
  from: string | null;
}): SmtpForm {
  return {
    host: settings.host ?? '',
    port: settings.port === null ? '' : String(settings.port),
    secure: settings.secure,
    user: settings.user ?? '',
    from: settings.from ?? '',
  };
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function Field({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * One of the two ways a workspace can send.
 *
 * The fields live beside the label rather than inside it: a `<label>` wrapping a text input or a
 * Radix Select turns a click in that field into a click on the radio in some browsers.
 */
function ModeOption({
  selected,
  disabled,
  title,
  description,
  onSelect,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  title: string;
  description: React.ReactNode;
  onSelect: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        // Border only. A wash behind the selected card tinted the fields inside it and left the
        // section reading as one coloured block rather than as a choice between two.
        selected ? 'border-primary/40' : 'border-border',
        disabled && 'opacity-60',
      )}
    >
      <label
        className={cn(
          'flex items-start gap-3',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        )}
      >
        <input
          type="radio"
          className="sr-only"
          checked={selected}
          disabled={disabled}
          onChange={onSelect}
        />
        <span
          aria-hidden
          className={cn(
            'mt-0.5 grid size-[15px] shrink-0 place-items-center rounded-full border',
            selected ? 'border-primary' : 'border-input',
          )}
        >
          {selected && <span className="size-[7px] rounded-full bg-primary" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-medium">{title}</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            {description}
          </span>
        </span>
      </label>
      {selected && children && <div className="mt-3 sm:pl-[27px]">{children}</div>}
    </div>
  );
}

/**
 * The stored-password affordances: set, change, clear, undo.
 *
 * There is nothing to render in a password field, neither GET returns one, so the field is
 * replaced by what the page does know, which is whether one exists and what is about to happen to it.
 */
function PasswordControl({
  idPrefix,
  passwordSet,
  intent,
  onChange,
}: {
  idPrefix: string;
  passwordSet: boolean;
  intent: PasswordIntent;
  onChange: (intent: PasswordIntent) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  const state: 'pending-set' | 'pending-clear' | 'set' | 'unset' =
    typeof intent === 'string'
      ? 'pending-set'
      : intent === null
        ? 'pending-clear'
        : passwordSet
          ? 'set'
          : 'unset';

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`${idPrefix}-password`}
          autoFocus
          type="password"
          autoComplete="new-password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            onChange(e.target.value === '' ? undefined : e.target.value);
          }}
          placeholder="New password"
          className="h-9 w-full max-w-[220px]"
        />
        <Button variant="accent" size="sm" onClick={() => setEditing(false)}>
          Done
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setEditing(false);
            setValue('');
            onChange(undefined);
          }}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">
        {state === 'pending-set'
          ? 'Set on save'
          : state === 'pending-clear'
            ? 'Cleared on save'
            : state === 'set'
              ? 'Stored'
              : 'Not set'}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setValue('');
          setEditing(true);
        }}
      >
        {passwordSet || state === 'pending-set' ? 'Change' : 'Set'}
      </Button>
      {state === 'set' && (
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
          Clear
        </Button>
      )}
      {(state === 'pending-set' || state === 'pending-clear') && (
        <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}>
          Undo
        </Button>
      )}
    </div>
  );
}

function SmtpFields({
  idPrefix,
  form,
  onChange,
  passwordSet,
  password,
  onPasswordChange,
  fromHint,
}: {
  idPrefix: string;
  form: SmtpForm;
  onChange: (form: SmtpForm) => void;
  passwordSet: boolean;
  password: PasswordIntent;
  onPasswordChange: (intent: PasswordIntent) => void;
  fromHint?: React.ReactNode;
}) {
  const set = (patch: Partial<SmtpForm>) => onChange({ ...form, ...patch });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Field id={`${idPrefix}-host`} label="Host" className="min-w-[170px] flex-1">
          <Input
            id={`${idPrefix}-host`}
            value={form.host}
            onChange={(e) => set({ host: e.target.value })}
            placeholder="smtp.example.com"
            autoComplete="off"
            spellCheck={false}
            className="h-9 font-mono text-[13px]"
          />
        </Field>
        <Field id={`${idPrefix}-port`} label="Port" className="w-[88px]">
          <Input
            id={`${idPrefix}-port`}
            value={form.port}
            onChange={(e) => set({ port: e.target.value })}
            placeholder={form.secure === 'ssl' ? '465' : form.secure === 'none' ? '25' : '587'}
            inputMode="numeric"
            className="h-9 font-mono text-[13px]"
          />
        </Field>
        <Field id={`${idPrefix}-secure`} label="Encryption" className="w-[136px]">
          <Select
            value={form.secure}
            onValueChange={(value) => set({ secure: value as SmtpForm['secure'] })}
          >
            <SelectTrigger id={`${idPrefix}-secure`} className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="starttls">STARTTLS</SelectItem>
              <SelectItem value="ssl">SSL/TLS</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap gap-3">
        <Field id={`${idPrefix}-user`} label="Username" className="min-w-[170px] flex-1">
          <Input
            id={`${idPrefix}-user`}
            value={form.user}
            onChange={(e) => set({ user: e.target.value })}
            placeholder="Leave empty if the relay does not require a login"
            autoComplete="off"
            spellCheck={false}
            className="h-9 font-mono text-[13px]"
          />
        </Field>
        <Field id={`${idPrefix}-password`} label="Password" className="min-w-[240px] flex-1">
          <PasswordControl
            idPrefix={idPrefix}
            passwordSet={passwordSet}
            intent={password}
            onChange={onPasswordChange}
          />
        </Field>
      </div>

      <Field id={`${idPrefix}-from`} label="From address" hint={fromHint}>
        <Input
          id={`${idPrefix}-from`}
          value={form.from}
          onChange={(e) => set({ from: e.target.value })}
          placeholder="Acme Studio &lt;review@acme.studio&gt;"
          autoComplete="off"
          spellCheck={false}
          className="h-9 font-mono text-[13px]"
        />
      </Field>
    </div>
  );
}

const TEST_TONE: Record<
  TestPresentation['tone'],
  { icon: React.ElementType; box: string; text: string }
> = {
  success: {
    icon: CheckCircle2,
    box: 'border-green-500/40 bg-green-500/10',
    text: 'text-green-700 dark:text-green-400',
  },
  // Not an error: there is simply nothing configured to send with, and a test send never touches
  // the queue either way.
  holding: { icon: Inbox, box: 'border-border bg-muted/50', text: 'text-foreground' },
  blocked: {
    icon: ShieldAlert,
    box: 'border-amber-500/40 bg-amber-500/10',
    text: 'text-amber-700 dark:text-amber-400',
  },
  failure: {
    icon: XCircle,
    box: 'border-destructive/40 bg-destructive/10',
    text: 'text-destructive',
  },
};

function TestResultNote({ result }: { result: TestPresentation }) {
  const tone = TEST_TONE[result.tone];
  const Icon = tone.icon;

  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border p-3', tone.box)}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', tone.text)} />
      <div className="min-w-0 flex-1">
        <div className={cn('text-[13.5px] font-medium', tone.text)}>{result.title}</div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{result.detail}</p>
        {result.serverError && (
          <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-background p-2 font-mono text-[11.5px] whitespace-pre-wrap text-foreground">
            {result.serverError}
          </pre>
        )}
      </div>
    </div>
  );
}

function QueueRow({
  stats,
  scope,
  action,
}: {
  stats: QueueStats | null;
  scope: 'workspace' | 'instance';
  action?: React.ReactNode;
}) {
  if (!stats) {
    return <SettingRow title="Queue" description="Could not read the queue." />;
  }

  const queue = presentQueue(stats, { scope });

  return (
    <SettingRow
      title={queue.headline}
      description={
        <span className="flex flex-col gap-1">
          {queue.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      }
    >
      {action}
    </SettingRow>
  );
}

function StatusBadge({ state }: { state: SendingState }) {
  if (state === 'sending') {
    return (
      <Badge variant="outline" className="border-green-500 text-green-500">
        Sending
      </Badge>
    );
  }
  if (state === 'not-sending') {
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-500">
        Not sending
      </Badge>
    );
  }
  // Nothing for `unknown`. An owner who cannot read the instance tier has no badge that would be
  // true, and a word invented to fill the slot would read as a state rather than as an absence.
  return null;
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export function MailView({ workspaceId }: { workspaceId?: string }) {
  const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';
  const apiBase = workspaceId ? `/api/w/${workspaceId}` : '/api';

  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<{ email: string | null; isAdmin: boolean }>({
    email: null,
    isAdmin: false,
  });

  // Workspace tier
  const [ws, setWs] = useState<WorkspaceMailSettings | null>(null);
  /** What the workspace tier was told about the instance. Null until the first response. */
  const [instanceConfigured, setInstanceConfigured] = useState<boolean | null>(null);
  const [wsDraft, setWsDraft] = useState<WorkspaceDraft | null>(null);
  const [wsBaseline, setWsBaseline] = useState<WorkspaceDraft | null>(null);
  const [wsQueue, setWsQueue] = useState<QueueStats | null>(null);
  const [wsForbidden, setWsForbidden] = useState(false);
  const [wsSaving, setWsSaving] = useState(false);
  const [wsTesting, setWsTesting] = useState(false);
  const [wsTest, setWsTest] = useState<TestPresentation | null>(null);

  // Instance tier
  const [inst, setInst] = useState<InstanceMailSettings | null>(null);
  const [instDraft, setInstDraft] = useState<InstanceDraft | null>(null);
  const [instBaseline, setInstBaseline] = useState<InstanceDraft | null>(null);
  const [instQueue, setInstQueue] = useState<QueueStats | null>(null);
  const [instSaving, setInstSaving] = useState(false);
  const [instTesting, setInstTesting] = useState(false);
  const [instFlushing, setInstFlushing] = useState(false);
  const [instTest, setInstTest] = useState<TestPresentation | null>(null);

  /**
   * An admin reads the instance tier itself and sees its From; everyone else gets the single boolean
   * the workspace response carries. `unknown` is left for the moment before any answer has arrived 
   * guessing either way would be worse than saying nothing, since a wrong "unavailable" would push
   * an agency into buying an SMTP account it does not need.
   *
   * This is the *offer* question, so an admin's two fields are combined here: `configured` says the
   * server works, `enabled` says workspaces may use it, and a workspace needs both. The workspace
   * response's `instanceConfigured` already answers the combined question.
   */
  const instanceAvailability: InstanceAvailability = useMemo(() => {
    if (inst) {
      return { state: instanceToggleState(inst) ? 'available' : 'unavailable', from: inst.from };
    }
    if (instanceConfigured === null) return { state: 'unknown', from: null };
    return { state: instanceConfigured ? 'available' : 'unavailable', from: null };
  }, [inst, instanceConfigured]);

  const applyWorkspace = useCallback((response: WorkspaceMailResponse) => {
    const { instanceConfigured: instanceCanSend, ...settings } = response;
    setInstanceConfigured(instanceCanSend);
    setWs(settings);

    const baseline: WorkspaceDraft = {
      enabled: settings.enabled,
      mode: settings.mode,
      displayName: settings.displayName ?? '',
      smtp: smtpFormFrom(settings),
      password: undefined,
    };
    setWsBaseline(baseline);
    // A workspace pointed at an instance that cannot send is pointed at nothing. The route rejects
    // that mode outright, so the form opens on the option that can actually be saved rather than
    // on one whose only outcome is an error the owner cannot act on.
    //
    // Only while the workspace is switched on, because only then is there a form for it to open on.
    // Switched off it would leave the page dirty on arrival, offering to save a change nobody made
    // and nobody can see.
    const stranded = baseline.enabled && baseline.mode === 'instance' && !instanceCanSend;
    setWsDraft(stranded ? { ...baseline, mode: 'own' } : baseline);
  }, []);

  const applyInstance = useCallback((settings: InstanceMailSettings) => {
    setInst(settings);
    const baseline: InstanceDraft = {
      // The effective state rather than the stored one, so a server that offers nothing because it
      // has no host reads as off. See `instanceToggleState`.
      enabled: instanceToggleState(settings),
      smtp: smtpFormFrom(settings),
      password: undefined,
    };
    setInstBaseline(baseline);
    setInstDraft(baseline);
  }, []);

  /**
   * `signal` aborts a load whose answers are no longer wanted, the page is leaving, or the
   * workspace changed while its settings were in flight. Without it a slow response for the
   * previous workspace can land after the new one's and show an owner another workspace's mail
   * server.
   */
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!isServerMode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const meRes = await fetch('/api/auth/me', { signal });
      if (meRes.status === 401) {
        window.location.href = getLoginUrl();
        return;
      }
      const me = meRes.ok ? await meRes.json() : null;
      const isAdmin = me?.user?.isAdmin === true;
      setViewer({ email: me?.user?.email ?? null, isAdmin });

      // Only an admin may read the instance tier. What the workspace section needs from it 
      // whether there is a server to relay through, comes back with the workspace settings below,
      // so a plain owner is not left guessing at it.
      if (isAdmin) {
        const [settingsRes, queueRes] = await Promise.all([
          fetch('/api/admin/mail', { signal }),
          fetch('/api/admin/mail/queue', { signal }),
        ]);
        if (settingsRes.ok) applyInstance((await settingsRes.json()) as InstanceMailSettings);
        if (queueRes.ok) setInstQueue((await queueRes.json()) as QueueStats);
      }

      if (workspaceId) {
        const [settingsRes, queueRes] = await Promise.all([
          fetch(`${apiBase}/mail`, { signal }),
          fetch(`${apiBase}/mail/queue`, { signal }),
        ]);
        if (settingsRes.status === 403) {
          setWsForbidden(true);
        } else if (settingsRes.ok) {
          setWsForbidden(false);
          applyWorkspace((await settingsRes.json()) as WorkspaceMailResponse);
        }
        if (queueRes.ok) setWsQueue((await queueRes.json()) as QueueStats);
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      logger.error('[MailView] Failed to load mail settings:', error);
      toast.error('Could not load the mail settings');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [apiBase, applyInstance, applyWorkspace, isServerMode, workspaceId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const reloadQueues = useCallback(async () => {
    try {
      if (workspaceId) {
        const res = await fetch(`${apiBase}/mail/queue`);
        if (res.ok) setWsQueue((await res.json()) as QueueStats);
      }
      if (viewer.isAdmin) {
        const res = await fetch('/api/admin/mail/queue');
        if (res.ok) setInstQueue((await res.json()) as QueueStats);
      }
    } catch (error) {
      logger.error('[MailView] Failed to refresh the queue:', error);
    }
  }, [apiBase, viewer.isAdmin, workspaceId]);

  // ── Workspace actions ────────────────────────────────────────────────────
  const wsDirty =
    wsDraft !== null && wsBaseline !== null && JSON.stringify(wsDraft) !== JSON.stringify(wsBaseline);

  const saveWorkspace = async () => {
    if (!wsDraft || !workspaceId) return;

    // A switched-off workspace saves only the switch. There is no form on screen to have completed,
    // and the route treats an omitted field as unchanged, so the mode and server the owner can no
    // longer see are left as they were rather than posted back empty and refused as incomplete.
    const body: Record<string, unknown> = { enabled: wsDraft.enabled };

    if (wsDraft.enabled) {
      body.mode = wsDraft.mode;
      body.displayName = emptyToNull(wsDraft.displayName);

      if (wsDraft.mode === 'own') {
        const smtp = buildSmtpBody(wsDraft.smtp, wsDraft.password);
        if ('error' in smtp) {
          toast.error(smtp.error);
          return;
        }
        Object.assign(body, smtp.body);
      }
    }

    setWsSaving(true);
    try {
      const res = await fetch(`${apiBase}/mail`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        window.location.href = getLoginUrl();
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? 'Could not save the mail settings');
        return;
      }
      applyWorkspace(data as WorkspaceMailResponse);
      setWsTest(null);
      toast.success('Mail settings saved');
      void reloadQueues();
    } catch (error) {
      logger.error('[MailView] Failed to save workspace mail settings:', error);
      toast.error('Could not save the mail settings');
    } finally {
      setWsSaving(false);
    }
  };

  const testWorkspace = async () => {
    setWsTesting(true);
    setWsTest(null);
    try {
      const res = await fetch(`${apiBase}/mail/test`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      setWsTest(
        presentTestResult({
          status: res.status,
          error: data?.error ?? null,
          recipient: viewer.email,
        }),
      );
      void reloadQueues();
    } catch (error) {
      logger.error('[MailView] Test send failed:', error);
      setWsTest(presentTestResult({ status: 0, error: null, recipient: viewer.email }));
    } finally {
      setWsTesting(false);
    }
  };

  // ── Instance actions ─────────────────────────────────────────────────────
  const instDirty =
    instDraft !== null &&
    instBaseline !== null &&
    JSON.stringify(instDraft) !== JSON.stringify(instBaseline);

  const saveInstance = async () => {
    if (!instDraft) return;

    const smtp = buildSmtpBody(instDraft.smtp, instDraft.password);
    if ('error' in smtp) {
      toast.error(smtp.error);
      return;
    }

    setInstSaving(true);
    try {
      const res = await fetch('/api/admin/mail', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...smtp.body, enabled: instDraft.enabled }),
      });
      if (res.status === 401) {
        window.location.href = getLoginUrl();
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? 'Could not save the mail settings');
        return;
      }
      applyInstance(data as InstanceMailSettings);
      setInstTest(null);
      toast.success('Instance mail settings saved');
      void reloadQueues();
    } catch (error) {
      logger.error('[MailView] Failed to save instance mail settings:', error);
      toast.error('Could not save the mail settings');
    } finally {
      setInstSaving(false);
    }
  };

  const testInstance = async () => {
    setInstTesting(true);
    setInstTest(null);
    try {
      const res = await fetch('/api/admin/mail/test', { method: 'POST' });
      const data = await res.json().catch(() => null);
      setInstTest(
        presentTestResult({
          status: res.status,
          error: data?.error ?? null,
          recipient: viewer.email,
        }),
      );
      void reloadQueues();
    } catch (error) {
      logger.error('[MailView] Instance test send failed:', error);
      setInstTest(presentTestResult({ status: 0, error: null, recipient: viewer.email }));
    } finally {
      setInstTesting(false);
    }
  };

  const flushQueue = async () => {
    setInstFlushing(true);
    try {
      const res = await fetch('/api/admin/mail/queue/flush', { method: 'POST' });
      if (res.status === 401) {
        window.location.href = getLoginUrl();
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        accepted?: number;
        failed?: number;
        held?: number;
      } | null;
      if (!res.ok || !data) {
        toast.error('Could not run a delivery pass');
        return;
      }
      toast.success(
        `${data.accepted ?? 0} accepted by the mail server, ${data.failed ?? 0} refused, ${data.held ?? 0} held.`,
      );
      void reloadQueues();
    } catch (error) {
      logger.error('[MailView] Delivery pass failed:', error);
      toast.error('Could not run a delivery pass');
    } finally {
      setInstFlushing(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (!isServerMode) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p>Mail is only available in Server Mode</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Spinner size={48} color="#f97316" className="mx-auto" />
          <p className="mt-4">Loading mail settings...</p>
        </div>
      </div>
    );
  }

  // Derived from the *saved* settings, never the draft: this describes what is happening to mail
  // right now, and an unsaved edit is not happening to anything.
  const sending = ws
    ? describeWorkspaceSending({
        enabled: ws.enabled,
        mode: ws.mode,
        displayName: ws.displayName,
        host: ws.host,
        from: ws.from,
        instance: instanceAvailability,
      })
    : null;

  const instanceUnavailable = instanceAvailability.state === 'unavailable';

  // Whether each tier has a server behind it, which is what decides whether a test button and a
  // queue are worth drawing. Both are read from the saved settings rather than the drafts: an
  // unsaved host is not a server, and pressing either control would go to the one on disk.
  const instanceHasServer = inst !== null && instanceCanSend(inst);
  const workspaceHasServer =
    ws !== null &&
    workspaceCanSend({
      enabled: ws.enabled,
      mode: ws.mode,
      host: ws.host,
      from: ws.from,
      instance: instanceAvailability,
    });

  // What the effective From would be after saving, so a display name left over from instance mode
  // does not silently sit in front of an own-server address.
  const ownFromOverridden =
    wsDraft !== null && wsDraft.mode === 'own' && emptyToNull(wsDraft.displayName) !== null;

  return (
    <PageShell>
      {/* No status badge beside the title. It describes the workspace tier, and the workspace
          section's own header carries it there, next to the thing it is about. In the page header
          — above the instance section, for an admin — the same word read as a claim about the
          whole page. */}
      <PageHeader title="Mail" maxWidth="max-w-3xl" />

      <PageBody maxWidth="max-w-3xl">
        {/* The instance tier leads for an admin: whether there is a server to relay through is what
            decides whether a workspace's choice between relaying and bringing its own means
            anything. Everyone else never sees this section, so their page is unchanged. */}
        {viewer.isAdmin && instDraft && inst && (
          <Section>
            <SectionHeader icon={Server} title="Instance mail server">
              {/* No sending badge here: the queue row below carries that state, and saying it twice
                  in one card reads as two different facts. */}
              <Badge variant="secondary">Admin</Badge>
              <Switch
                id="inst-enabled"
                aria-label="Offer this server to workspaces"
                checked={instDraft.enabled}
                onCheckedChange={(enabled) => setInstDraft({ ...instDraft, enabled })}
              />
            </SectionHeader>

            <SectionBody className="flex flex-col gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <p>
                Workspaces can send through this SMTP, add a display name in front of the instance
                From address, or use their own server. Instance mail still goes out if this is off.
              </p>
              <p>
                A workspace review email is only written when that workspace has sending on and the
                deployment has Email notifications on in Review settings.
              </p>
              <p>
                Turning this off stops workspaces from using the instance server. Mail already
                queued for them is dropped. Turning it back on does not send what was missed.
              </p>
            </SectionBody>

            {/* Switched off, the connection fields go away. They are the settings behind an offer
                that is not being made, and leaving a filled-in form under a switch that says it
                does nothing is what made this page read as two contradictory statements. The draft
                keeps their values, so turning it back on returns them untouched. */}
            {instDraft.enabled && (
              <SectionBody className="flex flex-col gap-3 border-t border-border">
                <SmtpFields
                  idPrefix="inst"
                  form={instDraft.smtp}
                  onChange={(smtp) => setInstDraft({ ...instDraft, smtp })}
                  passwordSet={inst.smtpPasswordSet}
                  password={instDraft.password}
                  onPasswordChange={(password) => setInstDraft({ ...instDraft, password })}
                  fromHint="Replies to this address are not read. Each message includes a link back to the site."
                />

                <p className="text-xs leading-relaxed text-muted-foreground">
                  Empty fields fall back to SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER,
                  SMTP_PASSWORD, and SMTP_FROM. A value saved here overrides the environment.
                </p>
              </SectionBody>
            )}

            <SectionBody className="border-t border-border">
              <div className="flex items-center gap-2">
                <Button
                  variant="accent"
                  size="sm"
                  disabled={!instDirty || instSaving}
                  onClick={saveInstance}
                >
                  {instSaving ? 'Saving…' : 'Save'}
                </Button>
                {instDirty && !instSaving && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => instBaseline && setInstDraft(instBaseline)}
                  >
                    Discard
                  </Button>
                )}
              </div>
            </SectionBody>

            {/* Tied to the server, not to the offer. An operator who has withdrawn the offer still
                has a server carrying the instance's own mail, so both controls still do something;
                with no host and no From they do not, and a test that can only report that nothing is
                configured is a question the page can answer without being asked. */}
            {instanceHasServer && (
            <SectionBody className="border-t border-border px-4 py-1">
              <SettingRow
                className="flex-wrap"
                title="Test it"
                description={
                  instDirty
                    ? 'Save first — a test sends with the saved settings, not the ones on screen.'
                    : 'Sends one message to your own address and shows the mail server’s own words if it fails.'
                }
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={instTesting || instDirty}
                  onClick={testInstance}
                >
                  {instTesting ? 'Sending…' : 'Send test email'}
                </Button>
              </SettingRow>

              {instTest && (
                <div className="border-t border-border py-3">
                  <TestResultNote result={instTest} />
                </div>
              )}

              <QueueRow
                stats={instQueue}
                scope="instance"
                action={
                  <Button variant="outline" size="sm" disabled={instFlushing} onClick={flushQueue}>
                    {instFlushing ? 'Sending…' : 'Send now'}
                  </Button>
                }
              />
            </SectionBody>
            )}
          </Section>
        )}

        {workspaceId && wsForbidden && (
          <Section>
            <SectionHeader icon={Send} title="Sending for this workspace" />
            <SectionBody>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Only a workspace owner can change how this workspace sends mail. Ask an owner, or an
                instance administrator, to set it up.
              </p>
            </SectionBody>
          </Section>
        )}

        {workspaceId && wsDraft && ws && sending && (
          <Section>
            <SectionHeader icon={Send} title="Sending for this workspace">
              <StatusBadge state={sending.state} />
              <Switch
                id="ws-enabled"
                aria-label="Send email from this workspace"
                checked={wsDraft.enabled}
                onCheckedChange={(enabled) => setWsDraft({ ...wsDraft, enabled })}
              />
            </SectionHeader>

            <SectionBody className="flex flex-col gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <p>
                Off means this workspace does not write or queue mail. Queued mail is dropped.
                Turning it back on does not catch up missed mail.
              </p>
              <p>
                Review mail also needs Email notifications on for that deployment. Using the
                instance server also needs the admin to offer it.
              </p>
            </SectionBody>

            <SectionBody className="flex flex-col gap-3 border-t border-border">
              <p className="text-xs leading-relaxed text-muted-foreground">{sending.sentence}</p>

              {/* Switched off, the choice of server goes with the sending. What is left is the
                  sentence above, which says that nothing is being emailed, and the switch that
                  changes it. */}
              {wsDraft.enabled && (
                <>
                  <ModeOption
                    selected={wsDraft.mode === 'instance'}
                    disabled={instanceUnavailable}
                    title="Use the instance mail server"
                    description={
                      instanceUnavailable
                        ? 'The instance has no shared mail server, or it is not offered to workspaces. Ask an admin, or use your own server below.'
                        : 'Nothing to set up. You can put your own name on it, but the address stays the instance’s — that is what keeps the mail out of spam folders.'
                    }
                    onSelect={() => setWsDraft({ ...wsDraft, mode: 'instance' })}
                  >
                    <div className="max-w-[420px]">
                      <Field
                        id="ws-display-name"
                        label="Display name"
                        hint="Shown in front of the instance From address. There is no address field here because a custom workspace address through someone else’s relay fails SPF and DKIM and often goes to spam. Use your own server if you need your own From address."
                      >
                        <Input
                          id="ws-display-name"
                          value={wsDraft.displayName}
                          maxLength={MAX_DISPLAY_NAME}
                          onChange={(e) => setWsDraft({ ...wsDraft, displayName: e.target.value })}
                          placeholder="Acme Studio"
                          className="h-9"
                        />
                      </Field>
                    </div>
                  </ModeOption>

                  <ModeOption
                    selected={wsDraft.mode === 'own'}
                    title="Use our own mail server"
                    description="Your SMTP and your From address. Deliverability is yours to maintain."
                    onSelect={() => setWsDraft({ ...wsDraft, mode: 'own' })}
                  >
                    <SmtpFields
                      idPrefix="ws"
                      form={wsDraft.smtp}
                      onChange={(smtp) => setWsDraft({ ...wsDraft, smtp })}
                      passwordSet={ws.smtpPasswordSet}
                      password={wsDraft.password}
                      onPasswordChange={(password) => setWsDraft({ ...wsDraft, password })}
                      fromHint={
                        ownFromOverridden ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <span>
                              The display name “{wsDraft.displayName.trim()}” is used in front of
                              this address, in place of any name written into it.
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setWsDraft({ ...wsDraft, displayName: '' })}
                            >
                              Use this address’s name
                            </Button>
                          </span>
                        ) : (
                          'Either an address on its own, or a name in front of it.'
                        )
                      }
                    />
                  </ModeOption>

                  {instanceUnavailable && wsBaseline?.mode === 'instance' && (
                    <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                      This workspace is set to use the instance mail server, which is not sending.
                      Add your own server and save.
                    </p>
                  )}
                </>
              )}
            </SectionBody>

            <SectionBody className="border-t border-border">
              <div className="flex items-center gap-2">
                <Button variant="accent" size="sm" disabled={!wsDirty || wsSaving} onClick={saveWorkspace}>
                  {wsSaving ? 'Saving…' : 'Save'}
                </Button>
                {wsDirty && !wsSaving && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => wsBaseline && setWsDraft(wsBaseline)}
                  >
                    Discard
                  </Button>
                )}
              </div>
            </SectionBody>

            {/* Both controls need somewhere for mail to actually go, and for this tier the switch is
                part of that: a switched-off workspace relays through neither tier, so a test send
                would report nothing configured and there is no queue behind it to read. Drawn from
                the saved settings, so an owner who has filled in a server but not saved it is shown
                the state the buttons would act on. */}
            {workspaceHasServer && (
              <SectionBody className="border-t border-border px-4 py-1">
                <SettingRow
                  className="flex-wrap"
                  title="Test it"
                  description={
                    wsDirty
                      ? 'Save first — a test sends with the saved settings, not the ones on screen.'
                      : 'Sends one message to your own address and shows the mail server’s own words if it fails.'
                  }
                >
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={wsTesting || wsDirty}
                    onClick={testWorkspace}
                  >
                    {wsTesting ? 'Sending…' : 'Send test email'}
                  </Button>
                </SettingRow>

                {wsTest && (
                  <div className="border-t border-border py-3">
                    <TestResultNote result={wsTest} />
                  </div>
                )}

                <QueueRow stats={wsQueue} scope="workspace" />
              </SectionBody>
            )}
          </Section>
        )}

        {!viewer.isAdmin && !workspaceId && (
          <Section>
            <SectionHeader icon={Mail} title="Mail" />
            <SectionBody>
              <p className="text-xs text-muted-foreground">
                Open a workspace to configure how it sends mail.
              </p>
            </SectionBody>
          </Section>
        )}

        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Mail is only written when a live server is available and sending is on. If a tier is off
            or no server sits behind it, nothing is queued. Turning it back on starts from that
            moment, so a quiet stretch does not arrive as one dump.
          </span>
        </p>
      </PageBody>
    </PageShell>
  );
}
