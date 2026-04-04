'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell, Icon } from '../../components/AppShell';
import { apiFetch, formatDate, withAdminBasePath } from '../../lib/api';
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

type BroadcastAttachment = {
  id: string;
  file: File;
  previewUrl: string;
};

function generateClientId(): string {
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createAttachmentId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}-${generateClientId()}`;
}

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<BroadcastAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [items, setItems] = useState<BroadcastItem[]>([]);
  const [fetching, setFetching] = useState(false);
  const [estimatedTargets, setEstimatedTargets] = useState<number | null>(null);

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const revokeAttachmentPreview = (attachment: BroadcastAttachment) => {
    if (attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  };

  const clearAttachments = useCallback(() => {
    setAttachments((previous) => {
      previous.forEach(revokeAttachmentPreview);
      return [];
    });
    resetFileInput();
  }, []);

  useEffect(() => {
    return () => {
      setAttachments((previous) => {
        previous.forEach(revokeAttachmentPreview);
        return previous;
      });
    };
  }, []);

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

  const removeAttachment = (id: string) => {
    setAttachments((previous) => {
      const target = previous.find((attachment) => attachment.id === id);
      if (target) {
        revokeAttachmentPreview(target);
      }
      return previous.filter((attachment) => attachment.id !== id);
    });
    resetFileInput();
  };

  const onFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      resetFileInput();
      return;
    }

    const next = Array.from(files).map<BroadcastAttachment>((file) => ({
      id: createAttachmentId(file),
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setAttachments((previous) => [...previous, ...next]);
    resetFileInput();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    const sanitizedText = text.trim();
    const hasText = sanitizedText.length > 0;
    const hasAttachments = attachments.length > 0;

    if (!hasText && !hasAttachments) {
      return;
    }

    const confirmed = window.confirm('Send this broadcast to all active users?');
    if (!confirmed) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (hasAttachments) {
        const formData = new FormData();
        const sanitizedTitle = title.trim();

        if (sanitizedTitle.length > 0) {
          formData.append('title', sanitizedTitle);
        }
        if (hasText) {
          formData.append('text', sanitizedText);
        }

        for (const attachment of attachments) {
          formData.append('files', attachment.file);
        }

        const response = await fetch(withAdminBasePath('/api/broadcasts/media'), {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!response.ok) {
          let errorMessage = `Request failed with status ${response.status}`;
          try {
            const payload = (await response.json()) as { message?: string | string[] };
            if (Array.isArray(payload.message)) {
              errorMessage = payload.message.join(', ');
            } else if (typeof payload.message === 'string') {
              errorMessage = payload.message;
            }
          } catch {
            // keep fallback
          }
          throw new Error(errorMessage);
        }
      } else {
        await apiFetch('/api/broadcasts', {
          method: 'POST',
          body: JSON.stringify({
            title: title.trim() || undefined,
            text: sanitizedText,
          }),
        });
      }

      setTitle('');
      setText('');
      clearAttachments();
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
                Message (Optional)
              </label>
              <textarea
                id="broadcast-text"
                placeholder="Enter text for broadcast (optional if images are attached)..."
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={4000}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <label className="field-label">Images (Optional)</label>
              <div className="button-row">
                <label className="button-secondary file-input broadcast-attach-button">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="paperclip" />
                    Attach Images
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={onFileSelect}
                    disabled={submitting}
                  />
                </label>
                <span className="subtle">
                  {attachments.length > 0 ? `${attachments.length} selected` : 'No images selected'}
                </span>
              </div>
            </div>

            {attachments.length > 0 ? (
              <div className="attachment-tray">
                <div className="attachment-grid">
                  {attachments.map((attachment) => (
                    <div key={attachment.id} className="attachment-tile">
                      <img src={attachment.previewUrl} alt={attachment.file.name} className="attachment-thumb" />
                      <button
                        type="button"
                        className="attachment-remove attachment-remove-floating"
                        onClick={() => removeAttachment(attachment.id)}
                        disabled={submitting}
                      >
                        <Icon name="close" />
                      </button>
                      <div className="attachment-name" title={attachment.file.name}>
                        {attachment.file.name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="button-row" style={{ marginTop: 14 }}>
              <button className="button-primary" type="submit" disabled={submitting || (!text.trim() && attachments.length === 0)}>
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
                  <th>Jobs</th>
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
