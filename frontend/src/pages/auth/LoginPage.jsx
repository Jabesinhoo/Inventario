import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LoginPage({ auth }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await auth.login(form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={handleSubmit}>
        <h2>Iniciar sesión</h2>
        <p className="muted">Ingresa con tu usuario del sistema</p>

        <div className="form-group">
          <label>Correo</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="admin@inventario.com"
            required
          />
        </div>

        <div className="form-group">
          <label>Contraseña</label>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            placeholder="********"
            required
          />
        </div>

        {error ? <div className="alert-error">{error}</div> : null}

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}