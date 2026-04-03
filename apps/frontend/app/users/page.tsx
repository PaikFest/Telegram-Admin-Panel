'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
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

  useEffect(() => {
    if (loading) return;

    let active = true;
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
      <h2>Users</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          placeholder="Search by username or telegramId"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {error && <p className="error">{error}</p>}

      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Telegram ID</th>
            <th>Username</th>
            <th>Name</th>
            <th>Language</th>
            <th>Blocked</th>
            <th>Last Seen</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.id}</td>
              <td>{user.telegramId}</td>
              <td>{user.username || '-'}</td>
              <td>{`${user.firstName || ''} ${user.lastName || ''}`.trim() || '-'}</td>
              <td>{user.languageCode || '-'}</td>
              <td>{user.isBlocked ? 'yes' : 'no'}</td>
              <td>{formatDate(user.lastSeenAt)}</td>
              <td>{formatDate(user.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}