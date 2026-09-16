// The only code in the web app that talks to the server.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
  });

  if (response.status === 401 && path !== '/auth/login') {
    window.location.href = '/login';
    throw new ApiError('Sign in to continue.', 401);
  }

  if (!response.ok) {
    let message = `Something went wrong (error ${response.status}). Try again.`;
    try {
      const data = (await response.json()) as { message?: string | string[] };
      if (data.message) message = Array.isArray(data.message) ? data.message.join(' ') : data.message;
    } catch {
      // Keep the generic message when the body isn't JSON.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
