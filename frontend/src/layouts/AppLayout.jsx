import { Outlet, useNavigate } from 'react-router-dom';
import Header from '../components/layout/Header';
import Sidebar from '../components/layout/Sidebar';

export default function AppLayout({ auth }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    auth.logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <Sidebar />

      <div className="app-main">
        <Header user={auth.user} onLogout={handleLogout} />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}