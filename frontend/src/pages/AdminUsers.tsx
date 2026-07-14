import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import api from '@/services/api';
import type { User } from '@/types';

type ResetTarget = User | null;

function formatDate(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

function getErrorMessage(err: unknown) {
  if (err instanceof Error && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response;
    return resp?.data?.detail || '操作失败';
  }
  return '操作失败，请稍后重试';
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resetTarget, setResetTarget] = useState<ResetTarget>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await api.get<User[]>('/admin/users');
      setUsers(resp.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    setResetError('');
    if (newPassword.length < 6) {
      setResetError('新密码至少 6 位');
      return;
    }
    setResetting(true);
    try {
      await api.post(`/admin/users/${resetTarget.id}/reset-password`, {
        new_password: newPassword,
      });
      setResetTarget(null);
      setNewPassword('');
    } catch (err) {
      setResetError(getErrorMessage(err));
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="admin-page">
        <section className="admin-panel">
          <div className="admin-head">
            <div>
              <h1>用户管理</h1>
              <p>查看系统用户，并为用户重置登录密码。</p>
            </div>
            <button className="btn-action" onClick={fetchUsers} disabled={loading}>
              刷新
            </button>
          </div>

          {error && <div className="form-error">{error}</div>}

          {loading ? (
            <div className="loading-panel">
              <span className="loader-mark" />
              <span className="loading-title">正在加载用户</span>
            </div>
          ) : (
            <div className="admin-table">
              <div className="admin-row header">
                <div>用户</div>
                <div>角色</div>
                <div>部门</div>
                <div>状态</div>
                <div>创建时间</div>
                <div>操作</div>
              </div>
              {users.map((user) => (
                <div className="admin-row" key={user.id}>
                  <div className="admin-user-cell">
                    <span className="user-avatar">{user.username.charAt(0).toUpperCase()}</span>
                    <span>
                      <strong>{user.username}</strong>
                      <small>{user.email}</small>
                    </span>
                  </div>
                  <div>
                    <span className={`permission-pill ${user.role === 'admin' ? 'owner' : 'readonly'}`}>
                      {user.role === 'admin' ? '管理员' : '普通用户'}
                    </span>
                  </div>
                  <div className="file-meta">{user.department || '-'}</div>
                  <div className="file-meta">{user.is_active === false ? '已停用' : '启用'}</div>
                  <div className="file-meta">{formatDate(user.created_at)}</div>
                  <div className="inline-actions">
                    <button className="mini-btn primary" onClick={() => setResetTarget(user)}>
                      重置密码
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {resetTarget && (
        <div className="modal-overlay" onClick={() => !resetting && setResetTarget(null)}>
          <div className="modal-card reset-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>重置密码</h3>
              <button className="modal-close" onClick={() => setResetTarget(null)}>&times;</button>
            </div>
            <div className="reset-modal-body">
              <p>为 <strong>{resetTarget.username}</strong> 设置新的登录密码。</p>
              <div className="form-group">
                <label>新密码</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setResetError('');
                  }}
                  minLength={6}
                  autoFocus
                />
              </div>
              {resetError && <div className="form-error">{resetError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setResetTarget(null)} disabled={resetting}>
                取消
              </button>
              <button className="btn-submit" onClick={handleResetPassword} disabled={resetting}>
                {resetting ? '处理中...' : '确认重置'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
