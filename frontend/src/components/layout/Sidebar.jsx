import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  FileSpreadsheet,
  GitCompareArrows,
  LayoutGrid,
  ScanLine,
  Users,
  Settings,
  Layers3,
  ClipboardList
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export default function Sidebar() {
  const auth = useAuth();

  const rolRaw = auth?.user?.rol || auth?.user?.rol?.nombre || '';
  const rol = String(rolRaw).toLowerCase();

  const isContador = rol === 'contador';
  const isAdminOrSupervisor = rol === 'admin' || rol === 'supervisor';

  const itemsAdminSupervisor = [
    { to: '/', label: 'Dashboard', icon: BarChart3 },
    { to: '/inventarios', label: 'Inventarios', icon: ClipboardList },
    { to: '/zonas', label: 'Zonas', icon: LayoutGrid },
    { to: '/grupos', label: 'Grupos', icon: Users },
    { to: '/rondas', label: 'Rondas', icon: Layers3 },
    { to: '/conteo-inicial', label: 'Conteo inicial', icon: FileSpreadsheet },
    { to: '/diferencias', label: 'Diferencias', icon: GitCompareArrows },
    { to: '/escaneo', label: 'Escaneo', icon: ScanLine },
    { to: '/scripts', label: 'Herramientas', icon: Settings }
  ];

  const itemsContador = [
    { to: '/escaneo', label: 'Escaneo', icon: ScanLine },
    { to: '/diferencias', label: 'Diferencias', icon: GitCompareArrows }
  ];

  const items = isContador
    ? itemsContador
    : isAdminOrSupervisor
      ? itemsAdminSupervisor
      : itemsContador;

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">Inventario App</div>

      <nav className="sidebar-nav">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
            >
              <span className="sidebar-link-inner">
                <Icon size={18} />
                <span>{item.label}</span>
              </span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}