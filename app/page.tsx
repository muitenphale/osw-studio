'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StudioApp } from '@/components/studio-app';

/**
 * Root page
 *
 * Browser mode: Renders the StudioApp (single-page app)
 * Server mode (desktop): Bootstraps workspace, sets cookie, redirects
 * Server mode (web): Redirects to /admin/projects (middleware handles workspace routing)
 */
export default function Home() {
  const router = useRouter();
  const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';
  const isDesktop = process.env.NEXT_PUBLIC_DESKTOP === 'true';

  useEffect(() => {
    if (!isServerMode) return;

    if (isDesktop) {
      const existingWorkspace = document.cookie
        .split('; ')
        .find(c => c.startsWith('osw_workspace='))
        ?.split('=')[1];

      if (existingWorkspace) {
        router.push(`/w/${existingWorkspace}/projects`);
        return;
      }

      fetch('/api/auth/desktop-init', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data.workspaceId) {
            document.cookie = `osw_workspace=${data.workspaceId}; path=/; max-age=${365 * 24 * 60 * 60}`;
            router.push(`/w/${data.workspaceId}/projects`);
          }
        })
        .catch(() => {});
    } else {
      router.push('/admin/projects');
    }
  }, [isServerMode, isDesktop, router]);

  if (isServerMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  return <StudioApp />;
}
