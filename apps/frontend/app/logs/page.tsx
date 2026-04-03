'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { apiFetch, formatDate } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

type LogItem = {
  id: number;
  level: LogLevel;
  scope: string;
  message: string;
  metadata: unknown;
  createdAt: string;
};

function levelBadgeClass(level: LogLevel): string {
  if (level === 'ERROR') return 'badge badge-danger';
  if (level === 'WARN') return 'badge badge-warning';
  return 'badge badge-info';
}

export default function LogsPage() {
  const { loading } = useAuth();
  const [items, setItems] = useState<LogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [filter, setFilter] = useState<'ALL' | LogLevel>('ALL');

  useEffect(() => {
    if (loading) return;

    let active = true;
    setFetching(true);

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
      } finally {
        if (active) {
          setFetching(false);
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

  const filtered = useMemo(() => {
    if (filter === 'ALL') return items;
    return items.filter((item) => item.level === filter);
  }, [items, filter]);

  const counts = useMemo(
    () => ({
      INFO: items.filter((item) => item.level === 'INFO').length,
      WARN: items.filter((item) => item.level === 'WARN').length,
      ERROR: items.filter((item) => item.level === 'ERROR').length,
    }),
    [items],
  );

  if (loading) {
    return <div className="auth-wrap">Loading...</div>;
  }

  return (
    <AppShell>
      <div className="workspace">
        <header className="page-head">
          <div>
            <h1 className="page-title">Logs</h1>
            <p className="page-subtitle">System activity and error logs</p>
          </div>
          <div className="chip-row">
            <button className={`chip ${filter === 'ALL' ? 'active' : ''}`} onClick={() => setFilter('ALL')}>
              All
            </button>
            <button className={`chip ${filter === 'INFO' ? 'active' : ''}`} onClick={() => setFilter('INFO')}>
              Info
            </button>
            <button className={`chip ${filter === 'WARN' ? 'active' : ''}`} onClick={() => setFilter('WARN')}>
              Warnings
            </button>
            <button className={`chip ${filter === 'ERROR' ? 'active' : ''}`} onClick={() => setFilter('ERROR')}>
              Errors
            </button>
          </div>
        </header>

        <section className="panel table-shell">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Level</th>
                <th>Scope</th>
                <th>Message</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {fetching ? (
                Array.from({ length: 10 }).map((_, idx) => (
                  <tr key={`logs-skeleton-${idx}`}>
                    {Array.from({ length: 5 }).map((__, colIdx) => (
                      <td key={`logs-skeleton-${idx}-${colIdx}`}>
                        <div className="skeleton-line" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">No logs found for this filter.</div>
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id}>
                    <td className="mono">{formatDate(item.createdAt)}</td>
                    <td>
                      <span className={levelBadgeClass(item.level)}>{item.level}</span>
                    </td>
                    <td className="mono subtle">{item.scope}</td>
                    <td>{item.message}</td>
                    <td>
                      <button
                        className="button-secondary"
                        style={{ padding: '6px 10px' }}
                        onClick={() => {
                          const payload = item.metadata ? JSON.stringify(item.metadata, null, 2) : 'No details';
                          window.alert(payload);
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <div className="stat-grid">
          <div className="panel stat-card">
            <div className="stat-label">Info</div>
            <div className="stat-value" style={{ color: '#78e8ff' }}>{counts.INFO}</div>
          </div>
          <div className="panel stat-card">
            <div className="stat-label">Warnings</div>
            <div className="stat-value warning-text">{counts.WARN}</div>
          </div>
          <div className="panel stat-card">
            <div className="stat-label">Errors</div>
            <div className="stat-value danger-text">{counts.ERROR}</div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="toast-stack">
          <div className="toast error">{error}</div>
        </div>
      ) : null}
    </AppShell>
  );
}
