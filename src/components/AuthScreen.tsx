import { useState } from 'react';
import { isGoogleEnabled, signInEmail, signInGoogle, signInMagicLink, signUpEmail } from '../lib/supabase';

export default function AuthScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'magic'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!email.trim()) { setErr('Enter your email address.'); return; }
    if (mode !== 'magic' && password.length < 6) { setErr('Password needs at least 6 characters.'); return; }
    setBusy(true); setErr(''); setMsg('');
    try {
      if (mode === 'signin') await signInEmail(email.trim(), password);
      else if (mode === 'signup') await signUpEmail(email.trim(), password);
      else { await signInMagicLink(email.trim()); setMsg('Check your email for a sign-in link.'); return; }
      onSignedIn();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Sign-in failed.'); }
    finally { setBusy(false); }
  }

  // Rendered only when the server reports sign-in configured (App checks
  // the runtime auth config first); in local dev mode this never mounts.
  return (
    <div className="content">
      <div className="card" style={{ marginTop: 24 }}>
        <h2 style={{ marginTop: 0 }}>Welcome to Basecamp</h2>
        <p className="muted">Sign in to see your camps, or create an account — your first sign-in sets up your hunter profile.</p>
        <div className="row-wrap" style={{ marginBottom: 8 }}>
          <button className={`chip ${mode === 'signin' ? 'on' : ''}`} onClick={() => setMode('signin')}>Sign in</button>
          <button className={`chip ${mode === 'signup' ? 'on' : ''}`} onClick={() => setMode('signup')}>Create account</button>
          <button className={`chip ${mode === 'magic' ? 'on' : ''}`} onClick={() => setMode('magic')}>Email link</button>
        </div>
        <label htmlFor="auth-email">Email</label>
        <input id="auth-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
        {mode !== 'magic' && (
          <>
            <label htmlFor="auth-password">Password</label>
            <input id="auth-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} onKeyDown={e => { if (e.key === 'Enter') go(); }} />
          </>
        )}
        {err && <p className="err">{err}</p>}
        {msg && <p className="okmsg">{msg}</p>}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary grow" disabled={busy} onClick={go}>
            {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send sign-in link'}
          </button>
        </div>
        {isGoogleEnabled() && (
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn grow" disabled={busy} onClick={async () => { setBusy(true); try { await signInGoogle(); } catch (e) { setErr(e instanceof Error ? e.message : 'Google sign-in failed.'); } finally { setBusy(false); } }}>
              Continue with Google
            </button>
          </div>
        )}
        <p className="small" style={{ marginTop: 12 }}>Your camps, licenses, gear and settings stay private to your account. Email and phone are private by default.</p>
      </div>
    </div>
  );
}
