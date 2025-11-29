'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StudioApp } from '@/components/studio-app';

/**
 * Root page
 *
 * Browser mode: Renders the StudioApp (single-page app)
 * Server mode: Redirects to /admin/projects (studio is at /admin/*)
 */
export default function Home() {
  const router = useRouter();
  const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';

  useEffect(() => {
    if (isServerMode) {
      router.push('/admin/projects');
    }
  }, [isServerMode, router]);

  // In Server mode, show loading while redirecting
  if (isServerMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <p className="text-zinc-400">Redirecting to admin...</p>
      </div>
    );
  }

  // Browser mode: render the studio app
  return <StudioApp />;
}
