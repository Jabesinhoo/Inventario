import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { LockKeyhole, UserRound } from 'lucide-react';
import { authService } from '../../services/auth.service';
import { saveSession } from '../../utils/storage';

export default function LoginPage({ auth }) {
  const [identificador, setIdentificador] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (auth?.isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();

    try {
      setLoading(true);
      setError('');

      const response = await authService.login(identificador, password);

      const token = response?.data?.token;
      const user = response?.data?.user;

      if (!token || !user) {
        throw new Error('La respuesta del login no es válida');
      }

      saveSession(token, user);

      window.location.href = '/';
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          'No fue posible iniciar sesión'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className="login-card">
          <div className="login-brand">
            <h1>Inventario Tecnonacho</h1>
            <p>Ingresa con tu correo, usuario o nombre.</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="identificador">Correo, usuario o nombre</label>
              <div className="input-with-icon">
                <span className="input-icon">
                  <UserRound size={18} />
                </span>
                <input
                  id="identificador"
                  type="text"
                  value={identificador}
                  onChange={(e) => setIdentificador(e.target.value)}
                  placeholder="Ingresa tu correo, usuario o nombre"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Contraseña</label>
              <div className="input-with-icon">
                <span className="input-icon">
                  <LockKeyhole size={18} />
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingresa tu contraseña"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={() => setShowPassword((prev) => !prev)}
                />
                <span>Mostrar contraseña</span>
              </label>
            </div>

            {error ? <div className="alert-error">{error}</div> : null}

            <button
              type="submit"
              className="btn btn-primary login-submit"
              disabled={loading}
            >
              {loading ? 'Ingresando...' : 'Iniciar sesión'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}