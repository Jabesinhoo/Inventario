const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');
const controller = require('../controllers/diferencias.controller');

router.get('/', authMiddleware, controller.compareInventarios);
router.get('/exportar', authMiddleware, controller.exportarComparacionExcel);
router.post(
  '/reconteo',
  authMiddleware,
  allowRoles('admin', 'supervisor'),
  controller.generarReconteoDesdeComparacion
);

module.exports = router;