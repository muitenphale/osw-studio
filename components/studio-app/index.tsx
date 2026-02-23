'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Project } from '@/lib/vfs/types';
import { Workspace } from '@/components/workspace';
import { GuidedTourProvider, useGuidedTour } from '@/components/guided-tour/context';
import { GuidedTourOverlay } from '@/components/guided-tour/overlay';
import { PageLayout } from '@/components/page-layout';
import { ContentArea } from '@/components/views/content-area';
import { AboutModal } from '@/components/about-modal';
import { oauthHandleRedirectIfPresent } from '@/lib/auth/hf-auth';
import { configManager } from '@/lib/config/storage';
import { toast } from 'sonner';
import { initTelemetry, track } from '@/lib/telemetry';
import { TelemetryDisclosure } from '@/components/telemetry-disclosure';

// Module-level guard: prevents double token exchange when React strict mode
// re-runs the effect, or if the component remounts before URL cleanup.
let oauthExchangeInFlight = false;

function StudioInner() {
  const searchParams = useSearchParams();
  const docParam = searchParams.get('doc');

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'projects' | 'deployments' | 'templates' | 'skills' | 'docs' | 'settings'>('dashboard');
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showTelemetryDisclosure, setShowTelemetryDisclosure] = useState(false);
  const { state, setActiveProjectId, start: startTour } = useGuidedTour();

  const settingsParam = searchParams.get('settings');

  // Sync URL params with view state
  useEffect(() => {
    if (docParam) {
      // If ?doc= param exists, show docs view
      setCurrentView('docs');
    } else if (settingsParam) {
      // If ?settings= param exists, show settings view
      setCurrentView('settings');
    }
  }, [docParam, settingsParam]);

  // Init telemetry + first-run disclosure
  useEffect(() => {
    initTelemetry();
    track('session_start');

    if (!localStorage.getItem('osw-telemetry-disclosed')) {
      setShowTelemetryDisclosure(true);
    }
  }, []);

  // Track pageview on view changes
  useEffect(() => {
    const path = selectedProject ? 'workspace' : currentView;
    track('pageview', { path });
  }, [currentView, selectedProject]);

  // Handle HF OAuth redirect at the app level (settings panel may not be mounted)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('code') || oauthExchangeInFlight) return;
    oauthExchangeInFlight = true;

    (async () => {
      try {
        const oauthResult = await oauthHandleRedirectIfPresent();
        if (oauthResult) {
          const username = oauthResult.userInfo?.name
            || oauthResult.userInfo?.preferred_username
            || oauthResult.userInfo?.sub;
          configManager.setHFAuth({
            access_token: oauthResult.accessToken,
            username: username || undefined,
          });
          toast.success(`Connected to HuggingFace${username ? ` as ${username}` : ''}`);
          window.dispatchEvent(new CustomEvent('apiKeyUpdated', {
            detail: { provider: 'huggingface', hasKey: true }
          }));
        }
      } catch (err) {
        console.warn('[HF OAuth] Redirect handling failed:', err);
      } finally {
        // Always clean OAuth params from URL
        const url = new URL(window.location.href);
        url.search = '';
        window.history.replaceState({}, '', url.toString());
      }
    })();
  }, []);

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

  const handleNavigate = useCallback((view: string) => {
    setCurrentView(view as typeof currentView);
  }, []);

  const handleStartTour = useCallback(() => {
    // Make sure we're on the projects page and no project is selected
    setSelectedProject(null);
    setCurrentView('projects');
    // Start the tour
    if (startTour) {
      startTour();
    }
  }, [startTour]);

  const handleDismissTelemetryDisclosure = useCallback(() => {
    localStorage.setItem('osw-telemetry-disclosed', 'true');
    setShowTelemetryDisclosure(false);
  }, []);

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
        onProjectSelect={(project) => {
          setSelectedProject(project);
        }}
        onNavigate={handleNavigate}
        onStartTour={handleStartTour}
      />
    );
  }, [selectedProject, currentView, handleNavigate, handleStartTour]);

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
      <TelemetryDisclosure
        open={showTelemetryDisclosure}
        onDismiss={handleDismissTelemetryDisclosure}
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
