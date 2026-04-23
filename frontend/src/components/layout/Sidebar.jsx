import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Boxes,
  ClipboardList,
  FileSpreadsheet,
  GitCompareArrows,
  LayoutGrid,
  ScanLine,
  ShieldAlert,
  Users,
  Settings, 
  Layers3
} from 'lucide-react';

const items = [
  { to: '/', label: 'Dashboard', icon: BarChart3 },
  { to: '/inventarios', label: 'Inventarios', icon: ClipboardList },
  { to: '/zonas', label: 'Zonas', icon: LayoutGrid },
  { to: '/grupos', label: 'Grupos', icon: Users },
  { to: '/rondas', label: 'Rondas', icon: BarChart3 },
  { to: '/conteo-inicial', label: 'Conteo inicial', icon: FileSpreadsheet },
  { to: '/diferencias', label: 'Diferencias', icon: GitCompareArrows },
  { to: '/tercer-conteo', label: 'Tercer conteo', icon: ShieldAlert },
  { to: '/escaneo', label: 'Escaneo', icon: ScanLine },
  { to: '/scripts', label: 'Herramientas', icon: Settings }
];

export default function Sidebar() {
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