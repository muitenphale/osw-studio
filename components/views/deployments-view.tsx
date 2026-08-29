'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Deployment, Project } from '@/lib/vfs/types';
import { vfs } from '@/lib/vfs';
import { getLoginUrl } from '@/lib/config/storage';
import { getSyncManager } from '@/lib/vfs/sync-manager';
import { createSyncProgressToast } from '@/lib/vfs/sync-progress-toast';
import { SERVER_PROJECTS_CHANGED } from '@/lib/vfs/sync-events';
import { DeploymentCard } from '../deployment-card';
import { DeploymentDetail, type DeploymentSettingsUpdate } from '../deployment-detail';
import type { ReviewDraft } from '../publish-settings/review-tab';
import { CreateDeploymentModal } from '../create-deployment-modal';
import { takePendingDeploymentRequest } from '@/lib/deployments/pending-create';
import { AnalyticsDashboard } from '../analytics-dashboard';
import { TemplateExportDialog } from '../templates/template-export-dialog';
import { ProjectSwapDialog } from '../project-swap-dialog';
import { PageShell, PageHeader, PageBody } from '@/components/ui/page-shell';
import { Globe, Plus, Search, ArrowUpDown, MoreVertical, Settings, RefreshCw, Eye, EyeOff, Trash2, Copy, Pencil, ExternalLink } from 'lucide-react';
import { ViewModeToggle, useViewMode } from '@/components/ui/view-mode-toggle';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { logger, formatCompactAge } from '@/lib/utils';
import { track } from '@/lib/telemetry';
import { usePagination } from '@/lib/hooks/use-pagination';
import { Pagination, PaginationRange } from '@/components/ui/pagination';
import { ThumbnailArea } from '@/components/ui/thumbnail-area';
import { captureDeploymentScreenshot } from '@/lib/utils/deployment-thumbnail';

type SortOption = 'updated' | 'created' | 'name' | 'published';

interface DeploymentsViewProps {
  /** `previewPath` opens the workspace preview on that page — used by the review comment inbox. */
  onProjectSelect: (project: Project, previewPath?: string) => void;
  workspaceId?: string;
}

export function DeploymentsView({ onProjectSelect, workspaceId }: DeploymentsViewProps) {
  const apiBase = workspaceId ? `/api/w/${workspaceId}` : '/api';
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishingStates, setPublishingStates] = useState<Record<string, boolean>>({});
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForProjectId, setCreateForProjectId] = useState<string | undefined>(undefined);
  const [showTemplateExportModal, setShowTemplateExportModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('updated');
  const [viewMode, setViewMode] = useViewMode('deployments');
  const [swapDialogState, setSwapDialogState] = useState<{
    deploymentId: string;
    deploymentName: string;
    currentProjectId: string;
    newProjectId: string;
    newProjectName: string;
    pendingSettings: DeploymentSettingsUpdate;
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
        fetch(`${apiBase}/deployments`),
        fetch(`${apiBase}/projects?fields=id,name`), // Only fetch id and name fields
      ]);

      // Redirect to login if unauthorized
      if (deploymentsResponse.status === 401 || projectsResponse.status === 401) {
        window.location.href = getLoginUrl();
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

  // Re-read the server's project list. Cheap and side-effect free, so anything that opens a
  // project picker can call it.
  const fetchProjects = useCallback(async () => {
    if (!isServerMode) return;
    try {
      const res = await fetch(`${apiBase}/projects?fields=id,name`);
      if (res.status === 401) {
        window.location.href = getLoginUrl();
        return;
      }
      if (!res.ok) return;
      setProjects(await res.json());
    } catch (error) {
      logger.error('[DeploymentsView] Failed to refresh project list:', error);
    }
  }, [apiBase, isServerMode]);

  // Reconcile any project that has drifted from the server (imports, or an earlier failed push)
  // before re-reading the list, so a freshly imported project is deployable straight away.
  // Kept separate from fetchProjects: this pushes data, and running it on every picker open would
  // be a heavy, quota-consuming side effect. It also must not be able to skip the re-read, which
  // is why the reconcile has its own catch.
  const refreshProjectList = useCallback(async () => {
    if (!isServerMode) return;
    try {
      const { reconcileProjectsToServer } = await import('@/lib/vfs/auto-sync');
      await reconcileProjectsToServer(workspaceId);
    } catch (error) {
      logger.error('[DeploymentsView] Failed to reconcile projects before refresh:', error);
    }
    await fetchProjects();
  }, [isServerMode, workspaceId, fetchProjects]);

  const handleOpenCreate = () => {
    setShowCreateModal(true);
    // Refresh in the background; the dropdown updates reactively when it resolves.
    void refreshProjectList();
  };

  // Deploy in the workspace leaves the project here rather than passing a prop, because this view
  // is not mounted at the moment Deploy runs. Collect it once, on mount.
  useEffect(() => {
    const projectId = takePendingDeploymentRequest();
    if (!projectId) return;
    setCreateForProjectId(projectId);
    setShowCreateModal(true);
    void refreshProjectList();
  }, [refreshProjectList]);

  // A push from the Server Sync dialog happens in a sibling subtree (it is mounted by PageLayout),
  // so it cannot reach this view through props. It broadcasts instead.
  useEffect(() => {
    if (!isServerMode) return;
    const handler = () => { void fetchProjects(); };
    window.addEventListener(SERVER_PROJECTS_CHANGED, handler);
    return () => window.removeEventListener(SERVER_PROJECTS_CHANGED, handler);
  }, [isServerMode, fetchProjects]);

  // Helper function to update a single deployment in state (optimistic updates)
  const updateDeploymentInState = (deploymentId: string, updates: Partial<Deployment>) => {
    setDeployments(prevDeployments =>
      prevDeployments.map(deployment =>
        deployment.id === deploymentId ? { ...deployment, ...updates } : deployment
      )
    );
  };

  const handleOpenDetail = (deployment: Deployment) => {
    setSelectedDeployment(deployment);
    void fetchProjects();
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

  /** Open the deployment's project in the editor with the preview already on the commented page. */
  const handleOpenPageInEditor = async (deployment: Deployment, pagePath: string) => {
    try {
      await vfs.init();
      const project = await vfs.getProject(deployment.projectId);
      if (!project) {
        toast.error('Project not found in local storage');
        return;
      }
      onProjectSelect(project, pagePath);
    } catch (error) {
      logger.error('[DeploymentsView] Failed to open project page:', error);
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
      setTemplateExportProject(project);
      setShowTemplateExportModal(true);
    } catch (error) {
      logger.error('[DeploymentsView] Failed to load project for template export:', error);
      toast.error('Failed to load project');
    }
  };

  /**
   * Persist the review block, and answer with what the server actually stored.
   *
   * It goes to the deployment route rather than the settings one: only that handler runs
   * `mergeReviewConfig`, and the settings route deliberately drops `review` because writing a block
   * that has been through `toPublicDeployment` — no password hash on it — would unlock the review
   * copy. The response is what gets kept, so the plaintext password never lands in component state.
   */
  const saveReviewBlock = async (
    deploymentId: string,
    review: ReviewDraft
  ): Promise<Deployment['review']> => {
    const response = await fetch(`${apiBase}/deployments/${deploymentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to save review settings');
    }

    const updated = await response.json();
    return updated.review;
  };

  const handleSaveSettings = async (settings: DeploymentSettingsUpdate) => {
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
        const deploymentResponse = await fetch(`${apiBase}/deployments/${selectedDeployment.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: settings.projectId }),
        });

        if (!deploymentResponse.ok) {
          const error = await deploymentResponse.json();
          throw new Error(error.error || 'Failed to update project');
        }
      }

      // Save publishing settings (exclude projectId and review — both handled separately)
      const { projectId: _projectId, review, ...publishSettings } = settings;

      // Ahead of the settings PUT: enabling review mode bumps settingsVersion server-side, and the
      // settings response is what this component then trusts for that counter.
      const savedReview = review
        ? await saveReviewBlock(selectedDeployment.id, review)
        : selectedDeployment.review;

      const response = await fetch(`${apiBase}/deployments/${selectedDeployment.id}/settings`, {
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

      // Fire only on the empty -> set transition, never on every save and
      // never with the domain value itself.
      if (!selectedDeployment.customDomain && settings.customDomain) {
        track('custom_domain_set');
      }

      // Update local deployment state in the selected deployment modal
      setSelectedDeployment({
        ...selectedDeployment,
        ...settings,
        review: savedReview,
        settingsVersion: result.settingsVersion,
        lastPublishedVersion: result.lastPublishedVersion,
      });

      // Update the deployment in the main list (optimistic update - no full reload)
      updateDeploymentInState(selectedDeployment.id, {
        ...settings,
        review: savedReview,
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
    const { projectId: _projectId, review, ...publishSettings } = pendingSettings;

    try {
      const savedReview = review ? await saveReviewBlock(deploymentId, review) : undefined;

      const response = await fetch(`${apiBase}/deployments/${deploymentId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publishSettings),
      });

      if (response.ok) {
        const result = await response.json();
        updateDeploymentInState(deploymentId, {
          ...pendingSettings,
          ...(review ? { review: savedReview } : {}),
          settingsVersion: result.settingsVersion,
          updatedAt: new Date(),
          publishedAt: new Date(),
        });
      }
    } catch (err) {
      logger.error('[DeploymentsView] Failed to save settings after swap:', err);
    }

    setSwapDialogState(null);
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

    let trackedRuntime = 'unknown';

    try {
      // First, sync files from IndexedDB to server
      toast.info('Syncing project files...');

      await vfs.init();
      const project = await vfs.getProject(deployment.projectId);
      if (!project) {
        throw new Error('Project not found in local storage');
      }

      // Block publishing for terminal-mode runtimes (Python, Lua) — they can't be
      // served as static sites. Use ZIP export instead.
      const { isRuntimeBundled, getRuntimeConfig } = await import('@/lib/runtimes/registry');
      const runtime = project.settings?.runtime;
      trackedRuntime = runtime ?? 'unknown';
      if (runtime && getRuntimeConfig(runtime).previewMode === 'terminal') {
        throw new Error(`${getRuntimeConfig(runtime).label} projects cannot be published as static sites. Use ZIP export instead.`);
      }

      let files = await vfs.listFiles(deployment.projectId);

      if (runtime && isRuntimeBundled(runtime)) {
        // Always compile fresh — generated files may be stale or absent
        // (e.g. user publishes without opening the preview first)
        toast.info('Compiling project bundles...');
        const { VirtualServer } = await import('@/lib/preview/virtual-server');
        const vs = new VirtualServer(vfs as any, deployment.projectId, { runtime, minify: true });
        await vs.compileProject();
        vs.cleanupBlobUrls();

        const generatedFiles = vfs.getGeneratedFiles();
        if (generatedFiles.length > 0) {
          const withProjectId = generatedFiles.map(f => ({ ...f, projectId: deployment.projectId }));
          files = [...files, ...withProjectId];
        }
      }

      const syncManager = getSyncManager();

      // Push project and files to server. A project too large for one request body goes in
      // batches, which is many sequential requests over however slow the link is, so it reports
      // where it is instead of sitting on "Building deployment..." for the duration.
      const uploadProgress = createSyncProgressToast(`Uploading "${project.name}"`);
      const syncResult = await syncManager.pushProjectWithFiles(project, files, {
        onProgress: ({ batch, batches }) => uploadProgress.update(batch, batches),
      });
      if (!syncResult.success) {
        uploadProgress.dismiss();
        throw new Error(syncResult.error || 'Failed to sync files to server');
      }
      uploadProgress.dismiss();

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
      const response = await fetch(`${apiBase}/deployments/${deploymentId}/publish`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to publish');
      }

      const result = await response.json();

      track('deployment_publish', {
        runtime: runtime ?? 'unknown',
        result: 'success',
        has_custom_domain: !!deployment.customDomain,
      });

      toast.success(`Deployment published! ${result.filesWritten} files written.`);

      // Update state optimistically with publish data
      updateDeploymentInState(deploymentId, {
        lastPublishedVersion: result.lastPublishedVersion,
        publishedAt: new Date(),
        updatedAt: new Date(),
        databaseEnabled: true,
        ...(result.slug && { slug: result.slug }),
      });

      // Clear publishing state immediately after successful publish
      setPublishingStates(prev => ({ ...prev, [deploymentId]: false }));
    } catch (error) {
      logger.error('Failed to publish:', error);
      track('deployment_publish', {
        runtime: trackedRuntime,
        result: 'fail',
        has_custom_domain: !!deployment.customDomain,
      });
      toast.error(error instanceof Error ? error.message : 'Failed to publish. Please try again.');
      // Clear publishing state on error
      setPublishingStates(prev => ({ ...prev, [deploymentId]: false }));
    }
  };

  const handleDeploymentThumbnailChange = async (deploymentId: string, image: string | undefined) => {
    try {
      const response = await fetch(`${apiBase}/deployments/${deploymentId}/thumbnail`, {
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
      const response = await fetch(`${apiBase}/deployments/${deploymentId}`, {
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
      const response = await fetch(`${apiBase}/deployments/${deploymentId}`, {
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
      const response = await fetch(`${apiBase}/deployments/${deploymentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete deployment');
      }

      track('deployment_delete');

      await loadData();
    } catch (error) {
      logger.error('Failed to delete deployment:', error);
      alert('Failed to delete deployment. Please try again.');
    }
  };

  const handleCreateDeployment = async (data: { projectId: string; name: string; slug?: string }) => {
    try {
      const response = await fetch(`${apiBase}/deployments`, {
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

      track('deployment_create');

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

  const deploymentsPagination = usePagination(filteredAndSortedDeployments, {
    perPage: 24,
    resetOn: [searchQuery, sortBy],
  });
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);

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
          <Spinner size={48} color="#f97316" className="mx-auto" />
          <p className="mt-4">Loading deployments...</p>
        </div>
      </div>
    );
  }

  // ── Detail view ──
  if (selectedDeployment && !showAnalyticsModal) {
    return (
      <>
        <DeploymentDetail
          deployment={selectedDeployment}
          projects={projects}
          isPublishing={publishingStates[selectedDeployment.id] || false}
          onBack={() => setSelectedDeployment(null)}
          onSave={handleSaveSettings}
          onPublish={handlePublish}
          onOpenInEditor={(pagePath) => handleOpenPageInEditor(selectedDeployment, pagePath)}
          workspaceId={workspaceId}
        />

        <TemplateExportDialog
          project={templateExportProject}
          open={showTemplateExportModal}
          onOpenChange={(open) => {
            setShowTemplateExportModal(open);
            if (!open) setTemplateExportProject(null);
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
            workspaceId={workspaceId}
          />
        )}
      </>
    );
  }

  return (
    <>
      <PageShell>
        <PageHeader title="Deployments">
          {/* New Deployment */}
          <div className="flex items-center shrink-0">
            <Button onClick={handleOpenCreate} size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              <span>New</span>
            </Button>
          </div>

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
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
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
          </div>
        </PageHeader>

        {/* Deployments Grid/List */}
        <PageBody fill bodyRef={listScrollRef}>
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
              <div className="flex-1 min-h-0 flex flex-col">
                {deploymentsPagination.totalPages > 1 && (
                  <div className="flex items-center justify-between gap-3 mb-2 shrink-0">
                    <PaginationRange
                      total={deploymentsPagination.total}
                      rangeStart={deploymentsPagination.rangeStart}
                      rangeEnd={deploymentsPagination.rangeEnd}
                      totalPages={deploymentsPagination.totalPages}
                    />
                    <Pagination
                      page={deploymentsPagination.page}
                      totalPages={deploymentsPagination.totalPages}
                      onPageChange={deploymentsPagination.setPage}
                      scrollTarget={contentScrollRef}
                      className="pt-0 pb-0"
                    />
                  </div>
                )}
                {viewMode === 'table' ? (
                  <div ref={contentScrollRef} className="flex-1 min-h-0 overflow-auto border rounded-lg">
                    <table className="w-full table-auto border-collapse">
                      <thead className="sticky top-0 z-10">
                        <tr>
                          <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none"></th>
                          <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none w-full">Name</th>
                          <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none">URL</th>
                          <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none">Ver.</th>
                          <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none">Published</th>
                          <th className="bg-muted text-[11px] font-medium text-muted-foreground text-left p-[6px_10px] border-b whitespace-nowrap select-none"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {deploymentsPagination.pageItems.map((deployment) => {
                          const project = projects.find(p => p.id === deployment.projectId);
                          const isPublished = deployment.lastPublishedVersion !== null && deployment.lastPublishedVersion !== undefined;
                          const hasPendingChanges = isPublished && Number(deployment.settingsVersion) > Number(deployment.lastPublishedVersion);
                          const publicUrl = deployment.publicUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/deployments/${deployment.id}`;
                          return (
                            <tr key={deployment.id} className="border-b border-border/50 hover:bg-muted/50 cursor-pointer h-[44px]" onClick={() => handleOpenDetail(deployment)}>
                              <td className="p-[4px_10px] align-middle">
                                <ThumbnailArea
                                  size="xs"
                                  image={deployment.previewImage || project?.previewImage}
                                  onCapture={isPublished ? async () => captureDeploymentScreenshot(publicUrl) : undefined}
                                  onImageChange={(img) => handleDeploymentThumbnailChange(deployment.id, img)}
                                />
                              </td>
                              <td className="w-full p-[4px_10px] text-[13px] align-middle overflow-hidden" style={{ maxWidth: 0 }}>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-medium text-foreground text-[13px] truncate">{deployment.name}</span>
                                    {!deployment.enabled && <Badge variant="outline" className="text-[10px] shrink-0">Disabled</Badge>}
                                  </div>
                                  <span className="block text-[11px] text-muted-foreground truncate">{deployment.slug || project?.name || ''}</span>
                                </div>
                              </td>
                              <td className="p-[4px_10px] text-[11px] text-muted-foreground align-middle" style={{ maxWidth: 320 }}>
                                {deployment.enabled ? (
                                  <div className="flex items-center gap-1 min-w-0">
                                    <span className="font-mono truncate">{publicUrl.replace(/^https?:\/\//, '')}</span>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(publicUrl); toast.success('URL copied'); }}
                                      className="shrink-0 h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15 transition-colors"
                                      title="Copy URL"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                    <a
                                      href={publicUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="shrink-0 h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15 transition-colors"
                                      title="Open link"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                ) : '—'}
                              </td>
                              <td className="p-[4px_10px] text-[13px] text-muted-foreground align-middle whitespace-nowrap font-mono tabular-nums">
                                {deployment.settingsVersion}{' / '}{deployment.lastPublishedVersion ?? '—'}
                              </td>
                              <td className="p-[4px_10px] text-[13px] text-muted-foreground align-middle whitespace-nowrap overflow-hidden text-ellipsis">
                                {deployment.publishedAt ? formatCompactAge(new Date(deployment.publishedAt)) : '—'}
                              </td>
                              <td className="p-[4px_10px] align-middle whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="outline" size="xs" onClick={() => handleOpenDetail(deployment)}>
                                    <Settings className="w-3 h-3" />Edit
                                  </Button>
                                  {deployment.enabled ? (
                                    <Button
                                      variant={hasPendingChanges ? 'outline' : 'ghost'}
                                      size="xs"
                                      onClick={() => handlePublish(deployment.id)}
                                      disabled={publishingStates[deployment.id]}
                                    >
                                      <RefreshCw className={`w-3 h-3 ${publishingStates[deployment.id] ? 'animate-spin' : ''}`} />
                                      {isPublished ? 'Republish' : 'Publish'}
                                    </Button>
                                  ) : (
                                    <Button variant="outline" size="xs" onClick={() => handleEnable(deployment.id)}>Enable</Button>
                                  )}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="xs" className="px-1"><MoreVertical className="w-3.5 h-3.5" /></Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => handleEditProject(deployment)}>
                                        <Pencil className="w-4 h-4 mr-2" />Edit Project
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      {deployment.enabled && (
                                        <DropdownMenuItem onClick={() => navigator.clipboard.writeText(publicUrl)}>
                                          <Copy className="w-4 h-4 mr-2" />Copy URL
                                        </DropdownMenuItem>
                                      )}
                                      {deployment.enabled ? (
                                        <DropdownMenuItem onClick={() => handleDisable(deployment.id)}>
                                          <EyeOff className="w-4 h-4 mr-2" />Disable
                                        </DropdownMenuItem>
                                      ) : (
                                        <DropdownMenuItem onClick={() => handleEnable(deployment.id)}>
                                          <Eye className="w-4 h-4 mr-2" />Enable
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem onClick={() => handleDelete(deployment.id)} className="text-destructive focus:text-destructive">
                                        <Trash2 className="w-4 h-4 mr-2" />Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div ref={contentScrollRef} className="flex-1 min-h-0 overflow-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {deploymentsPagination.pageItems.map((deployment) => {
                      const project = projects.find(p => p.id === deployment.projectId);
                      return (
                        <DeploymentCard
                          key={deployment.id}
                          deployment={deployment}
                          project={project}
                          isPublishing={publishingStates[deployment.id] || false}
                          onClick={handleOpenDetail}
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
                  </div>
                )}
              </div>
            )}
        </PageBody>
      </PageShell>

      {selectedDeployment && showAnalyticsModal && (
        <AnalyticsDashboard
          deployment={selectedDeployment}
          isOpen={showAnalyticsModal}
          onClose={() => {
            setShowAnalyticsModal(false);
            setSelectedDeployment(null);
          }}
        />
      )}

      <CreateDeploymentModal
        projects={projects}
        initialProjectId={createForProjectId}
        key={createForProjectId ?? 'new'}
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setCreateForProjectId(undefined);
        }}
        onCreate={handleCreateDeployment}
      />

      <TemplateExportDialog
        project={templateExportProject}
        open={showTemplateExportModal}
        onOpenChange={(open) => {
          setShowTemplateExportModal(open);
          if (!open) {
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
          workspaceId={workspaceId}
        />
      )}
    </>
  );
}
