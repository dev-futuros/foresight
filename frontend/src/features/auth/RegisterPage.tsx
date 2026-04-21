import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRegister } from '../../hooks/useAuth';
import './auth.css';

export default function RegisterPage() {
  const navigate = useNavigate();
  const register = useRegister();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  const serverError = register.error
    ? (register.error as { response?: { data?: { message?: string } } }).response?.data
        ?.message ?? 'Error al crear la cuenta.'
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await register.mutateAsync({ name, email, password, language: 'es' });
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

        <p className="eyebrow">Nueva cuenta</p>
        <h1>Crear tu cuenta</h1>
        <p className="auth-desc">Empieza a construir tus análisis de foresight estratégico.</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="name">Nombre (opcional)</label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alice Analyst"
            />
          </div>

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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                minLength={8}
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

          {serverError && <p className="auth-error">{serverError}</p>}

          <button
            type="submit"
            className="btn-primary"
            disabled={register.isPending}
          >
            {register.isPending ? <span className="btn-spinner" /> : 'Crear cuenta →'}
          </button>
        </form>

        <p className="auth-footer">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login">Iniciar sesión</Link>
        </p>
      </div>
    </div>
  );
}
