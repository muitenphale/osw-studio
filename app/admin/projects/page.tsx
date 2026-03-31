'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageWrapper } from '@/components/page-wrapper';

function ProjectsPageInner() {
  const searchParams = useSearchParams();
  const autoCreate = searchParams.get('action') === 'create';
  return <PageWrapper view="projects" autoCreateProject={autoCreate} />;
}

export default function ProjectsPage() {
  return (
    <Suspense>
      <ProjectsPageInner />
    </Suspense>
  );
}
