'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Project } from '@/lib/vfs/types';
import { useWorkspaceStore } from '@/lib/stores/workspace';
import { PageLayout } from '@/components/page-layout';
import { ContentArea } from '@/components/views/content-area';
import { Workspace } from '@/components/workspace';
import { GuidedTourProvider } from '@/components/guided-tour/context';
import { GuidedTourOverlay } from '@/components/guided-tour/overlay';
import { AboutModal } from '@/components/about-modal';
import { GenerationShelf } from '@/components/generation-shelf';
import { vfs } from '@/lib/vfs';
import { toast } from 'sonner';
import { track } from '@/lib/telemetry';
import { TelemetryBootstrap } from '@/components/telemetry-bootstrap';
import { useProviderAutoAssign } from '@/lib/hooks/use-provider-auto-assign';
import { useModelConfigSignal } from '@/lib/hooks/use-model-config-signal';

type View = 'dashboard' | 'projects' | 'templates' | 'skills' | 'interviews' | 'deployments' | 'users' | 'workspaces' | 'docs' | 'settings';

interface PageWrapperProps {
  view: View;
  workspaceId?: string;
  settingsTab?: string;
  autoCreateProject?: boolean;
}

function getViewRoute(view: string, workspaceId?: string): string {
  const base = workspaceId ? `/w/${workspaceId}` : '/admin';
  const routes: Record<string, string> = {
    dashboard: `${base}/dashboard`,
    projects: `${base}/projects`,
    deployments: `${base}/deployments`,
    settings: `${base}/settings`,
    skills: `${base}/skills`,
    interviews: `${base}/interviews`,
    templates: `${base}/templates`,
    docs: `${base}/docs`,
    // System-wide routes (always /admin/)
    users: '/admin/users',
    workspaces: '/admin/workspaces',
  };
  return routes[view] || `${base}/projects`;
}

function PageWrapperInner({ view, workspaceId, settingsTab, autoCreateProject }: PageWrapperProps) {
  const router = useRouter();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showAboutModal, setShowAboutModal] = useState(false);

  // Global model auto-assign on provider connect. Mounted here (always-present root) so the
  // Connections UI works both inside and outside a workspace (dashboard -> Settings -> Connections).
  useProviderAutoAssign();

  // Reactive model-config signal + one-time model migration. Mounted here (always-present root)
  // so ANY ChatPanel (workspace, describe-mode, project-manager) reacts to model picks.
  useModelConfigSignal();

  useEffect(() => {
    useWorkspaceStore.getState().reattachServerTasks();
  }, []);

  // Track pageview on view/project changes
  useEffect(() => {
    const path = selectedProject ? 'workspace' : view;
    track('pageview', { path });
  }, [view, selectedProject]);

  const handleNavigate = useCallback((targetView: string) => {
    const route = getViewRoute(targetView, workspaceId);
    router.push(route);
  }, [router, workspaceId]);

  const handleProjectOpen = useCallback((project: Project) => {
    setSelectedProject(project);
    track('project_open');
  }, []);

  const handleShelfNavigate = useCallback(async (info: { id: string; name: string }) => {
    try {
      const project = await vfs.getProject(info.id);
      if (project) handleProjectOpen(project);
    } catch {
      toast.error('Could not open project');
    }
  }, [handleProjectOpen]);

  const content = selectedProject ? (
    <Workspace
      project={selectedProject}
      onBack={() => setSelectedProject(null)}
      workspaceId={workspaceId}
    />
  ) : (
    <ContentArea
      view={view}
      workspaceId={workspaceId}
      onProjectSelect={handleProjectOpen}
      settingsTab={settingsTab}
      onNavigate={handleNavigate}
      autoCreateProject={autoCreateProject}
    />
  );

  return (
    <>
      <PageLayout
        currentView={view}
        workspaceId={workspaceId}
        onNavigate={handleNavigate}
        onProjectSelect={handleProjectOpen}
        onOpenAbout={() => setShowAboutModal(true)}
        showSidebar={!selectedProject}
      >
        {content}
      </PageLayout>
      <GuidedTourOverlay location="global" />
      <AboutModal
        open={showAboutModal}
        onOpenChange={setShowAboutModal}
      />
      <TelemetryBootstrap />
      <GenerationShelf
        selectedProject={selectedProject}
        onNavigateToProject={handleShelfNavigate}
      />
    </>
  );
}

export function PageWrapper({ view, workspaceId, settingsTab, autoCreateProject }: PageWrapperProps) {
  return (
    <GuidedTourProvider>
      <PageWrapperInner view={view} workspaceId={workspaceId} settingsTab={settingsTab} autoCreateProject={autoCreateProject} />
    </GuidedTourProvider>
  );
}
