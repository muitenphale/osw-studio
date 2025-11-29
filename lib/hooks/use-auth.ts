'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function useAuth() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      // Only check auth in server mode
      if (process.env.NEXT_PUBLIC_SERVER_MODE !== 'true') {
        setIsChecking(false);
        return;
      }

      try {
        const response = await fetch('/api/auth/check');

        if (response.status === 401) {
          // Not authenticated, redirect to login
          router.push('/admin/login');
          return;
        }

        if (!response.ok) {
          throw new Error('Auth check failed');
        }

        // Authenticated
        setIsChecking(false);
      } catch (error) {
        console.error('Auth check error:', error);
        router.push('/admin/login');
      }
    };

    checkAuth();
  }, [router]);

  return { isChecking };
}
