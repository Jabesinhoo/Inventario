const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { injectGrupoId } = require('../middleware/grupo.middleware');
const dashboardController = require('../controllers/dashboard.controller');

// Dashboard principal con todas las métricas
router.get('/', authMiddleware, injectGrupoId, dashboardController.getDashboard);

// Dashboard resumido (para cards rápidas)
router.get('/resumen', authMiddleware, injectGrupoId, dashboardController.getDashboardResumen);

// Exportar a Excel
router.get('/exportar', authMiddleware, injectGrupoId, dashboardController.exportarDashboardExcel);

module.exports = router;