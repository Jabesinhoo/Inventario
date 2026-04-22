const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');
const controller = require('../controllers/grupoMiembros.controller');

router.get('/:grupoId/miembros', authMiddleware, controller.getMiembrosDelGrupo);
router.get('/:grupoId/usuarios-disponibles', authMiddleware, controller.getUsuariosDisponiblesParaGrupo);
router.post('/asignar', authMiddleware, allowRoles('admin', 'supervisor'), controller.asignarUsuarioAGrupo);
router.post('/remover', authMiddleware, allowRoles('admin', 'supervisor'), controller.removerUsuarioDeGrupo);

module.exports = router;