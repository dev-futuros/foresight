import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './renderWithProviders';
import AccountPage from '../features/account/AccountPage';

const mockUpdateProfile = vi.fn();
const mockChangePassword = vi.fn();

const mockUserData = {
  id: 'uuid-1',
  email: 'alice@example.com',
  name: 'Alice',
  role: 'USER' as const,
  language: 'es',
  emailVerified: true,
};

vi.mock('../hooks/useAuth', () => ({
  useCurrentUser: () => ({ data: mockUserData, isLoading: false }),
}));

vi.mock('../hooks/useAccount', () => ({
  useUpdateProfile: () => ({ mutateAsync: mockUpdateProfile, isPending: false }),
  useChangePassword: () => ({ mutateAsync: mockChangePassword, isPending: false }),
}));

function render() {
  return renderWithProviders(<AccountPage />, { initialEntries: ['/account'] });
}

describe('AccountPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateProfile.mockResolvedValue({});
    mockChangePassword.mockResolvedValue({});
  });

  it('shows user email as readonly', () => {
    render();
    const emailInput = screen.getByLabelText('Email') as HTMLInputElement;
    expect(emailInput.value).toBe('alice@example.com');
    expect(emailInput.readOnly).toBe(true);
  });

  it('shows user name pre-filled', () => {
    render();
    const nameInput = screen.getByLabelText('Nombre') as HTMLInputElement;
    expect(nameInput.value).toBe('Alice');
  });

  it('shows role as readonly', () => {
    render();
    const roleInput = screen.getByLabelText('Rol') as HTMLInputElement;
    expect(roleInput.value).toBe('Usuario');
    expect(roleInput.readOnly).toBe(true);
  });

  it('shows language selector pre-filled with user language', () => {
    render();
    const select = screen.getByLabelText('Idioma') as HTMLSelectElement;
    expect(select.value).toBe('es');
  });

  it('calls updateProfile with updated name on save', async () => {
    const user = userEvent.setup();
    render();
    const nameInput = screen.getByLabelText('Nombre');
    await user.clear(nameInput);
    await user.type(nameInput, 'Alice Updated');
    await user.click(screen.getAllByText('Guardar cambios')[0]);
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledWith({
      name: 'Alice Updated',
      language: 'es',
    }));
  });

  it('shows success message after profile update', async () => {
    render();
    fireEvent.click(screen.getAllByText('Guardar cambios')[0]);
    await waitFor(() => expect(screen.getByText('Perfil actualizado correctamente.')).toBeTruthy());
  });

  it('shows error message when profile update fails', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('fail'));
    render();
    fireEvent.click(screen.getAllByText('Guardar cambios')[0]);
    await waitFor(() => expect(screen.getByText('No se pudo actualizar el perfil.')).toBeTruthy());
  });

  it('calls changePassword with correct payload', async () => {
    render();
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'OldPass1!' } });
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'NewPass1!' } });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'NewPass1!' } });
    fireEvent.click(screen.getByText('Cambiar contraseña'));
    await waitFor(() => expect(mockChangePassword).toHaveBeenCalledWith({
      currentPassword: 'OldPass1!',
      newPassword: 'NewPass1!',
    }));
  });

  it('shows error when passwords do not match', async () => {
    const user = userEvent.setup();
    render();
    await user.type(screen.getByLabelText('Contraseña actual'), 'OldPass1!');
    await user.type(screen.getByLabelText('Nueva contraseña'), 'NewPass1!');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'Different!');
    await user.click(screen.getByText('Cambiar contraseña'));
    await waitFor(() => expect(screen.getByText('Las contraseñas no coinciden.')).toBeTruthy());
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('shows success message after password change', async () => {
    render();
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'OldPass1!' } });
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'NewPass1!' } });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'NewPass1!' } });
    fireEvent.click(screen.getByText('Cambiar contraseña'));
    await waitFor(() => expect(screen.getByText('Contraseña cambiada correctamente.')).toBeTruthy());
  });

  it('shows error when current password is wrong', async () => {
    mockChangePassword.mockRejectedValue(new Error('wrong password'));
    render();
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'WrongPass!' } });
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'NewPass1!' } });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'NewPass1!' } });
    fireEvent.click(screen.getByText('Cambiar contraseña'));
    await waitFor(() => expect(screen.getByText('Contraseña actual incorrecta.')).toBeTruthy());
  });
});
