'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Deployment, Project } from '@/lib/vfs/types';
import { vfs } from '@/lib/vfs';
import { getSyncManager } from '@/lib/vfs/sync-manager';
import { DeploymentCard } from '../deployment-card';
import { DeploymentSettingsModal } from '../deployment-settings';
import { ServerSettingsModal } from '../server-settings';
import { CreateDeploymentModal } from '../create-deployment-modal';
import { AnalyticsDashboard } from '../analytics-dashboard';
import { TemplateExportDialog } from '../templates/template-export-dialog';
import { ProjectSwapDialog } from '../project-swap-dialog';
import { Globe, Plus, Search, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { logger } from '@/lib/utils';

type SortOption = 'updated' | 'created' | 'name' | 'published';

interface DeploymentsViewProps {
  onProjectSelect: (project: Project) => void;
}

export function DeploymentsView({ onProjectSelect }: DeploymentsViewProps) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishingStates, setPublishingStates] = useState<Record<string, boolean>>({});
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showServerSettingsModal, setShowServerSettingsModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTemplateExportModal, setShowTemplateExportModal] = useState(false);
  const [templateExportDeployment, setTemplateExportDeployment] = useState<Deployment | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('updated');
  const [swapDialogState, setSwapDialogState] = useState<{
    deploymentId: string;
    deploymentName: string;
    currentProjectId: string;
    newProjectId: string;
    newProjectName: string;
    pendingSettings: Partial<Deployment>;
  } | null>(null);
  const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      if (!isServerMode) {
        setLoading(false);
        return;
      }

      const [deploymentsResponse, projectsResponse] = await Promise.all([
        fetch('/api/deployments'),
        fetch('/api/projects?fields=id,name'), // Only fetch id and name fields
      ]);

      // Redirect to login if unauthorized
      if (deploymentsResponse.status === 401 || projectsResponse.status === 401) {
        window.location.href = '/admin/login';
        return;
      }

      if (!deploymentsResponse.ok) {
        throw new Error('Failed to fetch deployments');
      }
      if (!projectsResponse.ok) {
        throw new Error('Failed to fetch projects');
      }

      const [fetchedDeployments, fetchedProjects] = await Promise.all([
        deploymentsResponse.json(),
        projectsResponse.json(),
      ]);

      setDeployments(fetchedDeployments);
      setProjects(fetchedProjects);
    } catch (error) {
      logger.error('[DeploymentsView] Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to update a single deployment in state (optimistic updates)
  const updateDeploymentInState = (deploymentId: string, updates: Partial<Deployment>) => {
    setDeployments(prevDeployments =>
      prevDeployments.map(deployment =>
        deployment.id === deploymentId ? { ...deployment, ...updates } : deployment
      )
    );
  };

  const handleOpenSettings = (deployment: Deployment) => {
    setSelectedDeployment(deployment);
    setShowSettingsModal(true);
  };

  const handleOpenServerSettings = (deployment: Deployment) => {
    setSelectedDeployment(deployment);
    setShowServerSettingsModal(true);
  };

  const handleViewAnalytics = (deployment: Deployment) => {
    setSelectedDeployment(deployment);
    setShowAnalyticsModal(true);
  };

  const handleEditProject = async (deployment: Deployment) => {
    try {
      await vfs.init();
      const project = await vfs.getProject(deployment.projectId);
      if (!project) {
        toast.error('Project not found in local storage');
        return;
      }
      onProjectSelect(project);
    } catch (error) {
      logger.error('[DeploymentsView] Failed to load project:', error);
      toast.error('Failed to load project');
    }
  };

  const [templateExportProject, setTemplateExportProject] = useState<Project | null>(null);

  const handleExportAsTemplate = async (deployment: Deployment) => {
    try {
      await vfs.init();
      const project = await vfs.getProject(deployment.projectId);
      if (!project) {
        toast.error('Project not found in local storage');
        return;
      }
      setTemplateExportDeployment(deployment);
      setTemplateExportProject(project);
      setShowTemplateExportModal(true);
    } catch (error) {
      logger.error('[DeploymentsView] Failed to load project for template export:', error);
      toast.error('Failed to load project');
    }
  };

  const handleSaveSettings = async (settings: Partial<Deployment>) => {
    if (!selectedDeployment) return;

    try {
      // If projectId changed in server mode, show swap dialog for conflict analysis
      const projectIdChanged = settings.projectId && settings.projectId !== selectedDeployment.projectId;
      if (projectIdChanged && isServerMode && selectedDeployment.publishedAt) {
        const newProject = projects.find(p => p.id === settings.projectId);
        setSwapDialogState({
          deploymentId: selectedDeployment.id,
          deploymentName: selectedDeployment.name,
          currentProjectId: selectedDeployment.projectId,
          newProjectId: settings.projectId!,
          newProjectName: newProject?.name || 'Unknown',
          pendingSettings: settings,
        });
        return; // Don't save yet — swap dialog will handle it
      }

      if (projectIdChanged) {
        // Non-server mode or first deploy: update directly
        const deploymentResponse = await fetch(`/api/deployments/${selectedDeployment.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: settings.projectId }),
        });

        if (!deploymentResponse.ok) {
          const error = await deploymentResponse.json();
          throw new Error(error.error || 'Failed to update project');
        }
      }

      // Save publishing settings (exclude projectId — handled above)
      const { projectId: _projectId, ...publishSettings } = settings;

      const response = await fetch(`/api/deployments/${selectedDeployment.id}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(publishSettings),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save settings');
      }

      const result = await response.json();

      // Update local deployment state in the selected deployment modal
      setSelectedDeployment({
        ...selectedDeployment,
        ...settings,
        settingsVersion: result.settingsVersion,
        lastPublishedVersion: result.lastPublishedVersion,
      });

      // Update the deployment in the main list (optimistic update - no full reload)
      updateDeploymentInState(selectedDeployment.id, {
        ...settings,
        settingsVersion: result.settingsVersion,
        updatedAt: new Date(),
      });
    } catch (error) {
      logger.error('[DeploymentsView] Failed to save deployment settings:', error);
      throw error;
    }
  };

  const handleSwapComplete = async () => {
    if (!swapDialogState) return;

    // Swap + republish completed via the swap API.
    // Now save any remaining publishing settings.
    const { deploymentId, pendingSettings } = swapDialogState;
    const { projectId: _projectId, ...publishSettings } = pendingSettings;

    try {
      const response = await fetch(`/api/deployments/${deploymentId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publishSettings),
      });

      if (response.ok) {
        const result = await response.json();
        updateDeploymentInState(deploymentId, {
          ...pendingSettings,
          settingsVersion: result.settingsVersion,
          updatedAt: new Date(),
          publishedAt: new Date(),
        });
      }
    } catch (err) {
      logger.error('[DeploymentsView] Failed to save settings after swap:', err);
    }

    setSwapDialogState(null);
    setShowSettingsModal(false);
    setSelectedDeployment(null);
    toast.success('Project swapped and deployment republished');
    await loadData();
  };

  const handlePublish = async (deploymentId: string) => {
    const deployment = deployments.find(s => s.id === deploymentId);
    if (!deployment) return;

    if (!confirm('Publish this deployment with the current settings?')) {
      return;
    }

    // Set publishing state
    setPublishingStates(prev => ({ ...prev, [deploymentId]: true }));

    try {
      // First, sync files from IndexedDB to server
      toast.info('Syncing project files...');

      await vfs.init();
      const project = await vfs.getProject(deployment.projectId);
      if (!project) {
        throw new Error('Project not found in local storage');
      }

      const files = await vfs.listFiles(deployment.projectId);
      const syncManager = getSyncManager();

      // Push project and files to server
      const syncResult = await syncManager.pushProjectWithFiles(project, files);
      if (!syncResult.success) {
        throw new Error(syncResult.error || 'Failed to sync files to server');
      }

      // Sync backend features from IndexedDB to server
      const adapter = await vfs.getStorageAdapter();
      const edgeFunctions = adapter.listEdgeFunctions ? await adapter.listEdgeFunctions(deployment.projectId) : [];
      const serverFunctions = adapter.listServerFunctions ? await adapter.listServerFunctions(deployment.projectId) : [];
      const secrets = adapter.listSecrets ? await adapter.listSecrets(deployment.projectId) : [];
      const scheduledFunctions = adapter.listScheduledFunctions ? await adapter.listScheduledFunctions(deployment.projectId) : [];

      if (edgeFunctions.length > 0 || serverFunctions.length > 0 ||
          secrets.length > 0 || scheduledFunctions.length > 0) {
        toast.info('Syncing backend features...');
        const featuresSyncResult = await syncManager.pushBackendFeatures(deployment.projectId, {
          edgeFunctions,
          serverFunctions,
          secrets,
          scheduledFunctions,
        });
        if (!featuresSyncResult.success) {
          throw new Error(featuresSyncResult.error || 'Failed to sync backend features');
        }
      }

      toast.info('Building deployment...');

      // Call publish API to trigger build
      const response = await fetch(`/api/deployments/${deploymentId}/publish`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to publish');
      }

      const result = await response.json();

      toast.success(`Deployment published! ${result.filesWritten} files written.`);

      // Update state optimistically with publish data
      updateDeploymentInState(deploymentId, {
        lastPublishedVersion: result.lastPublishedVersion,
        publishedAt: new Date(),
        updatedAt: new Date(),
        databaseEnabled: true, // Deployment database is now enabled
      });

      // Clear publishing state immediately after successful publish
      setPublishingStates(prev => ({ ...prev, [deploymentId]: false }));
    } catch (error) {
      logger.error('Failed to publish:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to publish. Please try again.');
      // Clear publishing state on error
      setPublishingStates(prev => ({ ...prev, [deploymentId]: false }));
    }
  };

  const handleDeploymentThumbnailChange = async (deploymentId: string, image: string | undefined) => {
    try {
      const response = await fetch(`/api/deployments/${deploymentId}/thumbnail`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previewImage: image ?? null }),
      });
      if (!response.ok) throw new Error('Failed to update thumbnail');

      updateDeploymentInState(deploymentId, {
        previewImage: image,
        previewUpdatedAt: image ? new Date() : undefined,
      });
    } catch (err) {
      logger.error('[DeploymentsView] Failed to update deployment thumbnail:', err);
      toast.error('Failed to update thumbnail');
    }
  };

  const handleDisable = async (deploymentId: string) => {
    const deployment = deployments.find(s => s.id === deploymentId);
    if (!deployment) return;

    if (!confirm('Disable this deployment? It will no longer be publicly accessible.')) {
      return;
    }

    try {
      const response = await fetch(`/api/deployments/${deploymentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: false,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to disable deployment');
      }

      // Update state optimistically (no full reload)
      updateDeploymentInState(deploymentId, {
        enabled: false,
        updatedAt: new Date(),
      });
    } catch (error) {
      logger.error('Failed to disable deployment:', error);
      alert('Failed to disable deployment. Please try again.');
    }
  };

  const handleEnable = async (deploymentId: string) => {
    const deployment = deployments.find(s => s.id === deploymentId);
    if (!deployment) return;

    try {
      const response = await fetch(`/api/deployments/${deploymentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to enable deployment');
      }

      // Update state optimistically (no full reload)
      updateDeploymentInState(deploymentId, {
        enabled: true,
        updatedAt: new Date(),
      });
    } catch (error) {
      logger.error('Failed to enable deployment:', error);
      alert('Failed to enable deployment. Please try again.');
    }
  };

  const handleDelete = async (deploymentId: string) => {
    const deployment = deployments.find(s => s.id === deploymentId);
    if (!deployment) return;

    if (!confirm(`Delete deployment "${deployment.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/deployments/${deploymentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete deployment');
      }

      await loadData();
    } catch (error) {
      logger.error('Failed to delete deployment:', error);
      alert('Failed to delete deployment. Please try again.');
    }
  };

  const handleCreateDeployment = async (data: { projectId: string; name: string; slug?: string }) => {
    try {
      const response = await fetch('/api/deployments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create deployment');
      }

      await loadData();
      setShowCreateModal(false);
    } catch (error) {
      logger.error('Failed to create deployment:', error);
      throw error;
    }
  };

  // Filter and sort deployments
  const filteredAndSortedDeployments = useMemo(() => {
    let filtered = deployments;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = deployments.filter(deployment => {
        const project = projects.find(p => p.id === deployment.projectId);
        return (
          deployment.name.toLowerCase().includes(query) ||
          deployment.slug?.toLowerCase().includes(query) ||
          project?.name.toLowerCase().includes(query)
        );
      });
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'created':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'published':
          if (!a.publishedAt && !b.publishedAt) return 0;
          if (!a.publishedAt) return 1;
          if (!b.publishedAt) return -1;
          return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        case 'updated':
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

    return sorted;
  }, [deployments, projects, searchQuery, sortBy]);

  if (!isServerMode) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p>Deployments feature is only available in Server Mode</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4">Loading deployments...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col">
        {/* Toolbar */}
        <div className="pt-4 px-4 pb-3 sm:pt-6 sm:px-6 sm:pb-3 shrink-0">
          <div className="mx-auto max-w-7xl flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search deployments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              {/* Sort */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <ArrowUpDown className="h-4 w-4" />
                    <span className="hidden sm:inline">Sort</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48" align="end">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Sort by</h4>
                    <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="updated">Last Updated</SelectItem>
                        <SelectItem value="published">Last Published</SelectItem>
                        <SelectItem value="created">Date Created</SelectItem>
                        <SelectItem value="name">Name</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </PopoverContent>
              </Popover>

              {/* New Deployment */}
              <Button onClick={() => setShowCreateModal(true)} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                <span>New</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Deployments Grid/List */}
        <div className="flex-1 px-4 pt-3 pb-4 sm:px-6 sm:pt-3 sm:pb-6 overflow-auto">
          <div className="mx-auto max-w-7xl">
            {filteredAndSortedDeployments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Globe className="h-16 w-16 text-muted-foreground mb-4" />
                {deployments.length === 0 ? (
                  <>
                    <h2 className="text-xl font-semibold mb-2">No Deployments Yet</h2>
                    <p className="text-muted-foreground mb-4 max-w-md">
                      Create your first deployment by clicking the "New" button above.
                      Deployments let you publish projects and manage their public settings independently.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-semibold mb-2">No deployments found</h2>
                    <p className="text-muted-foreground mb-4 max-w-md">
                      Try adjusting your search or filter criteria
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAndSortedDeployments.map((deployment) => {
                  const project = projects.find(p => p.id === deployment.projectId);
                  return (
                    <DeploymentCard
                      key={deployment.id}
                      deployment={deployment}
                      project={project}
                      isPublishing={publishingStates[deployment.id] || false}
                      onOpenSettings={handleOpenSettings}
                      onOpenServerSettings={handleOpenServerSettings}
                      onViewAnalytics={handleViewAnalytics}
                      onEditProject={handleEditProject}
                      onPublish={handlePublish}
                      onDisable={handleDisable}
                      onEnable={handleEnable}
                      onDelete={handleDelete}
                      onExportAsTemplate={handleExportAsTemplate}
                      onThumbnailChange={handleDeploymentThumbnailChange}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedDeployment && (
        <>
          <DeploymentSettingsModal
            deployment={selectedDeployment}
            projects={projects}
            isOpen={showSettingsModal}
            onClose={() => {
              setShowSettingsModal(false);
              setSelectedDeployment(null);
            }}
            onSave={handleSaveSettings}
          />

          <ServerSettingsModal
            deployment={selectedDeployment}
            isOpen={showServerSettingsModal}
            onClose={() => {
              setShowServerSettingsModal(false);
              setSelectedDeployment(null);
            }}
          />

          <AnalyticsDashboard
            deployment={selectedDeployment}
            isOpen={showAnalyticsModal}
            onClose={() => {
              setShowAnalyticsModal(false);
              setSelectedDeployment(null);
            }}
          />
        </>
      )}

      <CreateDeploymentModal
        projects={projects}
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateDeployment}
      />

      <TemplateExportDialog
        project={templateExportProject}
        open={showTemplateExportModal}
        onOpenChange={(open) => {
          setShowTemplateExportModal(open);
          if (!open) {
            setTemplateExportDeployment(null);
            setTemplateExportProject(null);
          }
        }}
      />

      {swapDialogState && (
        <ProjectSwapDialog
          isOpen={true}
          onClose={() => setSwapDialogState(null)}
          deploymentId={swapDialogState.deploymentId}
          deploymentName={swapDialogState.deploymentName}
          currentProjectId={swapDialogState.currentProjectId}
          newProjectId={swapDialogState.newProjectId}
          newProjectName={swapDialogState.newProjectName}
          onSwapComplete={handleSwapComplete}
        />
      )}
    </>
  );
}
