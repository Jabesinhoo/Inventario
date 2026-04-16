const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const controller = require('../controllers/sqlserverInventarios.controller');

router.get('/producto', authMiddleware, controller.buscarProductoExterno);

module.exports = router;