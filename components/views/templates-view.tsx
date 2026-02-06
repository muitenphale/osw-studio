'use client';

import { TemplateManager } from '@/components/template-manager';
import { useRouter } from 'next/navigation';

interface TemplatesViewProps {
  onProjectSelect?: (project: { id: string }) => void;
  onNavigate?: (view: string) => void;
}

export function TemplatesView({ onProjectSelect, onNavigate }: TemplatesViewProps) {
  const router = useRouter();

  const handleProjectCreated = (projectId: string, isSiteTemplate: boolean) => {
    if (isSiteTemplate && onNavigate) {
      // Site templates — navigate to the Sites view
      onNavigate('sites');
    } else if (onProjectSelect) {
      onProjectSelect({ id: projectId });
    } else {
      router.push(`/workspace/${projectId}`);
    }
  };

  return <TemplateManager onProjectCreated={handleProjectCreated} />;
}
