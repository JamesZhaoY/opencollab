import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export default function Navbar() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loadCurrentUser = useAuthStore((s) => s.loadCurrentUser);

  useEffect(() => {
    if (isAuthenticated && !user) {
      loadCurrentUser();
    }
  }, [isAuthenticated, loadCurrentUser, user]);

  return (
    <nav className="navbar">
      <Link to="/files" className="logo">
        <div className="logo-mark">OC</div>
        <span className="logo-text">OpenCollab</span>
      </Link>
      <div className="user-info">
        <span className="nav-context">Workspace</span>
        <span className={`user-name ${user ? '' : 'loading'}`}>
          {user?.username ? `${user.username}${user.role === 'admin' ? ' / 管理员' : ''}` : '加载中'}
        </span>
      </div>
    </nav>
  );
}
