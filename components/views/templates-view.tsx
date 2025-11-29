'use client';

import { TemplateManager } from '@/components/template-manager';
import { useRouter } from 'next/navigation';

interface TemplatesViewProps {
  onProjectSelect?: (project: { id: string }) => void;
}

export function TemplatesView({ onProjectSelect }: TemplatesViewProps) {
  const router = useRouter();

  const handleProjectCreated = (projectId: string) => {
    if (onProjectSelect) {
      onProjectSelect({ id: projectId });
    } else {
      router.push(`/workspace/${projectId}`);
    }
  };

  return <TemplateManager onProjectCreated={handleProjectCreated} />;
}
