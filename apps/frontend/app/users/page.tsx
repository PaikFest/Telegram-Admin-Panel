'use client';

import { FormEvent, useEffect, useState } from 'react';
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

type CreateUserPayload = {
  telegramId?: string;
  username?: string;
};

export default function UsersPage() {
  const { loading } = useAuth();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [telegramIdInput, setTelegramIdInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);

  const loadUsers = async (queryText: string) => {
    const query = queryText.trim() ? `?search=${encodeURIComponent(queryText.trim())}` : '';
    return apiFetch<UserItem[]>(`/api/users${query}`);
  };

  useEffect(() => {
    if (loading) return;

    let active = true;
    setFetching(true);

    const run = async () => {
      try {
        const data = await loadUsers(search);
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

  const resetModal = () => {
    setTelegramIdInput('');
    setUsernameInput('');
    setCreateError(null);
    setCreatingUser(false);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetModal();
  };

  const openModal = () => {
    setIsModalOpen(true);
    setCreateError(null);
  };

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError(null);
    setSuccess(null);

    const payload: CreateUserPayload = {};
    const trimmedId = telegramIdInput.trim();
    const trimmedUsername = usernameInput.trim();
    if (trimmedId) payload.telegramId = trimmedId;
    if (trimmedUsername) payload.username = trimmedUsername;

    if (!payload.telegramId && !payload.username) {
      setCreateError('Provide Telegram ID or Username.');
      return;
    }

    setCreatingUser(true);
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await loadUsers(search);
      setUsers(data);
      setSuccess('User added successfully');
      closeModal();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to add user');
    } finally {
      setCreatingUser(false);
    }
  };

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
          <div className="button-row">
            <div className="meta-note">Total: {users.length} users</div>
            <button className="button-primary" onClick={openModal}>
              Add User
            </button>
          </div>
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

      {isModalOpen ? (
        <div className="modal-backdrop">
          <div className="panel panel-body modal-card">
            <h3 className="modal-title">Add User</h3>
            <p className="modal-subtitle">
              Add by Telegram ID or Username. Username-only flow resolves ID through Telegram.
            </p>

            <form onSubmit={createUser} style={{ marginTop: 14 }}>
              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <label className="field-label" htmlFor="manual-telegram-id">
                    Telegram ID
                  </label>
                  <input
                    id="manual-telegram-id"
                    placeholder="e.g. 456789123"
                    value={telegramIdInput}
                    onChange={(event) => setTelegramIdInput(event.target.value)}
                  />
                  <div className="field-help">Recommended for guaranteed delivery.</div>
                </div>

                <div>
                  <label className="field-label" htmlFor="manual-username">
                    Username
                  </label>
                  <input
                    id="manual-username"
                    placeholder="@username"
                    value={usernameInput}
                    onChange={(event) => setUsernameInput(event.target.value)}
                  />
                  <div className="field-help">
                    Optional alternative. If Telegram ID is empty, we will try to resolve this username.
                  </div>
                </div>
              </div>

              {createError ? (
                <div
                  className="toast error"
                  style={{ marginTop: 12, position: 'relative', right: 'unset', bottom: 'unset' }}
                >
                  {createError}
                </div>
              ) : null}

              <div className="button-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="button-secondary" type="button" onClick={closeModal} disabled={creatingUser}>
                  Cancel
                </button>
                <button className="button-primary" type="submit" disabled={creatingUser}>
                  {creatingUser ? 'Adding...' : 'Add User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {success ? (
        <div className="toast-stack">
          <div className="toast success">{success}</div>
        </div>
      ) : null}
    </AppShell>
  );
}
