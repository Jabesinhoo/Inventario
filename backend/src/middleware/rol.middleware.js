// middleware/rol.middleware.js
function isAdminOrSupervisor(req, res, next) {
  const rol = String(req.user?.rol || '').toLowerCase();
  
  if (rol === 'admin' || rol === 'supervisor') {
    return next();
  }
  
  return res.status(403).json({
    ok: false,
    message: 'Acceso denegado. Se requieren permisos de administrador o supervisor.'
  });
}

function isAdmin(req, res, next) {
  const rol = String(req.user?.rol || '').toLowerCase();
  
  if (rol === 'admin') {
    return next();
  }
  
  return res.status(403).json({
    ok: false,
    message: 'Acceso denegado. Se requieren permisos de administrador.'
  });
}

module.exports = {
  isAdminOrSupervisor,
  isAdmin
};