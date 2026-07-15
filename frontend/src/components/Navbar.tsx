import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { applyTheme, getStoredTheme, resolveTheme, toggleTheme, type ThemeMode } from '@/utils/theme';

export default function Navbar() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loadCurrentUser = useAuthStore((s) => s.loadCurrentUser);
  const [theme, setTheme] = useState<ThemeMode>(() => resolveTheme(getStoredTheme()));

  useEffect(() => {
    if (isAuthenticated && !user) {
      loadCurrentUser();
    }
  }, [isAuthenticated, loadCurrentUser, user]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <nav className="navbar">
      <Link to="/files" className="logo">
        <div className="logo-mark">OC</div>
        <span className="logo-text">OpenCollab</span>
      </Link>
      <div className="user-info">
        <span className="nav-context">工作台</span>
        <span className={`user-name ${user ? '' : 'loading'}`}>
          {user?.username ? `${user.username}${user.role === 'admin' ? ' / 管理员' : ''}` : '加载中'}
        </span>
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme(toggleTheme())}
          aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          title={theme === 'dark' ? '浅色模式' : '深色模式'}
        >
          {theme === 'dark' ? '浅色' : '深色'}
        </button>
      </div>
    </nav>
  );
}
