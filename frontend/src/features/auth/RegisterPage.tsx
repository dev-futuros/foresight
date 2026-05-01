import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRegister } from '../../hooks/useAuth';
import { extractApiErrorMessage } from '../../lib/apiError';
import './auth.css';

export default function RegisterPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const register = useRegister();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  const serverError = register.error
    ? extractApiErrorMessage(register.error, t('auth.register.errorDefault'))
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const language = i18n.language === 'en' ? 'en' : 'es';
    await register.mutateAsync({ name, email, password, language });
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

        <p className="eyebrow">{t('auth.register.eyebrow')}</p>
        <h1>{t('auth.register.title')}</h1>
        <p className="auth-desc">{t('auth.register.description')}</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="name">{t('auth.register.name')}</label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('auth.register.namePlaceholder')}
            />
          </div>

          <div className="field">
            <label htmlFor="email">{t('auth.register.email')}</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.register.emailPlaceholder')}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">{t('auth.register.password')}</label>
            <div className="input-wrap">
              <input
                id="password"
                type={showPwd ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.register.passwordPlaceholder')}
                minLength={8}
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

          {serverError && <p className="auth-error">{serverError}</p>}

          <button
            type="submit"
            className="btn-primary"
            disabled={register.isPending}
          >
            {register.isPending ? <span className="btn-spinner" /> : t('auth.register.submit')}
          </button>
        </form>

        <p className="auth-footer">
          {t('auth.register.haveAccount')}{' '}
          <Link to="/login">{t('auth.register.signIn')}</Link>
        </p>
      </div>
    </div>
  );
}
