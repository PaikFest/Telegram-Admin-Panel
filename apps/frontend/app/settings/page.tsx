'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell, Icon } from '../../components/AppShell';
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
      setSuccess('Credentials updated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update credentials');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setCurrentPassword('');
    setNewLogin(adminLogin ?? '');
    setNewPassword('');
    setError(null);
    setSuccess(null);
  };

  if (loading) {
    return <div className="auth-wrap">Loading...</div>;
  }

  return (
    <AppShell>
      <div className="workspace" style={{ maxWidth: 860 }}>
        <div className="notice-banner">
          <Icon name="shield" />
          <div>
            <div className="notice-title">Security Notice</div>
            <div className="notice-text">
              Changing your credentials will require you to log in again with the new credentials.
              Keep them secure.
            </div>
          </div>
        </div>

        <section className="panel panel-body">
          <h2 className="panel-title">Change Admin Credentials</h2>
          <form onSubmit={onSubmit}>
            <div>
              <label className="field-label" htmlFor="currentPassword">
                Current Password *
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Enter your current password"
                required
                minLength={8}
              />
              <div className="field-help">Required to confirm identity.</div>
            </div>

            <div className="divider" />

            <div>
              <label className="field-label" htmlFor="newLogin">
                New Login
              </label>
              <input
                id="newLogin"
                value={newLogin}
                onChange={(event) => setNewLogin(event.target.value)}
                placeholder="Enter new login"
                required
                minLength={3}
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <label className="field-label" htmlFor="newPassword">
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Enter new password"
                required
                minLength={8}
              />
              <div className="field-help">Use a strong password with at least 12 characters.</div>
            </div>

            <div className="button-row" style={{ marginTop: 18 }}>
              <button className="button-primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button className="button-secondary" type="button" onClick={resetForm} disabled={saving}>
                Reset Form
              </button>
            </div>
          </form>
        </section>

        <section className="panel panel-body">
          <h3 className="panel-subtitle" style={{ color: 'var(--text)', fontSize: 28, marginBottom: 10 }}>
            Best Practices
          </h3>
          <div className="subtle" style={{ lineHeight: 1.7 }}>
            • Use a unique password that you do not use anywhere else.
            <br />
            • Rotate admin credentials regularly.
            <br />
            • Avoid sharing credentials in plain text channels.
            <br />
            • Store secrets in a secure password manager.
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
