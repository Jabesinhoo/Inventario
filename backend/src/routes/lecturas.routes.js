const express = require('express');
const router = express.Router();
const lecturasController = require('../controllers/lecturas.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.post('/scan', authMiddleware, lecturasController.scanLectura);
router.post('/scan-ronda', authMiddleware, lecturasController.scanLecturaRonda);
router.get('/resumen', authMiddleware, lecturasController.getResumenLecturas);
router.get('/historial', authMiddleware, lecturasController.getHistorialLecturas);

module.exports = router;