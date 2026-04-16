const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const controller = require('../controllers/tercerConteo.controller');

router.get('/resumen', authMiddleware, controller.getResumenTercerConteo);

module.exports = router;