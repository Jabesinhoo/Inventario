import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/layout/ProtectedRoute';
import { useAuth } from './hooks/useAuth';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/auth/LoginPage';
import ConteoInicialPage from './pages/conteoInicial/ConteoInicialPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import DiferenciasPage from './pages/diferencias/DiferenciasPage';
import EscaneoPage from './pages/escaneo/EscaneoPage';
import GruposPage from './pages/grupos/GruposPage';
import InventariosPage from './pages/inventarios/InventariosPage';
import ZonasPage from './pages/zonas/ZonasPage';
import ScriptsPage from './pages/admin/ScriptsPage';
import RondasPage from './pages/rondas/RondasPage';
import UsuariosPage from './pages/usuarios/UsuariosPage';
import SupervisorDashboard from './pages/supervisor/SupervisorDashboard'; // ← NUEVA IMPORTACIÓN

function getRol(auth) {
  const rolRaw = auth?.user?.rol || auth?.user?.rol?.nombre || '';
  return String(rolRaw).toLowerCase();
}

function getHomeByRole(auth) {
  const rol = getRol(auth);
  if (rol === 'contador') return '/escaneo';
  if (rol === 'supervisor') return '/supervisor'; // ← Supervisores van a su dashboard
  return '/'; // Admin va al dashboard normal
}

function AdminRoute({ auth, children }) {
  const rol = getRol(auth);
  const permitido = rol === 'admin';

  return permitido ? children : <Navigate to={getHomeByRole(auth)} replace />;
}

function AdminSupervisorRoute({ auth, children }) {
  const rol = getRol(auth);
  const permitido = rol === 'admin' || rol === 'supervisor';

  return permitido ? children : <Navigate to={getHomeByRole(auth)} replace />;
}

function ContadorOrAdminRoute({ auth, children }) {
  const rol = getRol(auth);
  const permitido = rol === 'contador' || rol === 'admin' || rol === 'supervisor';

  return permitido ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const auth = useAuth();
  const rol = getRol(auth);
  const homePath = getHomeByRole(auth);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            auth.isAuthenticated ? (
              <Navigate to={homePath} replace />
            ) : (
              <LoginPage auth={auth} />
            )
          }
        />

        <Route
          path="/"
          element={
            <ProtectedRoute auth={auth}>
              <AppLayout auth={auth} />
            </ProtectedRoute>
          }
        >
          {/* Dashboard para Admin */}
          <Route
            index
            element={
              rol === 'contador' ? (
                <Navigate to="/escaneo" replace />
              ) : rol === 'supervisor' ? (
                <Navigate to="/supervisor" replace />
              ) : (
                <DashboardPage auth={auth} />
              )
            }
          />

          {/* NUEVA RUTA: Dashboard de Supervisor */}
          <Route
            path="supervisor"
            element={
              <AdminSupervisorRoute auth={auth}>
                <SupervisorDashboard />
              </AdminSupervisorRoute>
            }
          />

          <Route
            path="inventarios"
            element={
              <AdminSupervisorRoute auth={auth}>
                <InventariosPage />
              </AdminSupervisorRoute>
            }
          />

          <Route
            path="zonas"
            element={
              <AdminSupervisorRoute auth={auth}>
                <ZonasPage />
              </AdminSupervisorRoute>
            }
          />

          <Route
            path="grupos"
            element={
              <AdminSupervisorRoute auth={auth}>
                <GruposPage />
              </AdminSupervisorRoute>
            }
          />

          <Route
            path="rondas"
            element={
              <AdminSupervisorRoute auth={auth}>
                <RondasPage />
              </AdminSupervisorRoute>
            }
          />

          <Route
            path="conteo-inicial"
            element={
              <AdminSupervisorRoute auth={auth}>
                <ConteoInicialPage />
              </AdminSupervisorRoute>
            }
          />

          <Route
            path="scripts"
            element={
              <AdminRoute auth={auth}>
                <ScriptsPage />
              </AdminRoute>
            }
          />

          <Route
            path="diferencias"
            element={
              <ContadorOrAdminRoute auth={auth}>
                <DiferenciasPage />
              </ContadorOrAdminRoute>
            }
          />

          <Route
            path="usuarios"
            element={
              <AdminRoute auth={auth}>
                <UsuariosPage />
              </AdminRoute>
            }
          />

          <Route
            path="escaneo"
            element={
              <ContadorOrAdminRoute auth={auth}>
                <EscaneoPage />
              </ContadorOrAdminRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to={homePath} replace />} />
      </Routes>
    </BrowserRouter>
  );
}