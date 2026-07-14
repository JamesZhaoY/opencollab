import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export default function UserDock() {
  const navigate = useNavigate();
  const dockRef = useRef<HTMLDivElement | null>(null);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!dockRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  if (!isAuthenticated) return null;

  const initial = user?.username?.charAt(0)?.toUpperCase() || '...';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="user-dock" ref={dockRef}>
      {open && (
        <div className="user-menu">
          <div className="user-menu-head">
            <strong>{user?.username || '加载中'}</strong>
            <span>{user?.email || '账号信息加载中'}</span>
          </div>
          {user?.role === 'admin' && (
            <Link to="/admin/users" className="user-menu-item" onClick={() => setOpen(false)}>
              系统管理
            </Link>
          )}
          <Link to="/settings/password" className="user-menu-item" onClick={() => setOpen(false)}>
            修改密码
          </Link>
          <button className="user-menu-item danger" onClick={handleLogout}>
            退出
          </button>
        </div>
      )}
      <button className="user-dock-trigger" onClick={() => setOpen((value) => !value)} aria-label="打开账号菜单">
        <span className="avatar">{initial}</span>
      </button>
    </div>
  );
}
