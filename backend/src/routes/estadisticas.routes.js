const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { injectGrupoId } = require('../middleware/grupo.middleware');
const estadisticasController = require('../controllers/estadisticas.controller');

router.get('/zona', authMiddleware, injectGrupoId, estadisticasController.getEstadisticasZona);
router.get('/grupo', authMiddleware, injectGrupoId, estadisticasController.getEstadisticasGrupoDetallado);
router.get('/generales', authMiddleware, injectGrupoId, estadisticasController.getEstadisticasGenerales);

module.exports = router;