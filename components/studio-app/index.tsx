'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Project } from '@/lib/vfs/types';
import { Workspace } from '@/components/workspace';
import { GuidedTourProvider, useGuidedTour } from '@/components/guided-tour/context';
import { configManager } from '@/lib/config/storage';
import pkg from '../../package.json';
import { GuidedTourOverlay } from '@/components/guided-tour/overlay';
import { PageLayout } from '@/components/page-layout';
import { ContentArea } from '@/components/views/content-area';
import { AboutModal } from '@/components/about-modal';

function StudioInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const docParam = searchParams.get('doc');

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [currentView, setCurrentView] = useState<'projects' | 'sites' | 'templates' | 'skills' | 'docs' | 'settings'>('projects');
  const [showAboutModal, setShowAboutModal] = useState(false);
  const { state, setActiveProjectId, start: startTour } = useGuidedTour();

  // Check version and redirect to What's New if needed
  useEffect(() => {
    const currentVersion = pkg.version;
    const lastSeenVersion = configManager.getLastSeenVersion();

    if (!lastSeenVersion || lastSeenVersion !== currentVersion) {
      router.push('/?doc=whats-new');
      configManager.setLastSeenVersion(currentVersion);
    }
  }, [router]);

  // Sync URL params with view state
  useEffect(() => {
    if (docParam) {
      // If ?doc= param exists, show docs view
      setCurrentView('docs');
    }
  }, [docParam]);

  const stepId = state.currentStep?.id;
  const isTourRunning = state.status === 'running';

  useEffect(() => {
    if (selectedProject) {
      setActiveProjectId(selectedProject.id);
    } else {
      setActiveProjectId(null);
    }
  }, [selectedProject, setActiveProjectId]);

  useEffect(() => {
    const handleTourNavigateHome = () => {
      setSelectedProject(null);
    };
    window.addEventListener('tour-navigate-home', handleTourNavigateHome);
    return () => {
      window.removeEventListener('tour-navigate-home', handleTourNavigateHome);
    };
  }, []);

  // Handle navigation from markdown links (?nav=projects, etc.)
  useEffect(() => {
    const handleNavToView = (e: CustomEvent<{ view: string }>) => {
      setCurrentView(e.detail.view as typeof currentView);
      setSelectedProject(null);
    };

    window.addEventListener('nav-to-view', handleNavToView as EventListener);
    return () => {
      window.removeEventListener('nav-to-view', handleNavToView as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!isTourRunning) {
      return;
    }
    if (!stepId) {
      return;
    }

    if (
      stepId === 'welcome' ||
      stepId === 'projects-overview' ||
      stepId === 'create-project' ||
      stepId === 'project-controls' ||
      stepId === 'edit-project'
    ) {
      if (selectedProject) {
        setSelectedProject(null);
      }
      return;
    }

    if (
      stepId === 'workspace-overview' ||
      stepId === 'workspace-edit' ||
      stepId === 'workspace-checkpoint' ||
      stepId === 'provider-settings' ||
      stepId === 'wrap-up'
    ) {
      if (!selectedProject) {
        // Use the tour demo project if available, otherwise fall back to first project
        const tourProject = state.tourDemoProjectId
          ? state.projectList.find(p => p.id === state.tourDemoProjectId)
          : state.projectList[0];

        if (tourProject) {
          setSelectedProject(tourProject);
        }
      }
    }
  }, [isTourRunning, stepId, selectedProject, state.projectList, state.tourDemoProjectId]);

  const content = useMemo(() => {
    if (selectedProject) {
      return (
        <Workspace
          project={selectedProject}
          onBack={() => setSelectedProject(null)}
        />
      );
    }
    return (
      <ContentArea
        view={currentView}
        onProjectSelect={setSelectedProject}
      />
    );
  }, [selectedProject, currentView]);

  const handleStartTour = useCallback(() => {
    // Make sure we're on the projects page and no project is selected
    setSelectedProject(null);
    setCurrentView('projects');
    // Start the tour
    if (startTour) {
      startTour();
    }
  }, [startTour]);

  return (
    <>
      <PageLayout
        currentView={currentView}
        onNavigate={(view: string) => setCurrentView(view as typeof currentView)}
        onProjectSelect={setSelectedProject}
        onStartTour={handleStartTour}
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
    </>
  );
}

export function StudioApp() {
  return (
    <GuidedTourProvider>
      <React.Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]"><p className="text-zinc-400">Loading...</p></div>}>
        <StudioInner />
      </React.Suspense>
    </GuidedTourProvider>
  );
}
