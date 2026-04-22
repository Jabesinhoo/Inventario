const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const controller = require('../controllers/diferencias.controller');

router.get('/comparar-inventarios', authMiddleware, controller.compareInventarios);
router.post('/generar-reconteo', authMiddleware, controller.generarRondaReconteoDesdeComparacion);
router.post('/ajuste-manual', authMiddleware, controller.updateDiscrepanciaManual);

module.exports = router;