/**
 * Authenticated fetch wrapper.
 * Attaches the current access token from sessionStorage and redirects to /login on 401.
 * Unwraps Spring Result<T> { code, message, data } so callers get the bare payload.
 */
import { clearAuthTokens, getAccessToken } from '@/services/sessionAuth';

function unwrapResultPayload(data: unknown): unknown {
  if (
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'code' in data &&
    'data' in data
  ) {
    const envelope = data as { code: number; data: unknown; message?: string; detail?: string };
    if (envelope.code === 200) {
      return envelope.data;
    }
  }
  return data;
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (!headers['Accept']) {
    headers['Accept'] = 'application/json';
  }
  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    clearAuthTokens();
    window.location.href = '/login';
    return response;
  }

  // Clone-and-rewrap JSON body with Result unwrapped so existing `.json()` callers work.
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const raw = await response.json();
      // attach detail for error UIs
      if (raw && typeof raw === 'object' && !raw.detail && raw.message) {
        raw.detail = raw.message;
      }
      const unwrapped = response.ok ? unwrapResultPayload(raw) : raw;
      return new Response(JSON.stringify(unwrapped), {
        status: response.status,
        statusText: response.statusText,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      return response;
    }
  }

  return response;
}
