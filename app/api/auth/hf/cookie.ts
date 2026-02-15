export const HF_COOKIE_NAME = 'osw_hf_token';
export const HF_COOKIE_MAX_AGE = 8 * 60 * 60; // 8 hours (HF OAuth token default expiry)

export function hfCookieOptions(maxAge = HF_COOKIE_MAX_AGE) {
  return {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES !== 'false' && process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge,
    path: '/',
  };
}
