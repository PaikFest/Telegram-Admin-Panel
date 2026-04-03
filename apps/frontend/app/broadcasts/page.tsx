'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell, Icon } from '../../components/AppShell';
import { apiFetch, formatDate } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';

type BroadcastItem = {
  id: number;
  title: string | null;
  text: string;
  status: 'PENDING' | 'RUNNING' | 'FINISHED' | 'FAILED';
  totalTargets: number;
  successCount: number;
  failedCount: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

function statusBadge(status: BroadcastItem['status']): string {
  switch (status) {
    case 'FINISHED':
      return 'badge badge-success';
    case 'FAILED':
      return 'badge badge-danger';
    case 'RUNNING':
      return 'badge badge-info';
    default:
      return 'badge badge-muted';
  }
}

export default function BroadcastsPage() {
  const { loading } = useAuth();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [items, setItems] = useState<BroadcastItem[]>([]);
  const [fetching, setFetching] = useState(false);
  const [estimatedTargets, setEstimatedTargets] = useState<number | null>(null);

  const load = async () => {
    const [broadcasts, users] = await Promise.all([
      apiFetch<BroadcastItem[]>('/api/broadcasts'),
      apiFetch<Array<{ id: number; isBlocked: boolean }>>('/api/users'),
    ]);
    setItems(broadcasts);
    setEstimatedTargets(users.filter((user) => !user.isBlocked).length);
  };

  useEffect(() => {
    if (loading) return;

    let active = true;
    setFetching(true);

    const run = async () => {
      try {
        await load();
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load broadcasts');
        }
      } finally {
        if (active) {
          setFetching(false);
        }
      }
    };

    void run();

    const interval = setInterval(() => {
      void run();
    }, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [loading]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;

    const confirmed = window.confirm('Send this message to all active users?');
    if (!confirmed) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await apiFetch('/api/broadcasts', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim() || undefined,
          text,
        }),
      });
      setTitle('');
      setText('');
      setSuccess('Broadcast queued successfully');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create broadcast');
    } finally {
      setSubmitting(false);
    }
  };

  const targetsText = useMemo(() => {
    if (estimatedTargets === null) return 'Estimating targets...';
    return `Will be sent to ~${estimatedTargets} users`;
  }, [estimatedTargets]);

  if (loading) {
    return <div className="auth-wrap">Loading...</div>;
  }

  return (
    <AppShell>
      <div className="workspace">
        <header className="page-head">
          <div>
            <h1 className="page-title">Broadcasts</h1>
            <p className="page-subtitle">Send messages to all users</p>
          </div>
        </header>

        <section className="panel panel-body">
          <h2 className="panel-title">Create New Broadcast</h2>
          <form onSubmit={submit}>
            <div style={{ marginBottom: 14 }}>
              <label className="field-label" htmlFor="broadcast-title">
                Title (Optional)
              </label>
              <input
                id="broadcast-title"
                placeholder="e.g. Weekly Update, Maintenance Notice"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
              />
            </div>

            <div>
              <label className="field-label" htmlFor="broadcast-text">
                Message *
              </label>
              <textarea
                id="broadcast-text"
                placeholder="Enter the message to send to all users..."
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={4000}
                required
              />
            </div>

            <div className="button-row" style={{ marginTop: 14 }}>
              <button className="button-primary" type="submit" disabled={submitting || !text.trim()}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="broadcasts" />
                  {submitting ? 'Sending...' : 'Send Broadcast'}
                </span>
              </button>
              <span className="subtle">{targetsText}</span>
            </div>
          </form>
        </section>

        <section>
          <h2 className="panel-title" style={{ marginBottom: 12 }}>
            Broadcast History
          </h2>
          <div className="panel table-shell">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Targets</th>
                  <th>Success</th>
                  <th>Failed</th>
                  <th>Created</th>
                  <th>Finished</th>
                </tr>
              </thead>
              <tbody>
                {fetching ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={`broadcasts-skeleton-${idx}`}>
                      {Array.from({ length: 8 }).map((__, colIdx) => (
                        <td key={`broadcasts-skeleton-${idx}-${colIdx}`}>
                          <div className="skeleton-line" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty-state">No broadcast history yet.</div>
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.title || <span className="subtle">No title</span>}</td>
                      <td>
                        <span className={statusBadge(item.status)}>{item.status}</span>
                      </td>
                      <td>{item.totalTargets}</td>
                      <td className="success-text">{item.successCount}</td>
                      <td className="danger-text">{item.failedCount}</td>
                      <td>{formatDate(item.createdAt)}</td>
                      <td>{formatDate(item.finishedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {(error || success) && (
        <div className="toast-stack">
          {error ? <div className="toast error">{error}</div> : null}
          {success ? <div className="toast success">{success}</div> : null}
        </div>
      )}
    </AppShell>
  );
}
