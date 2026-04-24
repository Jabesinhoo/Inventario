const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const controller = require('../controllers/diferencias.controller');

router.get('/', authMiddleware, controller.compareInventarios);
router.get('/exportar', authMiddleware, controller.exportarComparacionExcel);

module.exports = router;