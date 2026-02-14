export const CODEX_COOKIE_NAME = 'osw_codex_rt';
export const CODEX_COOKIE_MAX_AGE = 90 * 24 * 60 * 60; // 90 days

export function codexCookieOptions(maxAge = CODEX_COOKIE_MAX_AGE) {
  return {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES !== 'false' && process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge,
    path: '/',
  };
}
