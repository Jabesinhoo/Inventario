const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const controller = require('../controllers/diferencias.controller');

router.get('/inicial-vs-conteo1', authMiddleware, controller.getInicialVsConteo1);
router.get('/conteo1-vs-conteo2', authMiddleware, controller.getConteo1VsConteo2);

module.exports = router;