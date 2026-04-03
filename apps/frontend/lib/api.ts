export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;

    try {
      const data = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) {
        errorMessage = data.message.join(', ');
      } else if (typeof data.message === 'string') {
        errorMessage = data.message;
      }
    } catch {
      // ignore JSON parsing errors and keep fallback message
    }

    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
}

export function formatDate(value?: string | Date | null): string {
  if (!value) {
    return '-';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString();
}