import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/layout/ProtectedRoute';
import { useAuth } from './hooks/useAuth';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/auth/LoginPage';
import AsignacionesPage from './pages/asignaciones/AsignacionesPage';
import ConteoInicialPage from './pages/conteoInicial/ConteoInicialPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import DiferenciasPage from './pages/diferencias/DiferenciasPage';
import EscaneoPage from './pages/escaneo/EscaneoPage';
import GruposPage from './pages/grupos/GruposPage';
import InventariosPage from './pages/inventarios/InventariosPage';
import ProductosPage from './pages/productos/ProductosPage';
import ZonasPage from './pages/zonas/ZonasPage';

export default function App() {
  const auth = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            auth.isAuthenticated ? (
              <Navigate to="/" replace />
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
          <Route index element={<DashboardPage auth={auth} />} />
          <Route path="inventarios" element={<InventariosPage />} />
          <Route path="zonas" element={<ZonasPage />} />
          <Route path="grupos" element={<GruposPage />} />
          <Route path="asignaciones" element={<AsignacionesPage />} />
          <Route path="productos" element={<ProductosPage />} />
          <Route path="conteo-inicial" element={<ConteoInicialPage />} />
          <Route path="diferencias" element={<DiferenciasPage />} />
          <Route path="escaneo" element={<EscaneoPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}