'use client';

import React from 'react';
import { Project } from '@/lib/vfs/types';
import { ProjectsView } from './projects-view';
import { TemplatesView } from './templates-view';
import { SkillsView } from './skills-view';
import { SitesView } from './sites-view';
import { SettingsView } from './settings-view';
import { DocsView } from './docs-view';

interface ContentAreaProps {
  view: string;
  onProjectSelect: (project: Project) => void;
  settingsTab?: 'model' | 'application';
}

export function ContentArea({ view, onProjectSelect, settingsTab }: ContentAreaProps) {
  switch (view) {
    case 'projects':
      return <ProjectsView onProjectSelect={onProjectSelect} />;
    case 'sites':
      return <SitesView />;
    case 'templates':
      return <TemplatesView />;
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
