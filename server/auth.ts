// Auth — Supabase Auth when configured, single-user local mode otherwise.
//
// Design:
// - Server: if SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, the server
//   verifies the caller's Supabase JWT (Authorization: Bearer <token>) with
//   the Supabase Auth admin API and exposes req.authUser = { id, email }.
//   Without those env vars the app runs in local dev mode: one local user
//   ("local-user") tied to the seeded profile, exactly like the original
//   standalone package. The app must build and smoke-test with no secrets.
// - Client: the browser fetches GET /api/auth/config at runtime (see
//   src/lib/supabase.ts) and lazily creates its @supabase/supabase-js
//   client from the server's public values. The client build needs NO
//   VITE_SUPABASE_* vars — Vite used to fold those to constants and
//   tree-shake the sign-in UI out of a plain build. Email/password AND
//   magic-link sign-in; Google OAuth is optional (enable it in the
//   Supabase dashboard; the client offers the button only when
//   SUPABASE_GOOGLE_ENABLED=1 on the server).
// - Authorship everywhere ties to the account id (auth.users id). The
//   profile row carries ownerUserId; the seeded data uses the placeholder
//   owner id "seed-owner" until claimed (see scripts/claim-seed.ts).
// - Private data (licenses, gear, settings) is per-account and gated
//   server-side; email/phone visibility (public / friends-only / private,
//   default private) is enforced when another account reads a profile.

import type { Request, Response, NextFunction } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface AuthUser { id: string; email?: string; }
export type AuthedRequest = Request & { authUser?: AuthUser | null };

export const SEED_OWNER_ID = 'seed-owner';
export const LOCAL_USER_ID = 'local-user';

let adminClient: SupabaseClient | null = null;
export function supabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!adminClient) adminClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return adminClient;
}

export function authConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Runtime auth config served to the browser (GET /api/auth/config).
 *  The anon key is public by design, so serving it is safe; the
 *  service-role key is NEVER included. `configured` is true only when
 *  the server can both hand the client its public values AND verify
 *  tokens (URL + anon key + service-role key all set). */
export function authConfig(): { configured: boolean; supabaseUrl?: string; anonKey?: string; googleEnabled: boolean } {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const googleEnabled = process.env.SUPABASE_GOOGLE_ENABLED === '1' || process.env.VITE_SUPABASE_GOOGLE_ENABLED === '1';
  const configured = !!(url && anonKey && process.env.SUPABASE_SERVICE_ROLE_KEY);
  return configured
    ? { configured: true, supabaseUrl: url, anonKey, googleEnabled }
    : { configured: false, googleEnabled };
}

const VERIFY_TIMEOUT_MS = 5000;

/** Verify a Bearer JWT against Supabase Auth. Returns null when unverifiable.
 *  Fails fast: supabase-js getUser() takes no AbortSignal in this version,
 *  so the call is raced against a 5s timeout instead of hanging while the
 *  Supabase host is unreachable. */
export async function verifyToken(token: string): Promise<AuthUser | null> {
  const admin = supabaseAdmin();
  if (!admin) return null;
  try {
    const { data, error } = await Promise.race([
      admin.auth.getUser(token),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('Token verification timed out')), VERIFY_TIMEOUT_MS)),
    ]);
    if (error || !data?.user) {
      // Logged (no token contents) so a failing save leaves a trace in the
      // runtime logs instead of silently bouncing the user back to setup.
      console.error('Token verification failed:', error?.message ?? 'no user for token');
      return null;
    }
    return { id: data.user.id, email: data.user.email ?? undefined };
  } catch (e) { console.error('Token verification failed:', e instanceof Error ? e.message : 'unknown error'); return null; }
}

/** Express middleware: attaches req.authUser when a valid token is present.
 *  In local dev mode (no Supabase configured) it attaches the local user. */
export async function authMiddleware(req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> {
  if (!authConfigured()) {
    req.authUser = { id: LOCAL_USER_ID, email: undefined };
    next();
    return;
  }
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) { req.authUser = null; next(); return; }
  req.authUser = await verifyToken(token);
  next();
}

/** The account id that "owns" data created in this request. */
export function requestUserId(req: AuthedRequest): string {
  if (req.authUser?.id) return req.authUser.id;
  // Auth is configured but no/invalid token: treat as anonymous — write
  // routes that need ownership will reject; read routes stay public-safe.
  return '';
}

/** Require a signed-in account (Supabase mode) or the local user (dev mode). */
export function requireAuth(req: AuthedRequest, res: Response): AuthUser | null {
  if (!authConfigured()) return { id: LOCAL_USER_ID };
  if (!req.authUser) {
    console.error('requireAuth rejected:', req.method, req.path, '— no valid session (check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)');
    res.status(401).json({ error: 'Sign in to continue.' });
    return null;
  }
  return req.authUser;
}

/** Is this account the owner of a record whose owner id is stored? */
export function isOwner(recordOwnerId: string | null | undefined, userId: string): boolean {
  if (!recordOwnerId) return false;
  if (recordOwnerId === SEED_OWNER_ID && userId === LOCAL_USER_ID) return true; // dev mode owns the seed
  return recordOwnerId === userId;
}

/** Do two stored account ids refer to the same hunter? (Same seed-owner /
 *  local-user equivalence as isOwner, for memberships and authorship.) */
export function sameAccount(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return (a === SEED_OWNER_ID && b === LOCAL_USER_ID) || (a === LOCAL_USER_ID && b === SEED_OWNER_ID);
}

/** Gate an email/phone value by its visibility rule, from the viewer's side. */
export function visibleContact(
  value: string, visibility: string, viewerId: string, ownerId: string, viewerIsFriend: boolean,
): string {
  if (!value) return '';
  if (viewerId && viewerId === ownerId) return value;
  if (visibility === 'public') return value;
  if (visibility === 'friends' && viewerIsFriend) return value;
  return '';
}
