const express = require('express');
const router = express.Router();
const gruposController = require('../controllers/grupos.controller');
const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');

router.get('/', authMiddleware, gruposController.getGrupos);
router.post('/', authMiddleware, allowRoles('admin', 'supervisor'), gruposController.createGrupo);
// Agregar esta ruta
router.get('/:id/estadisticas', authMiddleware, gruposController.getGrupoEstadisticas);
module.exports = router;