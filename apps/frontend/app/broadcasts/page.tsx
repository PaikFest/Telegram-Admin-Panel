'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
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

export default function BroadcastsPage() {
  const { loading } = useAuth();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [items, setItems] = useState<BroadcastItem[]>([]);

  const load = async () => {
    const data = await apiFetch<BroadcastItem[]>('/api/broadcasts');
    setItems(data);
  };

  useEffect(() => {
    if (loading) return;

    let active = true;

    const run = async () => {
      try {
        await load();
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load broadcasts');
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

    const confirmed = window.confirm('Send this message to all users?');
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
      setSuccess('Broadcast started');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create broadcast');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="auth-wrap">Loading...</div>;
  }

  return (
    <AppShell>
      <h2>Broadcasts</h2>

      <form className="panel" style={{ padding: 14, marginBottom: 12 }} onSubmit={submit}>
        <label htmlFor="broadcast-title">Title (optional)</label>
        <input
          id="broadcast-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
        />

        <label htmlFor="broadcast-text">Message text</label>
        <textarea
          id="broadcast-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={4000}
          required
        />

        <div style={{ marginTop: 12 }}>
          <button type="submit" disabled={submitting || !text.trim()}>
            {submitting ? 'Sending...' : 'Send Broadcast'}
          </button>
        </div>

        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}
      </form>

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
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.id}</td>
              <td>{item.title || '-'}</td>
              <td>{item.status}</td>
              <td>{item.totalTargets}</td>
              <td>{item.successCount}</td>
              <td>{item.failedCount}</td>
              <td>{formatDate(item.createdAt)}</td>
              <td>{formatDate(item.finishedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}