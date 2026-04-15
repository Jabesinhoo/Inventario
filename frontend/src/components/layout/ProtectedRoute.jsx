import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ auth, children }) {
  if (auth.loading) {
    return <div className="page-center">Cargando sesión...</div>;
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}