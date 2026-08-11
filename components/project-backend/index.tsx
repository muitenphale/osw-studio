'use client';

import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { vfs } from '@/lib/vfs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SettingsPanel } from '@/components/settings';
import { FunctionsManager } from '@/components/database-manager/functions-manager';
import { ServerFunctionsManager } from '@/components/database-manager/server-functions-manager';
import { SecretsManager } from '@/components/database-manager/secrets-manager';
import { ScheduledFunctionsManager } from '@/components/database-manager/scheduled-functions-manager';
import { Code2, Wrench, Key, Clock, Lock, Settings, Settings2, PowerOff, Database, AlertTriangle, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { logger } from '@/lib/utils';
import { track } from '@/lib/telemetry';
import { newPromptSuggestion, usablePromptSuggestions } from '@/lib/vfs/prompt-suggestions';
import { INLINE_SUGGESTION_COUNT } from '@/lib/constants/suggestion-pills';
import type { Project, ProjectRuntime, PromptSuggestion } from '@/lib/vfs/types';
import { getProjectRuntimes } from '@/lib/runtimes/registry';
import type {
  FunctionsDataProvider,
  ServerFunctionsDataProvider,
  SecretsDataProvider,
  ScheduledFunctionsDataProvider,
} from '@/components/database-manager/data-providers';
import { SchemaEditor } from './schema-editor';
import { getProjectSchema } from '@/lib/vfs/project-schema';

interface ProjectSettingsPanelProps {
  project: Project;
  onProjectUpdate: (project: Project) => void;
  enabled: boolean;
  workspaceId?: string;
}

function createFunctionsProvider(projectId: string): FunctionsDataProvider {
  return {
    async list() {
      const adapter = vfs.getStorageAdapter();
      return adapter.listEdgeFunctions ? await adapter.listEdgeFunctions(projectId) : [];
    },
    async save(id, data) {
      const adapter = vfs.getStorageAdapter();
      const now = new Date();
      if (id && adapter.getEdgeFunction && adapter.updateEdgeFunction) {
        const existing = await adapter.getEdgeFunction(id);
        if (existing) await adapter.updateEdgeFunction({ ...existing, ...data, updatedAt: now });
      } else if (adapter.createEdgeFunction) {
        const enabled = data.enabled ?? true;
        await adapter.createEdgeFunction({
          id: crypto.randomUUID(),
          projectId,
          name: data.name || '',
          method: data.method || 'GET',
          code: data.code || '',
          description: data.description || '',
          enabled,
          timeoutMs: data.timeoutMs ?? 10000,
          createdAt: now,
          updatedAt: now,
        });
        if (enabled) track('backend_feature_enabled', { kind: 'edge' });
      }
    },
    async remove(id) {
      const adapter = vfs.getStorageAdapter();
      if (adapter.deleteEdgeFunction) await adapter.deleteEdgeFunction(id);
    },
    async toggle(id, enabled) {
      const adapter = vfs.getStorageAdapter();
      if (adapter.getEdgeFunction && adapter.updateEdgeFunction) {
        const existing = await adapter.getEdgeFunction(id);
        if (existing) {
          await adapter.updateEdgeFunction({ ...existing, enabled, updatedAt: new Date() });
          if (enabled && !existing.enabled) track('backend_feature_enabled', { kind: 'edge' });
        }
      }
    },
  };
}

function createServerFunctionsProvider(projectId: string): ServerFunctionsDataProvider {
  return {
    async list() {
      const adapter = vfs.getStorageAdapter();
      return adapter.listServerFunctions ? await adapter.listServerFunctions(projectId) : [];
    },
    async save(id, data) {
      const adapter = vfs.getStorageAdapter();
      const now = new Date();
      if (id && adapter.getServerFunction && adapter.updateServerFunction) {
        const existing = await adapter.getServerFunction(id);
        if (existing) await adapter.updateServerFunction({ ...existing, ...data, updatedAt: now });
      } else if (adapter.createServerFunction) {
        const enabled = data.enabled ?? true;
        await adapter.createServerFunction({
          id: crypto.randomUUID(),
          projectId,
          name: data.name || '',
          code: data.code || '',
          description: data.description || '',
          enabled,
          createdAt: now,
          updatedAt: now,
        });
        if (enabled) track('backend_feature_enabled', { kind: 'server_fn' });
      }
    },
    async remove(id) {
      const adapter = vfs.getStorageAdapter();
      if (adapter.deleteServerFunction) await adapter.deleteServerFunction(id);
    },
    async toggle(id, enabled) {
      const adapter = vfs.getStorageAdapter();
      if (adapter.getServerFunction && adapter.updateServerFunction) {
        const existing = await adapter.getServerFunction(id);
        if (existing) {
          await adapter.updateServerFunction({ ...existing, enabled, updatedAt: new Date() });
          if (enabled && !existing.enabled) track('backend_feature_enabled', { kind: 'server_fn' });
        }
      }
    },
  };
}

function createSecretsProvider(projectId: string): SecretsDataProvider {
  return {
    async list() {
      const adapter = vfs.getStorageAdapter();
      const secrets = adapter.listSecrets ? await adapter.listSecrets(projectId) : [];
      return { secrets, encryptionConfigured: true };
    },
    async save(id, data) {
      const adapter = vfs.getStorageAdapter();
      const now = new Date();
      if (id && adapter.getSecret && adapter.updateSecret) {
        const existing = await adapter.getSecret(id);
        if (existing) await adapter.updateSecret({ ...existing, ...data, hasValue: !!data.value || existing.hasValue, updatedAt: now });
      } else if (adapter.createSecret) {
        await adapter.createSecret({
          id: crypto.randomUUID(),
          projectId,
          name: data.name,
          description: data.description || '',
          hasValue: !!data.value,
          value: data.value,
          createdAt: now,
          updatedAt: now,
        });
        track('backend_feature_enabled', { kind: 'secrets' });
      }
    },
    async remove(id) {
      const adapter = vfs.getStorageAdapter();
      if (adapter.deleteSecret) await adapter.deleteSecret(id);
    },
  };
}

function createScheduledFunctionsProvider(projectId: string): ScheduledFunctionsDataProvider {
  return {
    async listScheduled() {
      const adapter = vfs.getStorageAdapter();
      return adapter.listScheduledFunctions ? await adapter.listScheduledFunctions(projectId) : [];
    },
    async listEdgeFunctions() {
      const adapter = vfs.getStorageAdapter();
      return adapter.listEdgeFunctions ? await adapter.listEdgeFunctions(projectId) : [];
    },
    async save(id, data) {
      const adapter = vfs.getStorageAdapter();
      const now = new Date();
      if (id && adapter.getScheduledFunction && adapter.updateScheduledFunction) {
        const existing = await adapter.getScheduledFunction(id);
        if (existing) await adapter.updateScheduledFunction({ ...existing, ...data, updatedAt: now });
      } else if (adapter.createScheduledFunction) {
        const enabled = data.enabled ?? true;
        await adapter.createScheduledFunction({
          id: crypto.randomUUID(),
          projectId,
          name: data.name || '',
          description: data.description || '',
          functionId: data.functionId || '',
          cronExpression: data.cronExpression || '',
          timezone: data.timezone || 'UTC',
          config: data.config || {},
          enabled,
          createdAt: now,
          updatedAt: now,
        });
        if (enabled) track('backend_feature_enabled', { kind: 'scheduled' });
      }
    },
    async remove(id) {
      const adapter = vfs.getStorageAdapter();
      if (adapter.deleteScheduledFunction) await adapter.deleteScheduledFunction(id);
    },
    async toggle(id, enabled) {
      const adapter = vfs.getStorageAdapter();
      if (adapter.getScheduledFunction && adapter.updateScheduledFunction) {
        const existing = await adapter.getScheduledFunction(id);
        if (existing) {
          await adapter.updateScheduledFunction({ ...existing, enabled, updatedAt: new Date() });
          if (enabled && !existing.enabled) track('backend_feature_enabled', { kind: 'scheduled' });
        }
      }
    },
  };
}

function GeneralTab({ project, onProjectUpdate }: { project: Project; onProjectUpdate: (project: Project) => void }) {
  const [editingEntryPoint, setEditingEntryPoint] = useState(
    project.settings?.previewEntryPoint || '/index.html'
  );
  const [promptOverwriteConfirm, setPromptOverwriteConfirm] = useState<{
    runtime: ProjectRuntime;
    label: string;
  } | null>(null);

  const updatePromptForRuntime = async (runtime: ProjectRuntime) => {
    try {
      const { getDomainPrompt, isDefaultDomainPrompt } = await import('@/lib/llm/prompts');
      const newPrompt = getDomainPrompt(runtime);

      let currentContent: string | null = null;
      try {
        const file = await vfs.readFile(project.id, '/.PROMPT.md');
        if (file && typeof file.content === 'string') currentContent = file.content;
      } catch { /* doesn't exist */ }

      if (currentContent === null) {
        // No .PROMPT.md — create it
        await vfs.createFile(project.id, '/.PROMPT.md', newPrompt);
      } else if (isDefaultDomainPrompt(currentContent)) {
        // Default prompt — silently replace
        await vfs.updateFile(project.id, '/.PROMPT.md', newPrompt);
      } else {
        // Custom prompt — ask user
        const label = getProjectRuntimes().find(r => r.value === runtime)?.label || runtime;
        setPromptOverwriteConfirm({ runtime, label });
        return;
      }
      window.dispatchEvent(new CustomEvent('filesChanged', { detail: { projectId: project.id } }));
    } catch (err) {
      logger.error('Failed to update .PROMPT.md:', err);
    }
  };

  const confirmPromptOverwrite = async () => {
    if (!promptOverwriteConfirm) return;
    try {
      const { getDomainPrompt } = await import('@/lib/llm/prompts');
      const newPrompt = getDomainPrompt(promptOverwriteConfirm.runtime);
      await vfs.updateFile(project.id, '/.PROMPT.md', newPrompt);
      window.dispatchEvent(new CustomEvent('filesChanged', { detail: { projectId: project.id } }));
      toast.success('.PROMPT.md updated for new runtime');
    } catch (err) {
      logger.error('Failed to overwrite .PROMPT.md:', err);
      toast.error('Failed to update .PROMPT.md');
    } finally {
      setPromptOverwriteConfirm(null);
    }
  };

  const handleRuntimeChange = async (value: ProjectRuntime) => {
    try {
      const previousRuntime = project.settings?.runtime || 'handlebars';
      const proj = await vfs.getProject(project.id);
      proj.settings = { ...proj.settings, runtime: value };
      await vfs.updateProject(proj);
      // Project settings are stored server-side; opened from the gallery there is no save
      // that would otherwise push this.
      vfs.scheduleAutoSync(proj.id);
      onProjectUpdate(proj);
      const label = getProjectRuntimes().find(r => r.value === value)?.label || value;
      toast.success(`Runtime changed to ${label}`);
      track('runtime_switch', { from: previousRuntime, to: value });
      await updatePromptForRuntime(value);
    } catch (err) {
      logger.error('Failed to update runtime:', err);
      toast.error('Failed to update runtime');
    }
  };

  const handleEntryPointCommit = async () => {
    const trimmed = editingEntryPoint.trim();
    const current = project.settings?.previewEntryPoint || '/index.html';
    if (trimmed === current) return;
    try {
      const proj = await vfs.getProject(project.id);
      proj.settings = { ...proj.settings, previewEntryPoint: trimmed };
      await vfs.updateProject(proj);
      vfs.scheduleAutoSync(proj.id);
      onProjectUpdate(proj);
      toast.success(`Entry point set to ${trimmed}`);
    } catch (err) {
      logger.error('Failed to update entry point:', err);
      toast.error('Failed to update entry point');
    }
  };

  return (
    <div className="p-4 space-y-6">
      <div className="space-y-2">
        <Label htmlFor="runtime">Runtime</Label>
        <Select value={project.settings?.runtime || 'handlebars'} onValueChange={handleRuntimeChange}>
          <SelectTrigger id="runtime" className="w-full">
            <div className="truncate flex-1 text-left">
              {getProjectRuntimes().find(r => r.value === (project.settings?.runtime || 'handlebars'))?.label}
            </div>
          </SelectTrigger>
          <SelectContent>
            {getProjectRuntimes().map(rt => (
              <SelectItem key={rt.value} value={rt.value}>
                <div className="flex flex-col gap-0.5">
                  <div className="font-medium">{rt.label}</div>
                  <div className="text-xs text-muted-foreground">{rt.description}</div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="entry-point">Preview Entry Point</Label>
        <Input
          id="entry-point"
          value={editingEntryPoint}
          onChange={(e) => setEditingEntryPoint(e.target.value)}
          onBlur={handleEntryPointCommit}
          onKeyDown={(e) => { if (e.key === 'Enter') handleEntryPointCommit(); }}
          placeholder="/index.html"
        />
        <p className="text-xs text-muted-foreground">
          The file loaded in the preview panel when opening this project.
        </p>
      </div>

      <PromptSuggestionsEditor project={project} onProjectUpdate={onProjectUpdate} />

      <Dialog open={!!promptOverwriteConfirm} onOpenChange={(open) => !open && setPromptOverwriteConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Update .PROMPT.md?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Your .PROMPT.md has custom content. Replace it with the default {promptOverwriteConfirm?.label} instructions?
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setPromptOverwriteConfirm(null)}>
              Keep current
            </Button>
            <Button size="sm" onClick={confirmPromptOverwrite}>
              Replace
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * The chat starters offered above the composer on an empty conversation.
 *
 * Edited here rather than only seeded by a template, because the template that made the project
 * stops being relevant the moment someone changes what the project is for. Order is meaningful:
 * the first three appear on the row and the rest go behind the overflow menu, which is why there
 * are move controls rather than an alphabetical list.
 */
function PromptSuggestionsEditor({
  project,
  onProjectUpdate,
}: {
  project: Project;
  onProjectUpdate: (project: Project) => void;
}) {
  const [draft, setDraft] = useState<PromptSuggestion[]>(
    () => project.settings?.promptSuggestions ?? []
  );
  const [saving, setSaving] = useState(false);

  const stored = JSON.stringify(project.settings?.promptSuggestions ?? []);
  const dirty = JSON.stringify(usablePromptSuggestions(draft)) !== stored;

  const update = (id: string, patch: Partial<PromptSuggestion>) =>
    setDraft(rows => rows.map(row => (row.id === id ? { ...row, ...patch } : row)));

  const move = (index: number, delta: number) =>
    setDraft(rows => {
      const next = [...rows];
      const target = index + delta;
      if (target < 0 || target >= next.length) return rows;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      // Cleaned on the way out, so a half-typed row never reaches storage and takes up one of the
      // three inline slots as an invisible button.
      const cleaned = usablePromptSuggestions(draft);
      const proj = await vfs.getProject(project.id);
      proj.settings = { ...proj.settings, promptSuggestions: cleaned };
      await vfs.updateProject(proj);
      vfs.scheduleAutoSync(proj.id);
      onProjectUpdate(proj);
      setDraft(cleaned);
      toast.success(cleaned.length === 0 ? 'Suggestions cleared' : 'Suggestions saved');
    } catch (err) {
      logger.error('Failed to save prompt suggestions:', err);
      toast.error('Failed to save suggestions');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>Chat suggestions</Label>
      <p className="text-xs text-muted-foreground">
        Shown above the chat box before the first message. The first {INLINE_SUGGESTION_COUNT} appear
        on the row; any others sit behind a menu. With none set, the generic starters are used.
      </p>

      <div className="space-y-3 pt-1">
        {draft.map((suggestion, index) => (
          <div key={suggestion.id} className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={suggestion.label}
                onChange={(e) => update(suggestion.id, { label: e.target.value })}
                placeholder="Button text"
                aria-label={`Suggestion ${index + 1} button text`}
                className="flex-1"
              />
              <Button
                variant="ghost" size="sm" aria-label="Move up"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost" size="sm" aria-label="Move down"
                disabled={index === draft.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost" size="sm" aria-label="Remove suggestion"
                onClick={() => setDraft(rows => rows.filter(row => row.id !== suggestion.id))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <textarea
              value={suggestion.prompt}
              onChange={(e) => update(suggestion.id, { prompt: e.target.value })}
              placeholder="What gets put in the chat box. Write it as an instruction."
              aria-label={`Suggestion ${index + 1} prompt`}
              rows={3}
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm resize-y"
            />
          </div>
        ))}

        {draft.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            No suggestions. The generic starters are shown instead.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="outline" size="sm"
          onClick={() => setDraft(rows => [...rows, newPromptSuggestion()])}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add suggestion
        </Button>
        <Button size="sm" onClick={save} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

interface TabDef {
  value: string;
  icon: React.ReactNode;
  label: string;
}

/**
 * Renders the settings tabs as a normal tab row, collapsing to a Select dropdown when the row
 * would not fit the available width (measured with a ResizeObserver against a hidden natural-width
 * copy of the tabs). Must be rendered inside a <Tabs> — both branches drive the same active value.
 */
function ResponsiveTabBar({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: TabDef[];
  activeTab: string;
  onChange: (v: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const c = containerRef.current;
      const m = measureRef.current;
      if (!c || !m) return;
      // +8px buffer for rounding / the tab row's own gaps
      setCollapsed(m.scrollWidth + 8 > c.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [tabs]);

  const active = tabs.find((t) => t.value === activeTab) ?? tabs[0];

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Hidden measurer — natural width of the tabs at their content size. */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex whitespace-nowrap"
      >
        {tabs.map((t) => (
          <span key={t.value} className="flex items-center gap-1 px-3 py-1.5 text-xs">
            {t.icon}
            {t.label}
          </span>
        ))}
      </div>

      {collapsed ? (
        <Select value={activeTab} onValueChange={onChange}>
          <SelectTrigger className="w-full">
            <span className="flex items-center gap-1.5 text-xs">
              {active?.icon}
              {active?.label}
            </span>
          </SelectTrigger>
          <SelectContent>
            {tabs.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                <span className="flex items-center gap-1.5">
                  {t.icon}
                  {t.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <TabsList className="flex w-full">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="flex-1 flex items-center gap-1 text-xs">
              {t.icon}
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      )}
    </div>
  );
}

export function ProjectSettingsPanel({ project, onProjectUpdate, enabled, workspaceId }: ProjectSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState('settings');
  const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';

  const functionsProvider = useMemo(() => createFunctionsProvider(project.id), [project.id]);
  const serverFunctionsProvider = useMemo(() => createServerFunctionsProvider(project.id), [project.id]);
  const secretsProvider = useMemo(() => createSecretsProvider(project.id), [project.id]);
  const scheduledFunctionsProvider = useMemo(() => createScheduledFunctionsProvider(project.id), [project.id]);

  // Tracks whether the project already had a database schema, so we only
  // fire backend_feature_enabled on the empty -> has-schema transition. Seeded from the record and
  // then confirmed asynchronously, which is what picks up a project still holding one in
  // localStorage — reading that costs an await, and the ref has to exist before first render.
  const hadDbSchemaRef = useRef(!!project.settings?.databaseSchema);
  useEffect(() => {
    let cancelled = false;
    getProjectSchema(project.id).then(schema => {
      if (!cancelled && schema) hadDbSchemaRef.current = true;
    });
    return () => { cancelled = true; };
  }, [project.id]);

  const tabs: TabDef[] = [
    { value: 'settings', icon: <Settings className="h-3 w-3" />, label: 'General' },
    { value: 'general', icon: <Settings2 className="h-3 w-3" />, label: 'Project' },
    { value: 'functions', icon: <Code2 className="h-3 w-3" />, label: 'Functions' },
    { value: 'helpers', icon: <Wrench className="h-3 w-3" />, label: 'Helpers' },
    { value: 'secrets', icon: <Key className="h-3 w-3" />, label: 'Secrets' },
    { value: 'schedules', icon: <Clock className="h-3 w-3" />, label: 'Schedules' },
    { value: 'schema', icon: <Database className="h-3 w-3" />, label: 'Schema' },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <ResponsiveTabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

          {/* Framed content area — every tab renders its content inside this one wrapper. */}
          <div className="flex-1 overflow-hidden mt-3 rounded-lg border border-border bg-muted/20">
            <TabsContent value="settings" className="h-full m-0 overflow-hidden">
              <div className="h-full flex flex-col overflow-hidden p-3">
                <SettingsPanel hideHeader hideFooter />
              </div>
            </TabsContent>
            <TabsContent value="general" className="h-full m-0 overflow-auto">
              <GeneralTab project={project} onProjectUpdate={onProjectUpdate} />
            </TabsContent>

            {!isServerMode ? (
              /* Browser mode: backend tabs show lock screen */
              <>
                {['functions', 'helpers', 'secrets', 'schedules', 'schema'].map(tab => (
                  <TabsContent key={tab} value={tab} className="h-full m-0">
                    <div className="h-full flex items-center justify-center p-8">
                      <div className="text-center max-w-sm">
                        <Lock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                        <h4 className="font-medium mb-2">Server Mode Required</h4>
                        <p className="text-sm text-muted-foreground mb-4">
                          Backend features require Server Mode. Deploy to a self-hosted instance to use edge functions, secrets, and database features.
                        </p>
                        <a
                          href="https://github.com/o-stahl/osw-studio"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          View setup guide
                        </a>
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </>
            ) : !enabled ? (
              /* Server mode but backend disabled */
              <>
                {['functions', 'helpers', 'secrets', 'schedules', 'schema'].map(tab => (
                  <TabsContent key={tab} value={tab} className="h-full m-0">
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center max-w-xs">
                        <PowerOff className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">
                          Backend features are disabled for this project. Enable them using the toggle above to manage edge functions, secrets, and more.
                        </p>
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </>
            ) : (
              /* Server mode, backend enabled */
              <>
                <TabsContent value="functions" className="h-full m-0">
                  <FunctionsManager dataProvider={functionsProvider} hideRuntimeFeatures />
                </TabsContent>

                <TabsContent value="helpers" className="h-full m-0">
                  <ServerFunctionsManager dataProvider={serverFunctionsProvider} />
                </TabsContent>

                <TabsContent value="secrets" className="h-full m-0">
                  <SecretsManager dataProvider={secretsProvider} />
                </TabsContent>

                <TabsContent value="schedules" className="h-full m-0">
                  <ScheduledFunctionsManager dataProvider={scheduledFunctionsProvider} />
                </TabsContent>

                <TabsContent value="schema" className="h-full m-0">
                  <SchemaEditor
                    projectId={project.id}
                    enabled={enabled}
                    onSchemaChange={() => {
                      if (!hadDbSchemaRef.current) {
                        hadDbSchemaRef.current = true;
                        track('backend_feature_enabled', { kind: 'db' });
                      }
                      vfs.refreshServerContext();
                    }}
                    workspaceId={workspaceId}
                  />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </div>
    </div>
  );
}

interface ProjectSettingsModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onProjectUpdate: (project: Project) => void;
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  workspaceId?: string;
}

export function ProjectSettingsModal({ project, isOpen, onClose, onProjectUpdate, enabled, onToggleEnabled, workspaceId }: ProjectSettingsModalProps) {
  const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl h-[70vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {project.name}
              </p>
            </div>
            {isServerMode && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Backend {enabled ? 'Enabled' : 'Disabled'}</span>
                <Switch checked={enabled} onCheckedChange={onToggleEnabled} />
              </div>
            )}
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <ProjectSettingsPanel project={project} onProjectUpdate={onProjectUpdate} enabled={enabled} workspaceId={workspaceId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
