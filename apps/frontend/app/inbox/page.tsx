'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { apiFetch, formatDate } from '../../lib/api';
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
  text: string | null;
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    void fetchConversations();
  }, [loading, fetchConversations]);

  useEffect(() => {
    if (!selectedUserId || loading) return;
    void fetchMessages(selectedUserId);
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
      await fetchConversations();
      await fetchMessages(selectedUserId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="auth-wrap">Loading...</div>;
  }

  return (
    <AppShell>
      <h2>Inbox</h2>
      <div className="inbox-layout">
        <section className="panel">
          <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
            <input
              placeholder="Search by username or telegramId"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="conversation-list">
            {conversations.map((conversation) => (
              <div
                key={conversation.user.id}
                className={`conv-item ${selectedUserId === conversation.user.id ? 'active' : ''}`}
                onClick={() => setSelectedUserId(conversation.user.id)}
              >
                <div className="conv-top">
                  <strong>{conversation.user.username || conversation.user.firstName || 'Unknown user'}</strong>
                  {conversation.unreadCount > 0 ? (
                    <span className="badge">{conversation.unreadCount}</span>
                  ) : null}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                  {conversation.user.telegramId}
                  {conversation.user.isBlocked ? ' · blocked' : ''}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--muted)' }}>
                  {conversation.lastMessage?.text || '[non-text message]'}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
            {selectedConversation ? (
              <>
                <strong>
                  {selectedConversation.user.username ||
                    `${selectedConversation.user.firstName || ''} ${selectedConversation.user.lastName || ''}`.trim() ||
                    'Unknown user'}
                </strong>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                  telegramId: {selectedConversation.user.telegramId}, last seen:{' '}
                  {formatDate(selectedConversation.user.lastSeenAt)}
                </div>
              </>
            ) : (
              'Select a conversation'
            )}
          </div>

          <div className="messages">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`msg ${message.direction === 'INCOMING' ? 'incoming' : 'outgoing'}`}
              >
                <div>{message.text || '[non-text message]'}</div>
                <div className="msg-meta">
                  {formatDate(message.createdAt)} · {message.deliveryStatus}
                  {message.errorText ? ` · ${message.errorText}` : ''}
                </div>
              </div>
            ))}
          </div>

          <form className="reply-box" onSubmit={sendReply}>
            <textarea
              placeholder="Type reply"
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              maxLength={4000}
              disabled={!selectedUserId}
            />
            <div className="row">
              <button type="submit" disabled={!selectedUserId || sending || !replyText.trim()}>
                {sending ? 'Sending...' : 'Send'}
              </button>
              {error && <span className="error">{error}</span>}
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
