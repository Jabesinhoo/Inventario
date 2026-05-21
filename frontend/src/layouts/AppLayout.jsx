import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import Header from '../components/layout/Header';
import Sidebar from '../components/layout/Sidebar';
import ConnectionBar from '../components/layout/ConnectionBar';

export default function AppLayout({ auth }) {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    auth.logout();
    navigate('/login');
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  return (
    <div className="app-shell">
      {/* Botón hamburguesa para móvil */}
      <button className="mobile-menu-btn" onClick={toggleSidebar} aria-label="Menú">
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Overlay para cerrar sidebar en móvil */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={closeSidebar} />}

      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      <div className="app-main">
        <Header user={auth.user} onLogout={handleLogout} />
        <main className="content">
          <Outlet />
        </main>
      </div>
      <ConnectionBar />
    </div>
  );
}