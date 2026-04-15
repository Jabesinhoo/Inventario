import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const PrivateRoute = ({ children, allowedRoles = [] }) => {
  const { usuario, cargando, estaAutenticado } = useAuth()

  if (cargando) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
        <div className="spinner"></div>
      </div>
    )
  }

  if (!estaAutenticado) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(usuario?.rol)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

export default PrivateRoute