import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentUser } from '../../hooks/useAuth';
import { useUpdateProfile, useChangePassword } from '../../hooks/useAccount';
import './account.css';

const ROLE_LABELS: Record<string, string> = {
  USER: 'Usuario',
  ADMIN: 'Administrador',
};

const LANGUAGE_OPTIONS = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
];

export default function AccountPage() {
  const { data: user, isLoading } = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();

  const [name, setName] = useState('');
  const [language, setLanguage] = useState<'es' | 'en'>('es');
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name ?? '');
      setLanguage((user.language as 'es' | 'en') ?? 'es');
    }
  }, [user]);

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    try {
      await updateProfile.mutateAsync({ name: name.trim() || undefined, language });
      setProfileMsg({ type: 'ok', text: 'Perfil actualizado correctamente.' });
    } catch {
      setProfileMsg({ type: 'err', text: 'No se pudo actualizar el perfil.' });
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'err', text: 'Las contraseñas no coinciden.' });
      return;
    }
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setPasswordMsg({ type: 'ok', text: 'Contraseña cambiada correctamente.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setPasswordMsg({ type: 'err', text: 'Contraseña actual incorrecta.' });
    }
  }

  if (isLoading) return <div className="loading-screen">Cargando perfil...</div>;

  return (
    <div className="account-page">
      <nav className="account-nav">
        <div className="account-nav-left">
          <Link to="/dashboard" className="btn-back-nav">← Mis informes</Link>
          <span className="account-nav-title">Mi cuenta</span>
        </div>
      </nav>

      <div className="account-content">
        {/* Perfil */}
        <section className="account-section">
          <h2 className="account-section-title">Perfil</h2>
          <form className="account-form" onSubmit={handleProfileSubmit}>
            <div className="account-field">
              <label className="account-label">Email</label>
              <input
                className="account-input account-input--readonly"
                value={user?.email ?? ''}
                readOnly
                aria-label="Email"
              />
            </div>
            <div className="account-field">
              <label className="account-label">Nombre</label>
              <input
                className="account-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre"
                aria-label="Nombre"
              />
            </div>
            <div className="account-field">
              <label className="account-label">Rol</label>
              <input
                className="account-input account-input--readonly"
                value={ROLE_LABELS[user?.role ?? 'USER']}
                readOnly
                aria-label="Rol"
              />
            </div>
            {profileMsg && (
              <p className={`account-msg account-msg--${profileMsg.type}`}>{profileMsg.text}</p>
            )}
            <button
              type="submit"
              className="btn-account-save"
              disabled={updateProfile.isPending}
            >
              {updateProfile.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </form>
        </section>

        {/* Preferencias */}
        <section className="account-section">
          <h2 className="account-section-title">Preferencias</h2>
          <form className="account-form" onSubmit={handleProfileSubmit}>
            <div className="account-field">
              <label className="account-label">Idioma</label>
              <select
                className="account-input account-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'es' | 'en')}
                aria-label="Idioma"
              >
                {LANGUAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="btn-account-save"
              disabled={updateProfile.isPending}
            >
              {updateProfile.isPending ? 'Guardando…' : 'Guardar preferencias'}
            </button>
          </form>
        </section>

        {/* Seguridad */}
        <section className="account-section">
          <h2 className="account-section-title">Seguridad</h2>
          <form className="account-form" onSubmit={handlePasswordSubmit}>
            <div className="account-field">
              <label className="account-label">Contraseña actual</label>
              <input
                type="password"
                className="account-input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                aria-label="Contraseña actual"
                required
              />
            </div>
            <div className="account-field">
              <label className="account-label">Nueva contraseña</label>
              <input
                type="password"
                className="account-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                aria-label="Nueva contraseña"
                minLength={8}
                required
              />
            </div>
            <div className="account-field">
              <label className="account-label">Confirmar contraseña</label>
              <input
                type="password"
                className="account-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la nueva contraseña"
                aria-label="Confirmar contraseña"
                required
              />
            </div>
            {passwordMsg && (
              <p className={`account-msg account-msg--${passwordMsg.type}`}>{passwordMsg.text}</p>
            )}
            <button
              type="submit"
              className="btn-account-save"
              disabled={changePassword.isPending}
            >
              {changePassword.isPending ? 'Cambiando…' : 'Cambiar contraseña'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
