const express = require('express');
const router = express.Router();
const inventariosController = require('../controllers/inventarios.controller');
const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');

router.get('/', authMiddleware, inventariosController.getInventarios);
router.post('/', authMiddleware, allowRoles('admin', 'supervisor'), inventariosController.createInventario);

module.exports = router;