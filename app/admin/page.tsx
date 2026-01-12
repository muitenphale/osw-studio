'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    // Always redirect to dashboard
    // Server mode: middleware handles auth redirect to /admin/login if not authenticated
    router.push('/admin/dashboard');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <p className="text-zinc-400">Redirecting...</p>
    </div>
  );
}
