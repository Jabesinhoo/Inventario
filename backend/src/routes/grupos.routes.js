const express = require('express');
const router = express.Router();
const gruposController = require('../controllers/grupos.controller');
const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');

router.get('/', authMiddleware, gruposController.getGrupos);
router.get('/:id', authMiddleware, gruposController.getGrupo);
router.get('/:id/estadisticas', authMiddleware, gruposController.getGrupoEstadisticas);
router.post('/', authMiddleware, allowRoles('admin', 'supervisor'), gruposController.createGrupo);
router.put('/:id', authMiddleware, allowRoles('admin', 'supervisor'), gruposController.updateGrupo);
router.delete('/:id', authMiddleware, allowRoles('admin', 'supervisor'), gruposController.deleteGrupo);
router.post('/asignar-usuario', authMiddleware, allowRoles('admin', 'supervisor'), gruposController.asignarUsuario);

module.exports = router;