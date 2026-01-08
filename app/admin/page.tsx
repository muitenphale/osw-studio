'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { configManager } from '@/lib/config/storage';
import pkg from '../../package.json';

export default function AdminPage() {
  const router = useRouter();
  const isServerMode = process.env.NEXT_PUBLIC_SERVER_MODE === 'true';

  useEffect(() => {
    const currentVersion = pkg.version;
    const lastSeenVersion = configManager.getLastSeenVersion();

    if (!lastSeenVersion || lastSeenVersion !== currentVersion) {
      // New version - show What's New first
      router.push('/admin/docs?doc=whats-new');
      configManager.setLastSeenVersion(currentVersion);
    } else {
      // Same version - go to dashboard (Server Mode) or projects (Browser Mode)
      router.push(isServerMode ? '/admin/dashboard' : '/admin/projects');
    }
  }, [router, isServerMode]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <p className="text-zinc-400">Redirecting...</p>
    </div>
  );
}
