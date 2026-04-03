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
    return <div className="auth-wrap">Checking session...</div>;
  }

  return (
    <div className="auth-wrap">
      <form className="card" onSubmit={onSubmit}>
        <h1>Opener Bot Admin</h1>
        <label htmlFor="login">Login</label>
        <input
          id="login"
          value={login}
          onChange={(event) => setLogin(event.target.value)}
          autoComplete="username"
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />

        <div style={{ marginTop: 16 }}>
          <button type="submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </div>

        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}