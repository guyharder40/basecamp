import { useState } from 'react';
import { isGoogleEnabled, resetPassword, signInEmail, signInGoogle, signInMagicLink, signUpEmail } from '../lib/supabase';
import { api } from '../api';

const USERNAME_RULE = /^[A-Za-z0-9_]{3,20}$/;

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {off ? (
        <>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3.5 8 10 8a9.74 9.74 0 0 0 5.39-1.61" />
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </>
      ) : (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

export default function AuthScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'magic'>('signin');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [userNote, setUserNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function checkUsername(u: string): Promise<boolean> {
    const name = u.trim();
    if (!USERNAME_RULE.test(name)) {
      setUserNote({ ok: false, text: 'Username needs 3–20 characters: letters, numbers and underscores only.' });
      return false;
    }
    try {
      const r = await api.checkUsername(name);
      if (r.available) { setUserNote({ ok: true, text: 'That username is available.' }); return true; }
      setUserNote({ ok: false, text: r.reason ?? 'That username is taken — please pick another.' });
      return false;
    } catch { setUserNote(null); return true; } // the server has the final say at profile setup
  }

  async function go() {
    if (!email.trim()) { setErr('Enter your email address.'); return; }
    if (mode !== 'magic' && password.length < 6) { setErr('Password needs at least 6 characters.'); return; }
    if (mode === 'signup') {
      if (!firstName.trim() || !lastName.trim()) { setErr('Enter your first and last name.'); return; }
      if (!(await checkUsername(username))) { setErr('Please pick an available username.'); return; }
    }
    setBusy(true); setErr(''); setMsg('');
    try {
      if (mode === 'signin') await signInEmail(email.trim(), password);
      else if (mode === 'signup') {
        const data = await signUpEmail(email.trim(), password, { firstName: firstName.trim(), lastName: lastName.trim(), username: username.trim() });
        // When email confirmation is on, sign-up returns no session: the
        // account exists but can't sign in until the email link is clicked.
        if (!data.session) {
          setMode('signin');
          setPassword('');
          setMsg('Account created. Check your email to confirm your account, then sign in here.');
          return;
        }
      }
      else { await signInMagicLink(email.trim()); setMsg('Check your email for a sign-in link.'); return; }
      onSignedIn();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Sign-in failed.'); }
    finally { setBusy(false); }
  }

  async function forgot() {
    if (!email.trim()) { setErr('Enter your email address first, then tap Forgot password.'); return; }
    setBusy(true); setErr(''); setMsg('');
    try {
      await resetPassword(email.trim());
      setMsg('Check your email for a link to set a new password.');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send the reset email.'); }
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
        {mode === 'signup' && (
          <>
            <label htmlFor="auth-first">First name</label>
            <input id="auth-first" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" autoComplete="given-name" />
            <label htmlFor="auth-last">Last name</label>
            <input id="auth-last" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" autoComplete="family-name" />
            <label htmlFor="auth-username">Username</label>
            <input id="auth-username" value={username} onChange={e => { setUsername(e.target.value); setUserNote(null); }} onBlur={() => { if (username.trim()) checkUsername(username); }} placeholder="e.g. ridge_hunter" autoComplete="username" />
            {userNote && <p className={userNote.ok ? 'okmsg' : 'err'}>{userNote.text}</p>}
            <p className="small">Unique across Basecamp — other hunters find you by it.</p>
          </>
        )}
        <label htmlFor="auth-email">Email</label>
        <input id="auth-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
        {mode !== 'magic' && (
          <>
            <label htmlFor="auth-password">Password</label>
            <div className="pw-wrap">
              <input id="auth-password" type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} onKeyDown={e => { if (e.key === 'Enter') go(); }} />
              <button type="button" className="pw-eye" onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}>{showPw ? <EyeIcon off /> : <EyeIcon off={false} />}</button>
            </div>
          </>
        )}
        {err && <p className="err">{err}</p>}
        {msg && <p className="okmsg">{msg}</p>}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary grow" disabled={busy} onClick={go}>
            {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send sign-in link'}
          </button>
        </div>
        {mode === 'signin' && (
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn grow" disabled={busy} onClick={forgot}>Forgot password?</button>
          </div>
        )}
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
