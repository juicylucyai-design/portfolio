'use client';

import type { SessionUser } from '@nksq/contracts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';

const COMING_NEXT = ['Closings', 'Capital events', 'Performance', 'Carry', 'Documents'];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    api<SessionUser>('/auth/me').then(setUser).catch(() => undefined);
  }, []);

  async function signOut() {
    setSigningOut(true);
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.href = '/login';
  }

  const portfolioActive = pathname === '/' || pathname.startsWith('/investment');

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" aria-label="NKSquared Portfolio Manager home">
            <span className="brand-mark" aria-hidden="true">N</span>
            <span className="brand-name">
              NKSquared <span>Portfolio Manager</span>
            </span>
          </Link>
          <nav className="nav" aria-label="Main">
            <Link href="/" className={portfolioActive ? 'active' : undefined}>
              Portfolio
            </Link>
            {COMING_NEXT.map((label) => (
              <span key={label} className="soon" title="Coming in a later release">
                {label}
                <small>SOON</small>
              </span>
            ))}
          </nav>
          <div className="user">
            {user && <span className="who">{user.displayName}</span>}
            <button type="button" className="btn btn-small" onClick={signOut} disabled={signingOut}>
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
