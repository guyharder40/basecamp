// Supabase Auth client (browser) — RUNTIME config, not build-time.
//
// The client NEVER reads import.meta.env.VITE_SUPABASE_* any more: Vite
// folds those to constants at build time, so a plain `npm run build`
// without them set tree-shook the whole sign-in UI out of the bundle.
// Instead the client fetches GET /api/auth/config on startup; the server
// serves the public values (anon key is public by design) from its own
// env vars. The Supabase client is created lazily via dynamic import, so
// @supabase/supabase-js is always present in the built output.
// Without Supabase configured on the server the app runs in local dev
// mode with the seeded profile — no sign-in screen.
// The service-role key is NEVER used here — only the anon key.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuthConfig {
  configured: boolean;
  supabaseUrl?: string;
  anonKey?: string;
  googleEnabled: boolean;
  /** True when /api/auth/config could not be reached at all. */
  unreachable?: boolean;
}

let config: AuthConfig | null = null;
let configPromise: Promise<AuthConfig> | null = null;
let client: SupabaseClient | null = null;
let clientPromise: Promise<SupabaseClient | null> | null = null;

/** Fetch the runtime auth config from the server (cached; 5s timeout).
 *  On failure returns { configured: false, unreachable: true } instead of
 *  throwing, so callers can show a clear message rather than silently
 *  falling back to local mode. */
export async function loadAuthConfig(): Promise<AuthConfig> {
  if (config) return config;
  if (!configPromise) {
    configPromise = (async (): Promise<AuthConfig> => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        try {
          const res = await fetch('/api/auth/config', { signal: ctrl.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const j = await res.json();
          config = {
            configured: !!j.configured,
            supabaseUrl: j.supabaseUrl || undefined,
            anonKey: j.anonKey || undefined,
            googleEnabled: !!j.googleEnabled,
          };
        } finally { clearTimeout(t); }
      } catch {
        // Server unreachable (or the endpoint errored): do NOT silently
        // pretend this is local dev mode — flag it for the UI.
        config = { configured: false, googleEnabled: false, unreachable: true };
      }
      return config;
    })();
  }
  return configPromise;
}

/** Last loaded runtime config, or null before loadAuthConfig() resolves. */
export function getAuthConfig(): AuthConfig | null { return config; }

/** Google button visibility from the loaded runtime config. */
export function isGoogleEnabled(): boolean { return !!config?.googleEnabled; }

/** Lazily create the Supabase client from the runtime config.
 *  Returns null in local dev mode (or when the config is unreachable). */
export async function getSupabase(): Promise<SupabaseClient | null> {
  const cfg = await loadAuthConfig();
  if (!cfg.configured || !cfg.supabaseUrl || !cfg.anonKey) return null;
  if (client) return client;
  if (!clientPromise) {
    clientPromise = (async () => {
      const { createClient } = await import('@supabase/supabase-js');
      client = createClient(cfg.supabaseUrl!, cfg.anonKey!, { auth: { persistSession: true, autoRefreshToken: true } });
      return client;
    })();
  }
  return clientPromise;
}

/** Race a promise against a timeout so a stuck auth call can't freeze the
 *  UI forever (it settles one way or the other by `ms`). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('sign-in check timed out')), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** The session supabase-js persists in localStorage, or null.
 *  Stored as JSON under `sb-<project-ref>-auth-token` with
 *  `access_token` and `expires_at` (Unix seconds). Reading it directly
 *  needs no lock and no network. */
function storedSession(): { access_token?: string; expires_at?: number } | null {
  try {
    if (!config?.supabaseUrl) return null;
    const ref = new URL(config.supabaseUrl).hostname.split('.')[0];
    const raw = localStorage.getItem(`sb-${ref}-auth-token`);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object') return null;
    return s as { access_token?: string; expires_at?: number };
  } catch { return null; }
}

/** A stored token that is still valid (30s margin), or null. */
function storedAccessToken(): string | null {
  const s = storedSession();
  if (!s?.access_token || typeof s.expires_at !== 'number') return null;
  if (s.expires_at * 1000 <= Date.now() + 30_000) return null; // expired / about to expire
  return s.access_token;
}

/** Current session access token, for Authorization headers.
 *
 *  Fast path first: a still-valid token stored in localStorage is used
 *  directly — no auth lock, no network. getSession() acquires the
 *  library's auth lock and can stall forever if another tab holds it or
 *  a background token refresh hangs; with no timeout and no catch that
 *  left every API call (including Save profile) waiting with no request
 *  sent and no error shown. The getSession() fallback below is raced
 *  against a 10s timeout for the same reason. */
export async function accessToken(): Promise<string | null> {
  await loadAuthConfig();
  const stored = storedAccessToken();
  if (stored) return stored;
  const c = await getSupabase();
  if (!c) return null;
  try {
    const { data } = await withTimeout(c.auth.getSession(), 10_000);
    return data.session?.access_token ?? null;
  } catch { return null; }
}

export async function getSession() {
  await loadAuthConfig();
  const stored = storedSession();
  if (stored?.access_token && typeof stored.expires_at === 'number' && stored.expires_at * 1000 > Date.now() + 30_000) return stored;
  const c = await getSupabase();
  if (!c) return null;
  try {
    const { data } = await withTimeout(c.auth.getSession(), 10_000);
    return data.session;
  } catch { return null; }
}

/** Subscribe to auth-state changes. Returns an unsubscribe function. */
export async function subscribeAuth(cb: (signedIn: boolean) => void): Promise<() => void> {
  const c = await getSupabase();
  if (!c) return () => {};
  const { data: sub } = c.auth.onAuthStateChange((_e, session) => cb(!!session));
  return () => sub.subscription.unsubscribe();
}

async function requireClient(): Promise<SupabaseClient> {
  const c = await getSupabase();
  if (!c) throw new Error('Sign-in is not configured on this server.');
  return c;
}

export async function signInEmail(email: string, password: string) {
  const c = await requireClient();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
export async function signUpEmail(email: string, password: string) {
  const c = await requireClient();
  const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
  if (error) throw error;
  return data;
}
export async function signInMagicLink(email: string) {
  const c = await requireClient();
  const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
  if (error) throw error;
}
export async function resetPassword(email: string) {
  const c = await requireClient();
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if (error) throw error;
}
export async function signInGoogle() {
  const c = await requireClient();
  const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  if (error) throw error;
}
export async function signOut() {
  const c = await getSupabase();
  if (c) await c.auth.signOut();
}
