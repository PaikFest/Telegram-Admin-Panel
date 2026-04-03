'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      try {
        await apiFetch('/api/auth/me');
        if (active) {
          router.replace('/inbox');
        }
      } catch {
        // no active session
      } finally {
        if (active) {
          setChecking(false);
        }
      }
    };

    void checkSession();
    return () => {
      active = false;
    };
  }, [router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login, password }),
      });
      router.replace('/inbox');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="auth-wrap">
        <div className="panel auth-card skeleton" style={{ height: 340 }} />
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <form className="panel auth-card" onSubmit={onSubmit}>
        <h1 className="auth-title">Telegram Bot Admin Panel</h1>
        <p className="auth-subtitle">Private operator access to your admin workspace</p>

        <label className="field-label" htmlFor="login">
          Login
        </label>
        <input
          id="login"
          value={login}
          onChange={(event) => setLogin(event.target.value)}
          autoComplete="username"
          required
        />

        <label className="field-label" htmlFor="password" style={{ marginTop: 16 }}>
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />

        <div className="button-row" style={{ marginTop: 18 }}>
          <button className="button-primary" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </div>

        {error ? (
          <div className="toast error" style={{ marginTop: 14, position: 'relative', right: 'unset', bottom: 'unset' }}>
            {error}
          </div>
        ) : null}
      </form>
    </div>
  );
}
