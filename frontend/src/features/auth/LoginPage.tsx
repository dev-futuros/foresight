import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLogin } from '../../hooks/useAuth';
import { extractApiErrorMessage } from '../../lib/apiError';
import './auth.css';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  const error = login.error
    ? extractApiErrorMessage(login.error, t('auth.login.errorDefault'))
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await login.mutateAsync({ email, password });
    navigate('/dashboard');
  }

  return (
    <div className="auth-bg">
      <div className="bg-grid" />
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />

      <div className="auth-card">
        <div className="logo-row">
          <div className="logo-mark">F</div>
          <div>
            <div className="logo-text">Futuros</div>
            <span className="logo-sub">{t('common.brand')}</span>
          </div>
        </div>

        <p className="eyebrow">{t('auth.login.eyebrow')}</p>
        <h1>{t('auth.login.title')}</h1>
        <p className="auth-desc">{t('auth.login.description')}</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">{t('auth.login.email')}</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.login.emailPlaceholder')}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">{t('auth.login.password')}</label>
            <div className="input-wrap">
              <input
                id="password"
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.login.passwordPlaceholder')}
                required
              />
              <button
                type="button"
                className="eye-btn"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={t('common.togglePassword')}
              >
                {showPwd ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button
            type="submit"
            className="btn-primary"
            disabled={login.isPending}
          >
            {login.isPending ? <span className="btn-spinner" /> : t('auth.login.submit')}
          </button>
        </form>

        <p className="auth-footer">
          {t('auth.login.noAccount')}{' '}
          <Link to="/register">{t('auth.login.createAccount')}</Link>
        </p>
      </div>
    </div>
  );
}
