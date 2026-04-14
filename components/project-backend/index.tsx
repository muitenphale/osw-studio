'use client';

import React, { useState, useMemo } from 'react';
import { vfs } from '@/lib/vfs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FunctionsManager } from '@/components/database-manager/functions-manager';
import { ServerFunctionsManager } from '@/components/database-manager/server-functions-manager';
import { SecretsManager } from '@/components/database-manager/secrets-manager';
import { ScheduledFunctionsManager } from '@/components/database-manager/scheduled-functions-manager';
import { Code2, Wrench, Key, Clock, Lock, Settings2, PowerOff, Database, AlertTriangle } from 'lucide-react';
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
import type { Project, ProjectRuntime } from '@/lib/vfs/types';
import { getProjectRuntimes } from '@/lib/runtimes/registry';
import type {
  FunctionsDataProvider,
  ServerFunctionsDataProvider,
  SecretsDataProvider,
  ScheduledFunctionsDataProvider,
} from '@/components/database-manager/data-providers';
import { SchemaEditor } from './schema-editor';

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
        await adapter.createEdgeFunction({
          id: crypto.randomUUID(),
          projectId,
          name: data.name || '',
          method: data.method || 'GET',
          code: data.code || '',
          description: data.description || '',
          enabled: data.enabled ?? true,
          timeoutMs: data.timeoutMs ?? 10000,
          createdAt: now,
          updatedAt: now,
        });
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
        if (existing) await adapter.updateEdgeFunction({ ...existing, enabled, updatedAt: new Date() });
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
        await adapter.createServerFunction({
          id: crypto.randomUUID(),
          projectId,
          name: data.name || '',
          code: data.code || '',
          description: data.description || '',
          enabled: data.enabled ?? true,
          createdAt: now,
          updatedAt: now,
        });
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
        if (existing) await adapter.updateServerFunction({ ...existing, enabled, updatedAt: new Date() });
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
        await adapter.createScheduledFunction({
          id: crypto.randomUUID(),
          projectId,
          name: data.name || '',
          description: data.description || '',
          functionId: data.functionId || '',
          cronExpression: data.cronExpression || '',
          timezone: data.timezone || 'UTC',
          config: data.config || {},
          enabled: data.enabled ?? true,
          createdAt: now,
          updatedAt: now,
        });
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
        if (existing) await adapter.updateScheduledFunction({ ...existing, enabled, updatedAt: new Date() });
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
      const proj = await vfs.getProject(project.id);
      proj.settings = { ...proj.settings, runtime: value };
      await vfs.updateProject(proj);
      onProjectUpdate(proj);
      const label = getProjectRuntimes().find(r => r.value === value)?.label || value;
      toast.success(`Runtime changed to ${label}`);
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

export function ProjectSettingsPanel({ project, onProjectUpdate, enabled, workspaceId }: ProjectSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState('general');
  const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';

  const functionsProvider = useMemo(() => createFunctionsProvider(project.id), [project.id]);
  const serverFunctionsProvider = useMemo(() => createServerFunctionsProvider(project.id), [project.id]);
  const secretsProvider = useMemo(() => createSecretsProvider(project.id), [project.id]);
  const scheduledFunctionsProvider = useMemo(() => createScheduledFunctionsProvider(project.id), [project.id]);

  const backendTabTrigger = (value: string, icon: React.ReactNode, label: string) => (
    <TabsTrigger
      value={value}
      className="flex items-center gap-1 text-xs"
    >
      {icon}
      {label}
    </TabsTrigger>
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden p-3">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="general" className="flex items-center gap-1 text-xs">
              <Settings2 className="h-3 w-3" />
              General
            </TabsTrigger>
            {backendTabTrigger('functions', <Code2 className="h-3 w-3" />, 'Functions')}
            {backendTabTrigger('helpers', <Wrench className="h-3 w-3" />, 'Helpers')}
            {backendTabTrigger('secrets', <Key className="h-3 w-3" />, 'Secrets')}
            {backendTabTrigger('schedules', <Clock className="h-3 w-3" />, 'Schedules')}
            {backendTabTrigger('schema', <Database className="h-3 w-3" />, 'Schema')}
          </TabsList>

          {!isServerMode && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
              <Lock className="h-3 w-3 shrink-0" />
              Backend features require Server Mode.{' '}
              <a
                href="https://github.com/o-stahl/osw-studio"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Learn more
              </a>
            </p>
          )}

          <div className="flex-1 overflow-hidden mt-3">
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
                <Settings2 className="h-4 w-4" />
                Project Settings
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
