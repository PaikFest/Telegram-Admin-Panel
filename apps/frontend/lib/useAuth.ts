'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from './api';

export function useAuth() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [adminLogin, setAdminLogin] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const admin = await apiFetch<{ id: number; login: string }>('/api/auth/me');
        if (!active) return;
        setAdminLogin(admin.login);
      } catch {
        if (!active) return;
        router.replace('/login');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void check();

    return () => {
      active = false;
    };
  }, [router]);

  return { loading, adminLogin };
}