import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { useAuthStore } from '@/stores/authStore';
import { applyTheme, getStoredTheme, resolveTheme, toggleTheme, type ThemeMode } from '@/utils/theme';

function getLoginErrorMessage(err: unknown) {
  if (err instanceof Error && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string }; status?: number } }).response;
    const detail = resp?.data?.detail;
    if (detail) {
      const lowerDetail = detail.toLowerCase();
      if (lowerDetail.includes('incorrect') || lowerDetail.includes('invalid') || lowerDetail.includes('password')) {
        return '用户名或密码错误，请重新输入';
      }
      return detail;
    }
    if (resp?.status === 401) return '用户名或密码错误，请重新输入';
  }
  return '登录失败，请稍后重试';
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getPasswordStrength(password: string) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  if (!password) return { score: 0, label: '请输入密码', className: 'empty' };
  if (score <= 2) return { score, label: '强度弱：至少 8 位，并包含大小写字母和数字', className: 'weak' };
  if (score <= 4) return { score, label: '强度中：建议再加入特殊字符', className: 'medium' };
  return { score, label: '强度高', className: 'strong' };
}

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => resolveTheme(getStoredTheme()));

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const shellRef = useRef<HTMLElement>(null);
  const passwordStrength = getPasswordStrength(password);
  const shouldShowEmailHint = isRegister && email.length > 0;
  const shouldShowPasswordHint = isRegister && password.length > 0;

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const hero = shell.querySelector('.login-hero');
      const card = shell.querySelector('.login-card');
      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
      if (hero) timeline.from(hero, { autoAlpha: 0, x: -22, duration: 0.5 });
      if (card) timeline.from(card, { autoAlpha: 0, y: 18, duration: 0.42 }, hero ? '-=0.28' : 0);
      return () => timeline.kill();
    });
    return () => media.revert();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (isRegister) {
      if (!isValidEmail(email)) {
        setError('请输入有效的邮箱地址');
        return;
      }
      if (passwordStrength.score < 3) {
        setError('密码强度不足，请使用至少 8 位并包含大小写字母和数字的密码');
        return;
      }
    }
    setLoading(true);
    try {
      if (isRegister) {
        await register(username, email, password);
      }
      await login(username, password);
      navigate('/files');
    } catch (err: unknown) {
      setError(getLoginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <button
        type="button"
        className="theme-toggle login-theme-toggle"
        onClick={() => setTheme(toggleTheme())}
        aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        title={theme === 'dark' ? '浅色模式' : '深色模式'}
      >
        {theme === 'dark' ? '浅色' : '深色'}
      </button>
      <section className="login-shell" aria-label="OpenCollab 登录" ref={shellRef}>
        <div className="login-hero">
          <div className="login-brand-row">
            <div className="brand-icon">OC</div>
            <div>
              <div className="login-brand-name">OpenCollab</div>
              <div className="login-credit">Author Yang</div>
            </div>
          </div>

          <div className="login-hero-copy">
            <p className="login-eyebrow">团队文档工作台</p>
            <h1>文档协作，一个工作台就够。</h1>
            <p>
              Word、Markdown、Excel 在线编辑，权限隔离、在线人员和评论协作集中管理。
            </p>
          </div>

          <div className="login-preview" aria-hidden="true">
            <div className="preview-topbar">
              <span />
              <span />
              <span />
              <strong>Q3_project_plan.md</strong>
            </div>
            <div className="preview-grid">
              <div className="preview-doc">
                <span className="preview-line long" />
                <span className="preview-line" />
                <span className="preview-line short" />
                <div className="preview-table">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className="preview-side">
                <div className="preview-chip">编辑中 2 人</div>
                <div className="preview-chip muted">只读权限</div>
                <div className="preview-comment">
                  <b>Author Yang</b>
                  <span>这里同步到最新版本。</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="login-card">
          <div className="login-logo">
            <p>{isRegister ? '创建账户' : '欢迎回来'}</p>
            <h2>{isRegister ? '加入 OpenCollab' : '登录 OpenCollab'}</h2>
            <span>{isRegister ? '注册后即可进入协作文档工作台' : '继续处理你的共享文件和在线协作'}</span>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>用户名</label>
              <input
                type="text"
                placeholder="例如 author"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            {isRegister && (
              <div className="form-group">
                <label>邮箱</label>
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  required
                />
                {shouldShowEmailHint && (
                  <p className={`field-hint ${isValidEmail(email) ? 'success' : 'error'}`}>
                    {isValidEmail(email) ? '邮箱格式正确' : '请输入有效的邮箱地址'}
                  </p>
                )}
              </div>
            )}
            <div className="form-group">
              <label>密码</label>
              <input
                type="password"
                placeholder={isRegister ? '至少 8 位，包含字母和数字' : '请输入密码'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                required
                minLength={isRegister ? 8 : 6}
              />
              {shouldShowPasswordHint && (
                <div className="password-strength">
                  <div className="strength-track">
                    <span className={`strength-fill ${passwordStrength.className}`} style={{ width: `${Math.max(passwordStrength.score, 1) * 20}%` }} />
                  </div>
                  <p className={`field-hint ${passwordStrength.className === 'weak' ? 'error' : 'success'}`}>
                    {passwordStrength.label}
                  </p>
                </div>
              )}
            </div>
            {error && <div className="form-error">{error}</div>}
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
            >
              {loading ? '处理中...' : isRegister ? '创建账户' : '进入工作台'}
            </button>
          </form>

          <div className="login-footer">
            {isRegister ? (
              <>
                已有账号？<a onClick={() => { setIsRegister(false); setUsername(''); setEmail(''); setPassword(''); setError(''); }}>返回登录</a>
              </>
            ) : (
              <>
                还没有账号？<a onClick={() => { setIsRegister(true); setUsername(''); setEmail(''); setPassword(''); setError(''); }}>立即注册</a>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
