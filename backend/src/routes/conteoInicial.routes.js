const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');
const { uploadExcel } = require('../middleware/upload.middleware');
const controller = require('../controllers/conteoInicial.controller');

router.post(
  '/import-excel',
  authMiddleware,
  allowRoles('admin', 'supervisor'),
  uploadExcel.single('file'),
  controller.importConteoInicialExcel
);

router.get(
  '/resumen',
  authMiddleware,
  controller.getConteoInicialResumen
);

router.get(
  '/sqlserver-status',
  authMiddleware,
  allowRoles('admin', 'supervisor'),
  controller.getSqlServerStatus
);

router.post(
  '/sync-sqlserver',
  authMiddleware,
  allowRoles('admin', 'supervisor'),
  controller.syncFromSqlServer
);

router.get(
  '/exportar',
  authMiddleware,
  allowRoles('admin', 'supervisor'),
  controller.exportConteoInicial
);

module.exports = router;