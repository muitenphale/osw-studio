'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import { PageWrapper } from '@/components/page-wrapper';

function ProjectsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const consumed = useRef(false);

  const autoCreate = !consumed.current && searchParams.get('action') === 'create';

  useEffect(() => {
    if (autoCreate && !consumed.current) {
      consumed.current = true;
      router.replace(`/w/${workspaceId}/projects`, { scroll: false });
    }
  }, [autoCreate, router, workspaceId]);

  return <PageWrapper view="projects" workspaceId={workspaceId} autoCreateProject={autoCreate} />;
}

export default function WorkspaceProjects() {
  return (
    <Suspense>
      <ProjectsPageInner />
    </Suspense>
  );
}
