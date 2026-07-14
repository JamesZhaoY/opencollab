import { create } from 'zustand';
import type { User } from '@/types';
import api from '@/services/api';
import {
  clearAuthTokens,
  clearPersistentAuthTokens,
  getAccessToken,
  getRefreshToken,
  setAuthTokens,
} from '@/services/sessionAuth';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string, department?: string) => Promise<User>;
  logout: () => void;
  setUser: (user: User) => void;
  loadCurrentUser: () => Promise<User | null>;
  /** Force-check session token state. Called when tokens are cleared externally. */
  checkAuth: () => void;
}

let currentUserPromise: Promise<User | null> | null = null;
clearPersistentAuthTokens();

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: getAccessToken(),
  isAuthenticated: !!getAccessToken(),

  login: async (username: string, password: string) => {
    const resp = await api.post('/auth/login', { username, password });
    const { access_token, refresh_token } = resp.data;
    setAuthTokens(access_token, refresh_token);
    set({ accessToken: access_token, isAuthenticated: true });
    // Fetch user info
    const userResp = await api.get('/auth/me');
    set({ user: userResp.data });
  },

  register: async (username: string, email: string, password: string, department?: string) => {
    const resp = await api.post('/auth/register', { username, email, password, department });
    return resp.data;
  },

  logout: () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      api.post('/auth/logout', { refresh_token: refreshToken }).catch(() => {});
    }
    clearAuthTokens();
    set({ user: null, accessToken: null, isAuthenticated: false });
  },

  setUser: (user: User) => set({ user }),

  loadCurrentUser: async () => {
    const token = getAccessToken();
    if (!token) {
      set({ user: null, accessToken: null, isAuthenticated: false });
      return null;
    }
    if (get().user) return get().user;
    if (currentUserPromise) return currentUserPromise;

    set({ accessToken: token, isAuthenticated: true });
    currentUserPromise = api.get<User>('/auth/me')
      .then((resp) => {
        set({ user: resp.data, accessToken: getAccessToken(), isAuthenticated: true });
        return resp.data;
      })
      .catch(() => {
        if (!getAccessToken()) {
          set({ user: null, accessToken: null, isAuthenticated: false });
        }
        return null;
      })
      .finally(() => {
        currentUserPromise = null;
      });
    return currentUserPromise;
  },

  checkAuth: () => {
    // Always read from sessionStorage: handles cases where tokens were cleared
    // by the api interceptor (401 flow) outside of React state
    const token = getAccessToken();
    if (!token && get().isAuthenticated) {
      set({ user: null, accessToken: null, isAuthenticated: false });
    } else if (token && !get().isAuthenticated) {
      set({ accessToken: token, isAuthenticated: true });
    }
  },
}));
