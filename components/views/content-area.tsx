'use client';

import React from 'react';
import { Project } from '@/lib/vfs/types';
import { ProjectsView } from './projects-view';
import { TemplatesView } from './templates-view';
import { SkillsView } from './skills-view';
import { SitesView } from './sites-view';
import { SettingsView } from './settings-view';
import { DocsView } from './docs-view';
import { DashboardView } from './dashboard-view';

interface ContentAreaProps {
  view: string;
  onProjectSelect: (project: Project) => void;
  settingsTab?: 'model' | 'application';
  onNavigate?: (view: string) => void;
  onStartTour?: () => void;
}

export function ContentArea({
  view,
  onProjectSelect,
  settingsTab,
  onNavigate,
  onStartTour,
}: ContentAreaProps) {
  // Handler to select a project by ID (for dashboard recent projects click)
  const handleProjectSelectById = async (projectId: string) => {
    const { vfs } = await import('@/lib/vfs');
    await vfs.init();
    const project = await vfs.getProject(projectId);
    if (project) {
      onProjectSelect(project);
    }
  };

  switch (view) {
    case 'dashboard':
      return (
        <DashboardView
          onNavigate={onNavigate}
          onProjectSelect={handleProjectSelectById}
          onStartTour={onStartTour}
        />
      );
    case 'projects':
      return <ProjectsView onProjectSelect={onProjectSelect} />;
    case 'sites':
      return <SitesView onProjectSelect={onProjectSelect} />;
    case 'templates':
      return <TemplatesView onNavigate={onNavigate} />;
    case 'skills':
      return <SkillsView />;
    case 'docs':
      return <DocsView />;
    case 'settings':
      return <SettingsView tab={settingsTab} />;
    default:
      return <ProjectsView onProjectSelect={onProjectSelect} />;
  }
}
