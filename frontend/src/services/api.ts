import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { AuthTokens } from '@/types';
import { clearAuthTokens, getAccessToken, getRefreshToken, setAuthTokens } from '@/services/sessionAuth';

const api: AxiosInstance = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

let refreshTokenPromise: Promise<AuthTokens | null> | null = null;

// Global flag to prevent redirect loops
let isRedirecting = false;

function isCredentialAuthRequest(url?: string) {
  return Boolean(url?.includes('/auth/login') || url?.includes('/auth/register'));
}

/** Unwrap Spring Result<T> envelope { code, message, data } when present. */
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

// Request interceptor: attach access token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    // Let the browser set multipart boundary
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      config.headers.delete('Content-Type');
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor: unwrap Result + retry once on 401 using refresh token
api.interceptors.response.use(
  (response) => {
    // Leave binary downloads alone
    if (response.config.responseType === 'blob' || response.config.responseType === 'arraybuffer') {
      return response;
    }
    response.data = unwrapResultPayload(response.data);
    return response;
  },
  async (error) => {
    // Map Spring message → FastAPI-style detail for UI
    if (error.response?.data && typeof error.response.data === 'object') {
      const body = error.response.data as { message?: string; detail?: string };
      if (!body.detail && body.message) {
        body.detail = body.message;
      }
    }

    const originalRequest = error.config;
    if (error.response?.status === 401 && isCredentialAuthRequest(originalRequest?.url)) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && originalRequest?.url?.includes('/auth/refresh')) {
      clearAuthTokens();
      refreshTokenPromise = null;
      if (!isRedirecting) {
        isRedirecting = true;
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (refreshTokenPromise) {
        return refreshTokenPromise.then((tokens) => {
          if (!tokens) throw error;
          originalRequest.headers.set('Authorization', `Bearer ${tokens.access_token}`);
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearAuthTokens();
        if (!isRedirecting) {
          isRedirecting = true;
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      refreshTokenPromise = api
        .post<AuthTokens>('/auth/refresh', { refresh_token: refreshToken })
        .then((resp) => {
          setAuthTokens(resp.data.access_token, resp.data.refresh_token);
          refreshTokenPromise = null;
          return resp.data;
        })
        .catch(() => {
          clearAuthTokens();
          if (!isRedirecting) {
            isRedirecting = true;
            window.location.href = '/login';
          }
          refreshTokenPromise = null;
          return null;
        });

      return refreshTokenPromise.then((tokens) => {
        if (!tokens) throw error;
        originalRequest.headers.set('Authorization', `Bearer ${tokens.access_token}`);
        return api(originalRequest);
      });
    }
    return Promise.reject(error);
  },
);

export default api;
