const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');
const controller = require('../controllers/usuarios.controller');

router.get('/', authMiddleware, allowRoles('admin'), controller.getUsuarios);
router.get('/roles', authMiddleware, allowRoles('admin'), controller.getRoles);
router.post('/', authMiddleware, allowRoles('admin'), controller.createUsuario);
router.put('/:id', authMiddleware, allowRoles('admin'), controller.updateUsuario);
router.patch('/:id/estado', authMiddleware, allowRoles('admin'), controller.updateEstadoUsuario);

module.exports = router;