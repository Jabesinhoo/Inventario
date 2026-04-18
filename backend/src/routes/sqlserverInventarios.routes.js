const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const controller = require('../controllers/sqlserverInventarios.controller');

// Verificar que el controlador existe
if (!controller) {
  console.error('❌ Error: Controlador sqlserverInventarios no encontrado');
  module.exports = router;
  return;
}

// Rutas
router.get('/status', authMiddleware, controller.getSqlServerStatus);
router.get('/productos', authMiddleware, controller.listarProductosExternos);
router.get('/producto', authMiddleware, controller.buscarProductoExterno);
router.get('/tablas', authMiddleware, controller.getSqlServerTables);

module.exports = router;