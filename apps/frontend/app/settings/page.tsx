'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';

export default function SettingsPage() {
  const { loading, adminLogin } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newLogin, setNewLogin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (adminLogin && !newLogin) {
      setNewLogin(adminLogin);
    }
  }, [adminLogin, newLogin]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await apiFetch('/api/auth/change-credentials', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newLogin,
          newPassword,
        }),
      });

      setCurrentPassword('');
      setNewPassword('');
      setSuccess('Credentials updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update credentials');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="auth-wrap">Loading...</div>;
  }

  return (
    <AppShell>
      <h2>Settings</h2>
      <form className="card" onSubmit={onSubmit}>
        <label htmlFor="currentPassword">Current password</label>
        <input
          id="currentPassword"
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
          minLength={8}
        />

        <label htmlFor="newLogin">New login</label>
        <input
          id="newLogin"
          value={newLogin}
          onChange={(event) => setNewLogin(event.target.value)}
          required
          minLength={3}
        />

        <label htmlFor="newPassword">New password</label>
        <input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          required
          minLength={8}
        />

        <div style={{ marginTop: 16 }}>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}
      </form>
    </AppShell>
  );
}