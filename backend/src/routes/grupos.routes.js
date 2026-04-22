const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');
const controller = require('../controllers/grupos.controller');

// ==================== RUTAS PRINCIPALES ====================
router.get('/', authMiddleware, controller.getGrupos);
router.get('/:id', authMiddleware, controller.getGrupo);
router.post('/', authMiddleware, allowRoles('admin', 'supervisor'), controller.createGrupo);
router.put('/:id', authMiddleware, allowRoles('admin', 'supervisor'), controller.updateGrupo);
router.delete('/:id', authMiddleware, allowRoles('admin', 'supervisor'), controller.deleteGrupo);

// ==================== ESTADÍSTICAS ====================
router.get('/:id/estadisticas', authMiddleware, controller.getGrupoEstadisticas);

// ==================== MIEMBROS (tabla intermedia) ====================
router.get('/:grupoId/miembros', authMiddleware, controller.getMiembrosDelGrupo);
router.post('/asignar-usuario', authMiddleware, allowRoles('admin', 'supervisor'), controller.asignarUsuarioAGrupo);
router.post('/remover-usuario', authMiddleware, allowRoles('admin', 'supervisor'), controller.removerUsuarioDeGrupo);
router.get('/:grupoId/usuarios-disponibles', authMiddleware, controller.getUsuariosDisponiblesParaGrupo);
router.get('/:grupoId/lideres-disponibles', authMiddleware, controller.getLideresDisponiblesParaGrupo);

// ==================== RUTAS DE TEST (solo desarrollo) ====================
router.get('/test/usuarios', authMiddleware, controller.testUsuarios);
router.get('/test/:id', authMiddleware, controller.testGrupo);

module.exports = router;