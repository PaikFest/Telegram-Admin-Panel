'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { apiFetch, formatDate } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';

type LogItem = {
  id: number;
  level: 'INFO' | 'WARN' | 'ERROR';
  scope: string;
  message: string;
  metadata: unknown;
  createdAt: string;
};

export default function LogsPage() {
  const { loading } = useAuth();
  const [items, setItems] = useState<LogItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;

    let active = true;

    const run = async () => {
      try {
        const data = await apiFetch<LogItem[]>('/api/logs?limit=200');
        if (active) {
          setItems(data);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load logs');
        }
      }
    };

    void run();

    const interval = setInterval(() => {
      void run();
    }, 10000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [loading]);

  if (loading) {
    return <div className="auth-wrap">Loading...</div>;
  }

  return (
    <AppShell>
      <h2>Logs</h2>
      {error && <p className="error">{error}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Level</th>
            <th>Scope</th>
            <th>Message</th>
            <th>Metadata</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{formatDate(item.createdAt)}</td>
              <td>{item.level}</td>
              <td>{item.scope}</td>
              <td>{item.message}</td>
              <td>{item.metadata ? JSON.stringify(item.metadata) : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}