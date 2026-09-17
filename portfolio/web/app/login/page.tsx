'use client';

import type { LoginRequest, SessionUser } from '@nksq/contracts';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api<SessionUser>('/auth/login', { method: 'POST', body: { username, password } satisfies LoginRequest });
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">N</span>
          <h1>NKSquared Portfolio Manager</h1>
          <p className="subtle">Sign in to see the portfolio.</p>
        </div>
        <form className="panel" onSubmit={submit}>
          <div className="panel-body">
            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}
            <div className="field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                className="input"
                autoComplete="username"
                autoCapitalize="none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
