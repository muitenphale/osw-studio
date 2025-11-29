'use client';

import React from 'react';
import { Project } from '@/lib/vfs/types';
import { ProjectManager } from '@/components/project-manager';

interface ProjectsViewProps {
  onProjectSelect: (project: Project) => void;
}

export function ProjectsView({ onProjectSelect }: ProjectsViewProps) {
  // Use ProjectManager but hide its header and footer since PageLayout provides them
  return (
    <ProjectManager
      onProjectSelect={onProjectSelect}
      hideHeader={true}
      hideFooter={true}
    />
  );
}
