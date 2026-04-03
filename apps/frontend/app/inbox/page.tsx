'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell, Icon } from '../../components/AppShell';
import { apiFetch, formatDate, withAdminBasePath } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';

type Conversation = {
  user: {
    id: number;
    telegramId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    isBlocked: boolean;
    lastSeenAt: string | null;
  };
  unreadCount: number;
  lastMessage: {
    id: number;
    text: string | null;
    direction: 'INCOMING' | 'OUTGOING';
    createdAt: string;
  } | null;
};

type ChatMessage = {
  id: number;
  direction: 'INCOMING' | 'OUTGOING';
  messageType: 'TEXT' | 'PHOTO' | 'VIDEO' | 'DOCUMENT' | 'STICKER' | 'AUDIO' | 'VOICE' | 'CONTACT' | 'LOCATION' | 'OTHER';
  text: string | null;
  caption: string | null;
  telegramFileId: string | null;
  deliveryStatus: 'PENDING' | 'SENT' | 'FAILED';
  errorText: string | null;
  createdAt: string;
};

export default function InboxPage() {
  const { loading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [search, setSearch] = useState('');
  const [replyText, setReplyText] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [fetchingConversations, setFetchingConversations] = useState(false);
  const [fetchingMessages, setFetchingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    const data = await apiFetch<Conversation[]>(`/api/inbox/conversations${query}`);
    setConversations(data);

    if (data.length === 0) {
      setSelectedUserId(null);
      setMessages([]);
      return;
    }

    if (!selectedUserId || !data.some((item) => item.user.id === selectedUserId)) {
      setSelectedUserId(data[0].user.id);
    }
  }, [search, selectedUserId]);

  const fetchMessages = useCallback(async (userId: number) => {
    const data = await apiFetch<ChatMessage[]>(`/api/inbox/conversations/${userId}/messages?limit=200`);
    setMessages(data);
  }, []);

  useEffect(() => {
    if (loading) return;
    let active = true;

    const run = async () => {
      setFetchingConversations(true);
      try {
        await fetchConversations();
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load conversations');
        }
      } finally {
        if (active) {
          setFetchingConversations(false);
        }
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [loading, fetchConversations]);

  useEffect(() => {
    if (!selectedUserId || loading) return;
    let active = true;

    const run = async () => {
      setFetchingMessages(true);
      try {
        await fetchMessages(selectedUserId);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load messages');
        }
      } finally {
        if (active) {
          setFetchingMessages(false);
        }
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [selectedUserId, loading, fetchMessages]);

  useEffect(() => {
    if (loading) return;
    const interval = setInterval(() => {
      void fetchConversations();
      if (selectedUserId) {
        void fetchMessages(selectedUserId);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [loading, selectedUserId, fetchConversations, fetchMessages]);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.user.id === selectedUserId) ?? null,
    [conversations, selectedUserId],
  );

  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedUserId || !replyText.trim()) return;

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await apiFetch<{ success: true; outboxId: number }>(
        `/api/inbox/conversations/${selectedUserId}/reply`,
        {
          method: 'POST',
          body: JSON.stringify({ text: replyText }),
        },
      );

      if (typeof result.outboxId !== 'number') {
        setError('Failed to queue reply');
        return;
      }

      setReplyText('');
      setSuccess('Reply queued');
      await fetchConversations();
      await fetchMessages(selectedUserId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const sendMediaReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedUserId || !selectedFile) return;

    setSendingMedia(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (mediaCaption.trim()) {
        formData.append('caption', mediaCaption.trim());
      }

      const response = await fetch(withAdminBasePath(`/api/inbox/conversations/${selectedUserId}/reply-media`), {
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
          // keep default error message
        }
        throw new Error(errorMessage);
      }

      setSelectedFile(null);
      setMediaCaption('');
      setSuccess('Image reply queued');
      await fetchConversations();
      await fetchMessages(selectedUserId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send image');
    } finally {
      setSendingMedia(false);
    }
  };

  if (loading) {
    return <div className="auth-wrap">Loading...</div>;
  }

  return (
    <AppShell>
      <div className="workspace">
        <section className="panel inbox-grid">
          <aside className="inbox-left">
            <div className="inbox-left-head">
              <div className="search-wrap">
                <Icon name="search" />
                <input
                  placeholder="Search by name, username, or ID..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>

            <div className="conversation-list">
              {fetchingConversations ? (
                <div style={{ padding: 12, display: 'grid', gap: 10 }}>
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <div className="skeleton" key={`conversation-skeleton-${idx}`} style={{ height: 82 }} />
                  ))}
                </div>
              ) : conversations.length === 0 ? (
                <div style={{ padding: 12 }}>
                  <div className="empty-state">No conversations found.</div>
                </div>
              ) : (
                conversations.map((conversation) => {
                  const name =
                    conversation.user.username ||
                    `${conversation.user.firstName || ''} ${conversation.user.lastName || ''}`.trim() ||
                    'Unknown user';

                  return (
                    <button
                      key={conversation.user.id}
                      className={`conversation-item ${selectedUserId === conversation.user.id ? 'active' : ''}`}
                      onClick={() => setSelectedUserId(conversation.user.id)}
                    >
                      <div className="conversation-top">
                        <div className="conversation-name">{name}</div>
                        <div className="conversation-time">
                          {conversation.lastMessage ? formatDate(conversation.lastMessage.createdAt) : '—'}
                        </div>
                      </div>
                      <div className="conversation-subline">
                        ID: {conversation.user.telegramId}
                        {'  '}
                        {conversation.user.isBlocked ? (
                          <span className="badge badge-danger" style={{ marginLeft: 6 }}>Blocked</span>
                        ) : null}
                      </div>
                      <div className="conversation-top" style={{ marginTop: 8 }}>
                        <div className="conversation-preview">
                          {conversation.lastMessage?.text || '[non-text message]'}
                        </div>
                        {conversation.unreadCount > 0 ? (
                          <span className="badge badge-info badge-count">{conversation.unreadCount}</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="inbox-chat">
            <header className="chat-header">
              {selectedConversation ? (
                <div>
                  <h2 className="chat-user">
                    {selectedConversation.user.username ||
                      `${selectedConversation.user.firstName || ''} ${selectedConversation.user.lastName || ''}`.trim() ||
                      'Unknown user'}
                  </h2>
                  <div className="chat-meta">
                    ID: {selectedConversation.user.telegramId} {'  '}
                    Last seen: {formatDate(selectedConversation.user.lastSeenAt)}
                  </div>
                </div>
              ) : (
                <div className="subtle">Select a conversation to begin.</div>
              )}
              {selectedConversation?.user.isBlocked ? (
                <span className="badge badge-danger">Blocked</span>
              ) : null}
            </header>

            <div className="messages">
              {!selectedUserId ? (
                <div className="empty-state">Choose a conversation from the left panel.</div>
              ) : fetchingMessages ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <div className="skeleton" key={`message-skeleton-${idx}`} style={{ height: 72, width: `${70 - idx * 8}%` }} />
                ))
              ) : messages.length === 0 ? (
                <div className="empty-state">No message history yet.</div>
              ) : (
                messages.map((message) => {
                  const failed = message.deliveryStatus === 'FAILED';
                  return (
                    <div
                      key={message.id}
                      className={`message-bubble ${message.direction === 'INCOMING' ? 'incoming' : 'outgoing'} ${failed ? 'failed' : ''}`}
                    >
                      {message.messageType === 'PHOTO' ? (
                        <>
                          {message.telegramFileId ? (
                            <img
                              src={withAdminBasePath(`/api/media/messages/${message.id}/file`)}
                              alt="message media"
                              className="message-image"
                            />
                          ) : (
                            <div className="image-unavailable">Image unavailable</div>
                          )}
                          {message.caption ? <p className="message-caption">{message.caption}</p> : null}
                        </>
                      ) : (
                        <p className="message-text">{message.text || '[non-text message]'}</p>
                      )}
                      <div className="message-meta">
                        {formatDate(message.createdAt)} · {message.deliveryStatus}
                        {message.errorText ? ` · ${message.errorText}` : ''}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="composer">
              <form onSubmit={sendReply}>
                <div className="composer-grid">
                  <textarea
                    placeholder="Type your message..."
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    maxLength={4000}
                    disabled={!selectedUserId}
                  />
                  <button
                    className="button-primary"
                    style={{ minWidth: 106, height: '100%' }}
                    type="submit"
                    disabled={!selectedUserId || sending || !replyText.trim()}
                  >
                    {sending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </form>

              <form onSubmit={sendMediaReply}>
                <div className="composer-actions">
                  <div className="file-inline">
                    <label className="button-secondary file-input" style={{ cursor: selectedUserId ? 'pointer' : 'not-allowed', opacity: selectedUserId ? 1 : 0.6 }}>
                      Choose image
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                        disabled={!selectedUserId}
                      />
                    </label>
                    <span className="subtle">
                      {selectedFile ? selectedFile.name : 'No image selected'}
                    </span>
                  </div>
                  <div className="button-row">
                    <input
                      placeholder="Caption (optional)"
                      value={mediaCaption}
                      onChange={(event) => setMediaCaption(event.target.value)}
                      maxLength={1024}
                      disabled={!selectedUserId}
                      style={{ width: 260 }}
                    />
                    <button className="button-secondary" type="submit" disabled={!selectedUserId || sendingMedia || !selectedFile}>
                      {sendingMedia ? 'Uploading...' : 'Send Image'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </section>
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
