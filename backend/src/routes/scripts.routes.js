const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');
const controller = require('../controllers/scripts.controller');

// Solo admin puede ejecutar scripts
router.post('/exportar-excel', authMiddleware, allowRoles('admin'), controller.ejecutarExportarExcel);
router.post('/backup', authMiddleware, allowRoles('admin'), controller.ejecutarBackup);
router.get('/exportaciones', authMiddleware, allowRoles('admin'), controller.listarExportaciones);
router.get('/exportaciones/:filename', authMiddleware, allowRoles('admin'), controller.descargarExportacion);
router.get('/exportar-json', authMiddleware, allowRoles('admin'), controller.exportarJson);
router.get('/descargar/:filename', authMiddleware, allowRoles('admin'), controller.descargarExportacionMelissa);
module.exports = router;