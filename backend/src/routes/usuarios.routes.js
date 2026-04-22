const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');
const controller = require('../controllers/usuarios.controller');

router.get('/', authMiddleware, allowRoles('admin'), controller.getUsuarios);
router.get('/:id', authMiddleware, allowRoles('admin'), controller.getUsuario);
router.post('/', authMiddleware, allowRoles('admin'), controller.createUsuario);
router.put('/:id', authMiddleware, allowRoles('admin'), controller.updateUsuario);
router.delete('/:id', authMiddleware, allowRoles('admin'), controller.deleteUsuario);

module.exports = router;