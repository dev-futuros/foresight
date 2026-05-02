import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useVerifyEmail } from '../../hooks/useAuth';
import { extractApiErrorMessage } from '../../lib/apiError';
import './auth.css';

type Status = 'pending' | 'success' | 'error' | 'missing';

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token');
  const verify = useVerifyEmail();

  const [status, setStatus] = useState<Status>(token ? 'pending' : 'missing');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!token || attemptedRef.current) return;
    attemptedRef.current = true;
    verify
      .mutateAsync(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setErrorMsg(extractApiErrorMessage(err, t('auth.verifyEmail.errorDefault')));
      });
  }, [token, verify, t]);

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

        <p className="eyebrow">{t('auth.verifyEmail.eyebrow')}</p>
        <h1>{t('auth.verifyEmail.title')}</h1>

        {status === 'pending' && (
          <p className="auth-desc">{t('auth.verifyEmail.pending')}</p>
        )}

        {status === 'success' && (
          <>
            <p className="auth-desc">{t('auth.verifyEmail.success')}</p>
            <Link to="/dashboard" className="btn-primary" style={{ display: 'inline-block', textAlign: 'center' }}>
              {t('auth.verifyEmail.goDashboard')}
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <p className="auth-error">{errorMsg ?? t('auth.verifyEmail.errorDefault')}</p>
            <p className="auth-desc">{t('auth.verifyEmail.errorHelp')}</p>
            <Link to="/login" className="btn-primary" style={{ display: 'inline-block', textAlign: 'center' }}>
              {t('auth.verifyEmail.goLogin')}
            </Link>
          </>
        )}

        {status === 'missing' && (
          <>
            <p className="auth-error">{t('auth.verifyEmail.missingToken')}</p>
            <Link to="/login" className="btn-primary" style={{ display: 'inline-block', textAlign: 'center' }}>
              {t('auth.verifyEmail.goLogin')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
