const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { injectGrupoId } = require('../middleware/grupo.middleware'); 
const lecturasController = require('../controllers/lecturas.controller');

router.post('/scan', authMiddleware, injectGrupoId, lecturasController.scanLectura);
router.post('/scan-ronda', authMiddleware, injectGrupoId, lecturasController.scanLecturaRonda);
router.delete('/:id', authMiddleware, injectGrupoId, lecturasController.anularLectura);
router.get('/resumen', authMiddleware, injectGrupoId, lecturasController.getResumenLecturas);
router.get('/historial', authMiddleware, injectGrupoId, lecturasController.getHistorialLecturas);
router.get('/estadisticas-grupo', authMiddleware, injectGrupoId, lecturasController.getEstadisticasGrupo);
router.get('/exportar-grupo', authMiddleware, injectGrupoId, lecturasController.exportarResultadosGrupo);
router.post('/manual', authMiddleware, lecturasController.agregarLecturaManual);  // ← Verifica que existe

module.exports = router;