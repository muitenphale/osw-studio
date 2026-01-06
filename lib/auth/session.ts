/**
 * Session Management for Server Mode
 *
 * Simple JWT-based session management using jose library
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SESSION_COOKIE_NAME = 'osw_session';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET environment variable not set');
  }
  return new TextEncoder().encode(secret);
}

export interface SessionData {
  userId: string;
  email: string;
  isAdmin: boolean;
  exp: number;
}

/**
 * Create a new session token
 */
export async function createSession(userId: string, email: string, isAdmin = true): Promise<string> {
  const secret = getSecretKey();
  const exp = Math.floor((Date.now() + SESSION_DURATION) / 1000);

  const token = await new SignJWT({
    userId,
    email,
    isAdmin,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(exp)
    .setIssuedAt()
    .sign(secret);

  return token;
}

/**
 * Verify and decode a session token
 */
export async function verifySession(token: string): Promise<SessionData | null> {
  try {
    const secret = getSecretKey();
    const { payload } = await jwtVerify(token, secret);

    return {
      userId: payload.userId as string,
      email: payload.email as string,
      isAdmin: payload.isAdmin as boolean,
      exp: payload.exp as number,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get current session from cookies
 */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifySession(token);
}

/**
 * Set session cookie
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES !== 'false' && process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION / 1000,
    path: '/',
  });
}

/**
 * Clear session cookie
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}

/**
 * Require authentication (throws if not authenticated)
 */
export async function requireAuth(): Promise<SessionData> {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }
  return session;
}
