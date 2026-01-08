'use client';

import React, { useState } from 'react';
import { Project } from '@/lib/vfs/types';
import { PageLayout } from '@/components/page-layout';
import { ContentArea } from '@/components/views/content-area';
import { Workspace } from '@/components/workspace';
import { GuidedTourProvider } from '@/components/guided-tour/context';
import { GuidedTourOverlay } from '@/components/guided-tour/overlay';
import { AboutModal } from '@/components/about-modal';

type View = 'dashboard' | 'projects' | 'templates' | 'skills' | 'sites' | 'docs' | 'settings';

interface PageWrapperProps {
  view: View;
  settingsTab?: 'model' | 'application';
}

function PageWrapperInner({ view, settingsTab }: PageWrapperProps) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showAboutModal, setShowAboutModal] = useState(false);

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
    />
  );

  return (
    <>
      <PageLayout
        currentView={view}
        onNavigate={() => {}} // Navigation handled by Next.js router
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
