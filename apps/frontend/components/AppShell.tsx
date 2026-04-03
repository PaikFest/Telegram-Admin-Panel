'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useState } from 'react';
import { apiFetch } from '../lib/api';

const links = [
  { href: '/inbox', label: 'Inbox', icon: 'inbox' },
  { href: '/users', label: 'Users', icon: 'users' },
  { href: '/broadcasts', label: 'Broadcasts', icon: 'broadcasts' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
  { href: '/logs', label: 'Logs', icon: 'logs' },
] as const;

type IconName =
  | (typeof links)[number]['icon']
  | 'logout'
  | 'search'
  | 'shield'
  | 'paperclip'
  | 'close';

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const size = 18;
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    className,
    'aria-hidden': true,
  };

  switch (name) {
    case 'inbox':
      return (
        <svg {...props}>
          <path d="M4 12.5L6.3 6.6A2 2 0 0 1 8.16 5.3h7.68a2 2 0 0 1 1.86 1.3L20 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 12.5V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3.5h4.1a2 2 0 0 0 1.7.95h4.4a2 2 0 0 0 1.7-.95H20Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'users':
      return (
        <svg {...props}>
          <path d="M15.5 19.3v-1a3.5 3.5 0 0 0-3.5-3.5h-5a3.5 3.5 0 0 0-3.5 3.5v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="9.5" cy="8.6" r="3.2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M20 19.3v-1.2a3 3 0 0 0-2.3-2.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M17.6 5.8a3 3 0 0 1 0 5.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'broadcasts':
      return (
        <svg {...props}>
          <path d="M21 3L11.7 12.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M21 3l-6.5 18-2.8-8.7L3 9.5 21 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...props}>
          <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" stroke="currentColor" strokeWidth="1.9" />
          <path d="M12 3.5v2M12 18.5v2M4.5 12h2M17.5 12h2M6.7 6.7l1.4 1.4M15.9 15.9l1.4 1.4M17.3 6.7l-1.4 1.4M8.1 15.9l-1.4 1.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      );
    case 'logs':
      return (
        <svg {...props}>
          <path d="M7 4.8h8.3l3 3V19a1.7 1.7 0 0 1-1.7 1.7H7A1.7 1.7 0 0 1 5.3 19V6.5A1.7 1.7 0 0 1 7 4.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M15.3 4.8V8h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M8.4 12h7.2M8.4 15.2h7.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'logout':
      return (
        <svg {...props}>
          <path d="M9 5H6.7A1.7 1.7 0 0 0 5 6.7v10.6A1.7 1.7 0 0 0 6.7 19H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M14 16l4-4-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M18 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'search':
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="6.8" stroke="currentColor" strokeWidth="1.8" />
          <path d="M19 19l-3.6-3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...props}>
          <path d="M12 3.7 5.8 6.1v5.5c0 4.2 2.7 7.2 6.2 8.7 3.5-1.5 6.2-4.5 6.2-8.7V6.1L12 3.7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case 'paperclip':
      return (
        <svg {...props}>
          <path d="M9.2 12.4 14.9 6.7a3.2 3.2 0 0 1 4.5 4.5l-7.8 7.8a5.1 5.1 0 0 1-7.2-7.2l8.1-8.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'close':
      return (
        <svg {...props}>
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

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
        <div className="brand">
          <div>
            <div className="brand-title">Telegram Bot Admin Panel</div>
          </div>
        </div>
        <nav className="nav-list">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`nav-item ${pathname === link.href ? 'active' : ''}`}
            >
              <Icon name={link.icon} className="nav-icon" />
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="spacer" />
        <button className="logout-button" onClick={logout} disabled={loggingOut}>
          <Icon name="logout" />
          {loggingOut ? 'Logout...' : 'Logout'}
        </button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
