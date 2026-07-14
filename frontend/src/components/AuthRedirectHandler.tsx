import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

/**
 * Listens for 'auth:token-expired' DOM events dispatched by auth helpers
 * (authFetch, api interceptor, collab.ts) and navigates to /login via React Router.
 * Also syncs the auth store state so guarded routes re-render correctly.
 * Mount once at the app root.
 */
export default function AuthRedirectHandler() {
  const navigate = useNavigate();
  const checkAuth = useAuthStore((s) => s.checkAuth);
  useEffect(() => {
    const handler = () => {
      checkAuth();
      navigate('/login', { replace: true });
    };
    const el = document.getElementById('auth-token-expired');
    el?.addEventListener('auth:token-expired', handler);
    return () => el?.removeEventListener('auth:token-expired', handler);
  }, [navigate, checkAuth]);
  return null;
}
