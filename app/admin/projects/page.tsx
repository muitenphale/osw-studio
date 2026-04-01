'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PageWrapper } from '@/components/page-wrapper';

function ProjectsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const consumed = useRef(false);

  const autoCreate = !consumed.current && searchParams.get('action') === 'create';

  // Clear the ?action=create param after consuming it so it doesn't re-trigger
  useEffect(() => {
    if (autoCreate && !consumed.current) {
      consumed.current = true;
      router.replace('/admin/projects', { scroll: false });
    }
  }, [autoCreate, router]);

  return <PageWrapper view="projects" autoCreateProject={autoCreate} />;
}

export default function ProjectsPage() {
  return (
    <Suspense>
      <ProjectsPageInner />
    </Suspense>
  );
}
