'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSetup, setIsSetup] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetch('/api/auth/setup-status')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.needsSetup) setIsSetup(true);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, displayName: displayName || undefined }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Registration failed');
        return;
      }

      // Registration successful - redirect to workspace or admin area
      if (data.defaultWorkspaceId) {
        document.cookie = `osw_workspace=${data.defaultWorkspaceId};path=/;max-age=${60 * 60 * 24 * 365}`;
        if (data.defaultWorkspaceName) localStorage.setItem('osw-workspace-name', data.defaultWorkspaceName);
        router.push(`/w/${data.defaultWorkspaceId}/projects`);
      } else {
        router.push('/admin');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      // Error details intentionally not logged to client console
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4 animate-fadeIn">
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.6s ease-in;
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
      `}</style>

      <div className="max-w-md w-full text-center">
        {/* Logo */}
        <div className="mb-8 animate-float">
          <svg
            className="w-24 h-24 mx-auto"
            version="1.0"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 256 256"
            preserveAspectRatio="xMidYMid meet"
          >
            <rect x="0" y="0" width="256" height="256" rx="20" ry="20" fill="#000000"/>
            <g transform="translate(0,256) scale(0.0476,-0.0476)" fill="#ffffff" stroke="none">
              <path d="M725 4825 c-50 -18 -100 -71 -114 -122 -15 -54 -15 -1573 0 -1628 16 -55 44 -92 89 -115 38 -19 62 -20 855 -20 781 0 817 1 853 19 46 23 67 46 87 94 13 32 15 138 15 830 0 566 -3 804 -11 828 -16 45 -55 87 -104 110 -38 18 -82 19 -835 18 -659 0 -802 -2 -835 -14z m1351 -371 c15 -11 37 -33 48 -48 21 -27 21 -38 21 -520 0 -547 3 -523 -68 -566 -31 -19 -54 -20 -521 -20 -483 0 -489 0 -524 22 -20 12 -42 38 -53 62 -17 38 -19 74 -19 504 0 496 1 503 51 548 46 41 66 43 561 41 464 -2 477 -3 504 -23z"/>
              <path d="M3058 4830 c-44 -13 -87 -49 -108 -90 -19 -37 -20 -61 -20 -471 0 -428 0 -432 22 -471 13 -22 41 -51 64 -64 41 -24 41 -24 685 -24 645 0 645 0 689 -22 63 -33 80 -71 80 -183 0 -101 -15 -144 -63 -179 -28 -21 -41 -21 -695 -26 -666 -5 -667 -5 -702 -27 -109 -68 -106 -247 5 -310 40 -23 40 -23 858 -23 664 0 824 3 850 14 43 17 95 78 102 118 3 18 5 225 3 459 -3 426 -3 426 -31 462 -58 76 -15 71 -757 77 -620 5 -667 6 -692 23 -44 30 -58 74 -58 179 0 116 16 153 80 186 44 22 44 22 693 22 710 0 678 -3 731 60 80 96 41 240 -79 287 -35 14 -1612 17 -1657 3z"/>
              <path d="M702 2509 c-48 -24 -75 -57 -91 -114 -9 -29 -11 -253 -9 -840 3 -779 4 -801 23 -834 11 -19 37 -48 58 -65 39 -31 39 -31 380 -31 342 0 342 0 399 28 31 15 63 39 73 53 16 25 16 25 62 -16 77 -67 104 -71 470 -68 320 3 320 3 360 30 24 16 49 44 62 70 21 44 21 49 21 854 0 773 -1 811 -19 851 -35 76 -135 120 -215 93 -41 -13 -90 -51 -109 -84 -9 -16 -13 -187 -17 -688 -5 -654 -5 -667 -26 -694 -43 -58 -68 -69 -169 -72 -82 -3 -99 -1 -133 18 -22 12 -49 39 -61 60 -21 37 -21 45 -21 664 0 439 -3 641 -11 673 -32 123 -190 174 -285 91 -73 -64 -69 -20 -70 -743 0 -721 3 -687 -66 -737 -28 -20 -47 -23 -133 -26 -91 -3 -103 -2 -134 20 -19 13 -44 36 -55 51 -21 28 -21 38 -26 695 -4 481 -8 673 -17 687 -50 87 -152 118 -241 74z"/>
              <path d="M3047 2515 c-47 -16 -81 -46 -101 -90 -14 -28 -16 -95 -16 -463 0 -281 4 -440 11 -459 15 -40 48 -73 94 -94 38 -17 79 -19 685 -19 626 0 646 -1 678 -20 58 -35 72 -72 72 -185 0 -110 -14 -147 -67 -182 -25 -17 -73 -18 -698 -23 -672 -5 -672 -5 -708 -33 -20 -15 -44 -42 -53 -60 -21 -39 -21 -125 -1 -163 20 -38 65 -80 100 -93 19 -8 289 -11 833 -11 701 0 809 2 841 15 48 20 71 41 94 88 19 35 19 60 17 480 -3 444 -3 444 -30 479 -54 71 -23 68 -740 68 -612 0 -645 1 -685 20 -67 30 -83 66 -83 183 0 116 14 156 68 189 35 21 35 21 691 22 606 1 658 2 688 19 137 74 130 264 -12 328 -38 18 -85 19 -840 18 -652 0 -807 -2 -838 -14z"/>
            </g>
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-semibold mb-2 tracking-tight">
          {isSetup ? 'Set Up OSW Studio' : 'Create an account'}
        </h1>
        <p className="text-zinc-400 mb-8">
          {isSetup ? 'Create the admin account to get started' : 'Join OSW Studio'}
        </p>

        {/* Register Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="text-left">
            <label htmlFor="email" className="block text-sm font-medium text-zinc-400 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>

          <div className="text-left">
            <label htmlFor="displayName" className="block text-sm font-medium text-zinc-400 mb-2">
              Display name <span className="text-zinc-600">(optional)</span>
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
              placeholder="Your name"
            />
          </div>

          <div className="text-left">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="password" className="text-sm font-medium text-zinc-400">
                Password
              </label>
              <button
                type="button"
                className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
                onClick={() => {
                  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
                  let pw = '';
                  const rng = new Uint32Array(16); crypto.getRandomValues(rng);
                  for (let i = 0; i < 16; i++) pw += chars[rng[i] % chars.length];
                  setPassword(pw);
                  setShowPassword(true);
                }}
              >
                Generate
              </button>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 pr-11 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-900/20 border border-red-800 text-red-400 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        {!isSetup && (
          <p className="mt-6 text-sm text-zinc-500">
            Already have an account?{' '}
            <Link href="/admin/login" className="text-orange-400 hover:text-orange-300 transition-colors">
              Sign in
            </Link>
          </p>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-zinc-800 flex items-center justify-center gap-2 text-sm text-zinc-500">
          <span>Powered by</span>
          <svg
            className="w-5 h-5 opacity-80"
            version="1.0"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 256 256"
            preserveAspectRatio="xMidYMid meet"
          >
            <rect x="0" y="0" width="256" height="256" rx="20" ry="20" fill="#52525b"/>
            <g transform="translate(0,256) scale(0.0476,-0.0476)" fill="#ffffff" stroke="none">
              <path d="M725 4825 c-50 -18 -100 -71 -114 -122 -15 -54 -15 -1573 0 -1628 16 -55 44 -92 89 -115 38 -19 62 -20 855 -20 781 0 817 1 853 19 46 23 67 46 87 94 13 32 15 138 15 830 0 566 -3 804 -11 828 -16 45 -55 87 -104 110 -38 18 -82 19 -835 18 -659 0 -802 -2 -835 -14z m1351 -371 c15 -11 37 -33 48 -48 21 -27 21 -38 21 -520 0 -547 3 -523 -68 -566 -31 -19 -54 -20 -521 -20 -483 0 -489 0 -524 22 -20 12 -42 38 -53 62 -17 38 -19 74 -19 504 0 496 1 503 51 548 46 41 66 43 561 41 464 -2 477 -3 504 -23z"/>
              <path d="M3058 4830 c-44 -13 -87 -49 -108 -90 -19 -37 -20 -61 -20 -471 0 -428 0 -432 22 -471 13 -22 41 -51 64 -64 41 -24 41 -24 685 -24 645 0 645 0 689 -22 63 -33 80 -71 80 -183 0 -101 -15 -144 -63 -179 -28 -21 -41 -21 -695 -26 -666 -5 -667 -5 -702 -27 -109 -68 -106 -247 5 -310 40 -23 40 -23 858 -23 664 0 824 3 850 14 43 17 95 78 102 118 3 18 5 225 3 459 -3 426 -3 426 -31 462 -58 76 -15 71 -757 77 -620 5 -667 6 -692 23 -44 30 -58 74 -58 179 0 116 16 153 80 186 44 22 44 22 693 22 710 0 678 -3 731 60 80 96 41 240 -79 287 -35 14 -1612 17 -1657 3z"/>
              <path d="M702 2509 c-48 -24 -75 -57 -91 -114 -9 -29 -11 -253 -9 -840 3 -779 4 -801 23 -834 11 -19 37 -48 58 -65 39 -31 39 -31 380 -31 342 0 342 0 399 28 31 15 63 39 73 53 16 25 16 25 62 -16 77 -67 104 -71 470 -68 320 3 320 3 360 30 24 16 49 44 62 70 21 44 21 49 21 854 0 773 -1 811 -19 851 -35 76 -135 120 -215 93 -41 -13 -90 -51 -109 -84 -9 -16 -13 -187 -17 -688 -5 -654 -5 -667 -26 -694 -43 -58 -68 -69 -169 -72 -82 -3 -99 -1 -133 18 -22 12 -49 39 -61 60 -21 37 -21 45 -21 664 0 439 -3 641 -11 673 -32 123 -190 174 -285 91 -73 -64 -69 -20 -70 -743 0 -721 3 -687 -66 -737 -28 -20 -47 -23 -133 -26 -91 -3 -103 -2 -134 20 -19 13 -44 36 -55 51 -21 28 -21 38 -26 695 -4 481 -8 673 -17 687 -50 87 -152 118 -241 74z"/>
              <path d="M3047 2515 c-47 -16 -81 -46 -101 -90 -14 -28 -16 -95 -16 -463 0 -281 4 -440 11 -459 15 -40 48 -73 94 -94 38 -17 79 -19 685 -19 626 0 646 -1 678 -20 58 -35 72 -72 72 -185 0 -110 -14 -147 -67 -182 -25 -17 -73 -18 -698 -23 -672 -5 -672 -5 -708 -33 -20 -15 -44 -42 -53 -60 -21 -39 -21 -125 -1 -163 20 -38 65 -80 100 -93 19 -8 289 -11 833 -11 701 0 809 2 841 15 48 20 71 41 94 88 19 35 19 60 17 480 -3 444 -3 444 -30 479 -54 71 -23 68 -740 68 -612 0 -645 1 -685 20 -67 30 -83 66 -83 183 0 116 14 156 68 189 35 21 35 21 691 22 606 1 658 2 688 19 137 74 130 264 -12 328 -38 18 -85 19 -840 18 -652 0 -807 -2 -838 -14z"/>
            </g>
          </svg>
          <span>OSW Studio</span>
        </div>
      </div>
    </div>
  );
}
