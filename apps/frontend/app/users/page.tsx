'use client';

import { useEffect, useState } from 'react';
import { AppShell, Icon } from '../../components/AppShell';
import { apiFetch, formatDate } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';

type UserItem = {
  id: number;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  isBlocked: boolean;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
};

export default function UsersPage() {
  const { loading } = useAuth();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (loading) return;

    let active = true;
    setFetching(true);

    const run = async () => {
      try {
        const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
        const data = await apiFetch<UserItem[]>(`/api/users${query}`);
        if (active) {
          setUsers(data);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load users');
        }
      } finally {
        if (active) {
          setFetching(false);
        }
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [loading, search]);

  if (loading) {
    return <div className="auth-wrap">Loading...</div>;
  }

  return (
    <AppShell>
      <div className="workspace">
        <header className="page-head">
          <div>
            <h1 className="page-title">Users</h1>
            <p className="page-subtitle">Manage Telegram bot users</p>
          </div>
          <div className="meta-note">Total: {users.length} users</div>
        </header>

        <section className="panel panel-body">
          <div className="search-wrap">
            <Icon name="search" />
            <input
              placeholder="Search by name, username, or Telegram ID..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </section>

        {error ? (
          <div className="toast error" style={{ position: 'relative', right: 'unset', bottom: 'unset' }}>
            {error}
          </div>
        ) : null}

        <section className="panel table-shell">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Telegram ID</th>
                <th>Username</th>
                <th>Name</th>
                <th>Language</th>
                <th>Status</th>
                <th>Last Seen</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {fetching ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={`skeleton-${idx}`}>
                    {Array.from({ length: 8 }).map((__, colIdx) => (
                      <td key={`skeleton-${idx}-${colIdx}`}>
                        <div className="skeleton-line" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">No users found for this query.</div>
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.id}</td>
                    <td className="mono">{user.telegramId}</td>
                    <td>{user.username ? `@${user.username.replace(/^@/, '')}` : '—'}</td>
                    <td>{`${user.firstName || ''} ${user.lastName || ''}`.trim() || '—'}</td>
                    <td>
                      <span className="badge badge-muted">{(user.languageCode || '—').toUpperCase()}</span>
                    </td>
                    <td>
                      {user.isBlocked ? (
                        <span className="badge badge-danger">Blocked</span>
                      ) : (
                        <span className="badge badge-success">Active</span>
                      )}
                    </td>
                    <td>{formatDate(user.lastSeenAt)}</td>
                    <td>{formatDate(user.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
    </AppShell>
  );
}
