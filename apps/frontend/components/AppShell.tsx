'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useState } from 'react';
import { apiFetch } from '../lib/api';

const links = [
  { href: '/inbox', label: 'Inbox' },
  { href: '/users', label: 'Users' },
  { href: '/broadcasts', label: 'Broadcasts' },
  { href: '/settings', label: 'Settings' },
  { href: '/logs', label: 'Logs' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await apiFetch<{ success: boolean }>('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore logout failure and continue redirect
    } finally {
      router.replace('/login');
      setLoggingOut(false);
    }
  };

  return (
    <div className="shell page">
      <aside className="sidebar">
        <div className="brand">Opener Bot Admin</div>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={pathname === link.href ? 'active' : ''}
          >
            {link.label}
          </Link>
        ))}
        <div className="spacer" />
        <button className="secondary" onClick={logout} disabled={loggingOut}>
          {loggingOut ? 'Logout...' : 'Logout'}
        </button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}