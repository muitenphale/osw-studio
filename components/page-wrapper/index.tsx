'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Project } from '@/lib/vfs/types';
import { PageLayout } from '@/components/page-layout';
import { ContentArea } from '@/components/views/content-area';
import { Workspace } from '@/components/workspace';
import { GuidedTourProvider } from '@/components/guided-tour/context';
import { GuidedTourOverlay } from '@/components/guided-tour/overlay';
import { AboutModal } from '@/components/about-modal';

type View = 'dashboard' | 'projects' | 'templates' | 'skills' | 'deployments' | 'docs' | 'settings';

interface PageWrapperProps {
  view: View;
  settingsTab?: 'model' | 'application';
}

const VIEW_ROUTES: Record<string, string> = {
  dashboard: '/admin',
  projects: '/admin/projects',
  templates: '/admin/templates',
  skills: '/admin/skills',
  deployments: '/admin/deployments',
  docs: '/admin/docs',
  settings: '/admin/settings',
};

function PageWrapperInner({ view, settingsTab }: PageWrapperProps) {
  const router = useRouter();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showAboutModal, setShowAboutModal] = useState(false);

  const handleNavigate = useCallback((targetView: string) => {
    const route = VIEW_ROUTES[targetView] || `/admin/${targetView}`;
    router.push(route);
  }, [router]);

  const content = selectedProject ? (
    <Workspace
      project={selectedProject}
      onBack={() => setSelectedProject(null)}
    />
  ) : (
    <ContentArea
      view={view}
      onProjectSelect={setSelectedProject}
      settingsTab={settingsTab}
      onNavigate={handleNavigate}
    />
  );

  return (
    <>
      <PageLayout
        currentView={view}
        onNavigate={handleNavigate}
        onProjectSelect={setSelectedProject}
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

export function PageWrapper({ view, settingsTab }: PageWrapperProps) {
  return (
    <GuidedTourProvider>
      <PageWrapperInner view={view} settingsTab={settingsTab} />
    </GuidedTourProvider>
  );
}
