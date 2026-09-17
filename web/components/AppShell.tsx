'use client';

import type { SessionUser } from '@nksq/contracts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';

const COMING_NEXT = ['Closings', 'Capital events', 'Performance', 'Documents'];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<SessionUser>('/auth/me').then(setUser).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

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
            <Link href="/carry" className={pathname.startsWith('/carry') ? 'active' : undefined}>
              Carry
            </Link>
            {COMING_NEXT.map((label) => (
              <span key={label} className="soon" title="Coming in a later release">
                {label}
                <small>SOON</small>
              </span>
            ))}
          </nav>
          <div className="user-menu" ref={menuRef}>
            <button type="button" className="user-trigger" onClick={() => setMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={menuOpen}>
              {user && <span className="who">{user.displayName}</span>}
              <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
                <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {menuOpen && (
              <div className="user-dropdown" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="user-dropdown-item"
                  onClick={() => {
                    setMenuOpen(false);
                    void signOut();
                  }}
                  disabled={signingOut}
                >
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
