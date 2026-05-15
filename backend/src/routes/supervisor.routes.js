// backend/src/routes/supervisor.routes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const supervisorController = require('../controllers/supervisor.controller');

// Middleware para verificar que es admin o supervisor
function isAdminOrSupervisor(req, res, next) {
  const rol = String(req.user?.rol || '').toLowerCase();
  console.log('🔍 Verificando rol para supervisor:', rol);
  if (rol === 'admin' || rol === 'supervisor') {
    return next();
  }
  return res.status(403).json({
    ok: false,
    message: 'Acceso denegado. Se requieren permisos de administrador o supervisor.'
  });
}

// Todas las rutas requieren autenticación
router.use(authMiddleware);
router.use(isAdminOrSupervisor);

// Rutas del supervisor
router.get('/dashboard', supervisorController.getDashboardSupervisor);
router.get('/alertas', supervisorController.getAlertasRealtime);
router.get('/grupo-detalle', supervisorController.getGrupoDetalle);

module.exports = router;