'use client';

import React, { useState, useMemo } from 'react';
import { vfs } from '@/lib/vfs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FunctionsManager } from '@/components/database-manager/functions-manager';
import { ServerFunctionsManager } from '@/components/database-manager/server-functions-manager';
import { SecretsManager } from '@/components/database-manager/secrets-manager';
import { ScheduledFunctionsManager } from '@/components/database-manager/scheduled-functions-manager';
import { Code2, Wrench, Key, Clock, Lock, Server, PowerOff, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  FunctionsDataProvider,
  ServerFunctionsDataProvider,
  SecretsDataProvider,
  ScheduledFunctionsDataProvider,
} from '@/components/database-manager/data-providers';
import { SchemaEditor } from './schema-editor';

interface ProjectBackendPanelProps {
  projectId: string;
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
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

export function ProjectBackendPanel({ projectId, enabled, onToggleEnabled }: ProjectBackendPanelProps) {
  const [activeTab, setActiveTab] = useState('functions');
  const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';

  const functionsProvider = useMemo(() => createFunctionsProvider(projectId), [projectId]);
  const serverFunctionsProvider = useMemo(() => createServerFunctionsProvider(projectId), [projectId]);
  const secretsProvider = useMemo(() => createSecretsProvider(projectId), [projectId]);
  const scheduledFunctionsProvider = useMemo(() => createScheduledFunctionsProvider(projectId), [projectId]);

  // Browser mode gating
  if (!isServerMode) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex items-center justify-center p-8">
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
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden p-3">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="functions" className="flex items-center gap-1 text-xs" disabled={!enabled}>
              <Code2 className="h-3 w-3" />
              Functions
            </TabsTrigger>
            <TabsTrigger value="helpers" className="flex items-center gap-1 text-xs" disabled={!enabled}>
              <Wrench className="h-3 w-3" />
              Helpers
            </TabsTrigger>
            <TabsTrigger value="secrets" className="flex items-center gap-1 text-xs" disabled={!enabled}>
              <Key className="h-3 w-3" />
              Secrets
            </TabsTrigger>
            <TabsTrigger value="schedules" className="flex items-center gap-1 text-xs" disabled={!enabled}>
              <Clock className="h-3 w-3" />
              Schedules
            </TabsTrigger>
            <TabsTrigger value="schema" className="flex items-center gap-1 text-xs" disabled={!enabled}>
              <Database className="h-3 w-3" />
              Schema
            </TabsTrigger>
          </TabsList>

          {!enabled ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-xs">
                <PowerOff className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Backend features are disabled for this project. Enable them using the toggle above to manage edge functions, secrets, and more.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden mt-3">
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
                  projectId={projectId}
                  enabled={enabled}
                  onSchemaChange={() => {
                    // Refresh server context to update transient files
                    vfs.refreshServerContext();
                  }}
                />
              </TabsContent>
            </div>
          )}
        </Tabs>
      </div>
    </div>
  );
}

interface ProjectBackendModalProps {
  projectId: string;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
}

export function ProjectBackendModal({ projectId, projectName, isOpen, onClose, enabled, onToggleEnabled }: ProjectBackendModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl h-[70vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Server className="h-4 w-4" />
                Backend
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {projectName}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{enabled ? 'Enabled' : 'Disabled'}</span>
              <Switch checked={enabled} onCheckedChange={onToggleEnabled} />
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <ProjectBackendPanel projectId={projectId} enabled={enabled} onToggleEnabled={onToggleEnabled} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
