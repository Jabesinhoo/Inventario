import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export default function Header({ user, onLogout }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="header">
      <div>
        <h1 className="header-title">Sistema de Inventario</h1>
        <p className="header-subtitle">
          Usuario: <strong>{user?.nombre || 'Sin sesión'}</strong>
        </p>
      </div>

      <div className="header-actions">
        <button className="icon-btn" onClick={toggleTheme} type="button" aria-label="Cambiar tema">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <span className="badge-role">{user?.rol || 'sin rol'}</span>

        <button className="btn btn-danger" onClick={onLogout}>
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}