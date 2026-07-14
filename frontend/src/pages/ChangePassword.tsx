import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import api from '@/services/api';

function getErrorMessage(err: unknown) {
  if (err instanceof Error && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response;
    if (resp?.data?.detail === 'Current password is incorrect') return '当前密码不正确';
    return resp?.data?.detail || '密码修改失败';
  }
  return '密码修改失败，请稍后重试';
}

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/change-password', {
        old_password: oldPassword,
        new_password: newPassword,
      });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('密码已修改');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="admin-page">
        <section className="admin-panel password-panel">
          <div className="admin-head">
            <div>
              <h1>修改密码</h1>
              <p>更新当前账号的登录密码。</p>
            </div>
            <button className="btn-action" onClick={() => navigate('/files')}>返回文件</button>
          </div>
          <form className="settings-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label>当前密码</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="form-group">
              <label>新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="form-group">
              <label>确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            {error && <div className="form-error">{error}</div>}
            {success && <div className="form-success">{success}</div>}
            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? '保存中...' : '保存新密码'}
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
