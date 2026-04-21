import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLogin } from '../../hooks/useAuth';
import './auth.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  const error = login.error
    ? (login.error as { response?: { data?: { message?: string } } }).response?.data
        ?.message ?? 'Credenciales incorrectas.'
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
            <span className="logo-sub">Foresight Strategy · Powered by Claude AI</span>
          </div>
        </div>

        <p className="eyebrow">Acceso</p>
        <h1>Bienvenido de nuevo</h1>
        <p className="auth-desc">Introduce tus credenciales para acceder a la plataforma.</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alice@ejemplo.com"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <div className="input-wrap">
              <input
                id="password"
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tu contraseña"
                required
              />
              <button
                type="button"
                className="eye-btn"
                onClick={() => setShowPwd((v) => !v)}
                aria-label="Mostrar/ocultar contraseña"
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
            {login.isPending ? <span className="btn-spinner" /> : 'Acceder →'}
          </button>
        </form>

        <p className="auth-footer">
          ¿No tienes cuenta?{' '}
          <Link to="/register">Crear cuenta</Link>
        </p>
      </div>
    </div>
  );
}
