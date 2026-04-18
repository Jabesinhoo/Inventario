const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { injectGrupoId } = require('../middleware/grupo.middleware');
const exportacionesController = require('../controllers/exportaciones.controller');

router.get('/resultados-finales', authMiddleware, injectGrupoId, exportacionesController.exportarResultadosFinales);
router.get('/escaneo-grupo', authMiddleware, injectGrupoId, exportacionesController.exportarEscaneoGrupo);

module.exports = router;