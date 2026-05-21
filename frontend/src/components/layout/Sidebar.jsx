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
  ClipboardList,
  Eye,
  UserCog,
  X
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export default function Sidebar({ isOpen = false, onClose = () => {} }) {
  const auth = useAuth();

  const rolRaw = auth?.user?.rol || auth?.user?.rol?.nombre || '';
  const rol = String(rolRaw).toLowerCase();

  const isContador = rol === 'contador';
  const isSupervisor = rol === 'supervisor';
  const isAdmin = rol === 'admin';

  // Items que SOLO ve el ADMIN
  const itemsAdminOnly = [
    { to: '/usuarios', label: 'Usuarios', icon: UserCog },
    { to: '/scripts', label: 'Herramientas', icon: Settings }
  ];

  // Items que ven ADMIN y SUPERVISOR
  const itemsComunes = [
    { to: '/supervisor', label: 'Dashboard Supervisor', icon: Eye },
    { to: '/inventarios', label: 'Inventarios', icon: ClipboardList },
    { to: '/zonas', label: 'Zonas', icon: LayoutGrid },
    { to: '/grupos', label: 'Grupos', icon: Users },
    { to: '/rondas', label: 'Rondas', icon: Layers3 },
    { to: '/conteo-inicial', label: 'Conteo inicial', icon: FileSpreadsheet },
    { to: '/diferencias', label: 'Diferencias', icon: GitCompareArrows },
    { to: '/escaneo', label: 'Escaneo', icon: ScanLine }
  ];

  // Items solo para ADMIN (además de los comunes)
  const itemsAdminAdicionales = [
    { to: '/', label: 'Dashboard Admin', icon: BarChart3 }
  ];

  // Items para CONTADOR
  const itemsContador = [
    { to: '/escaneo', label: 'Escaneo', icon: ScanLine },
    { to: '/diferencias', label: 'Diferencias', icon: GitCompareArrows }
  ];

  let items = [];
  
  if (isAdmin) {
    items = [...itemsAdminAdicionales, ...itemsComunes, ...itemsAdminOnly];
  } else if (isSupervisor) {
    items = [...itemsComunes];
  } else if (isContador) {
    items = itemsContador;
  } else {
    items = itemsContador;
  }

  const handleLinkClick = () => {
    if (window.innerWidth <= 768) {
      onClose();
    }
  };

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
      {/* Botón cerrar dentro del sidebar para móvil */}
      <button className="sidebar-close-btn" onClick={onClose} aria-label="Cerrar menú">
        <X size={20} />
      </button>

      <div className="sidebar-brand">
        <div className="brand-title">Inventario App</div>
        <div className="brand-role">
          {isAdmin ? 'Administrador' : isSupervisor ? 'Supervisor' : 'Contador'}
        </div>
      </div>

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
              onClick={handleLinkClick}
            >
              <span className="sidebar-link-inner">
                <Icon size={18} />
                <span>{item.label}</span>
              </span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="user-name">{auth?.user?.nombre || 'Usuario'}</div>
        <div className="user-email">{auth?.user?.email || ''}</div>
      </div>
    </aside>
  );
}