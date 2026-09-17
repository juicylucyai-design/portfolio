import type { DocumentCategory, DocumentInfo } from '@nksq/contracts';

// The only code in the web app that talks to the server.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const MAX_PDF_BYTES = 20 * 1024 * 1024;

async function handle<T>(response: Response, path: string): Promise<T> {
  if (response.status === 401 && path !== '/auth/login') {
    window.location.href = '/login';
    throw new ApiError('Sign in to continue.', 401);
  }
  if (response.status === 413) throw new ApiError('PDFs must be 20 MB or smaller.', 413);

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

export async function api<T>(path: string, options: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown } = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
  });
  return handle<T>(response, path);
}

/** Uploads a PDF or an email (.eml) as the raw request body. It's stored unattached until saved with an investment. */
export async function uploadDocument(file: File, category: DocumentCategory): Promise<DocumentInfo> {
  if (file.size > MAX_PDF_BYTES) throw new ApiError('Files must be 20 MB or smaller.', 413);
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isEmail = file.type === 'message/rfc822' || file.name.toLowerCase().endsWith('.eml');
  if (!isPdf && !isEmail) throw new ApiError('Choose a PDF or an email (.eml) file.', 400);

  const path = `/documents?category=${category}&fileName=${encodeURIComponent(file.name)}`;
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': isEmail ? 'message/rfc822' : 'application/pdf' },
    body: file,
  });
  return handle<DocumentInfo>(response, path);
}

export const documentUrl = (id: number, download = false) => `/api/documents/${id}/file${download ? '?download=1' : ''}`;
