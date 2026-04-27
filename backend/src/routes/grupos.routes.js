const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');

const {
  getGrupos,
  getGrupo,
  createGrupo,
  updateGrupo,
  deleteGrupo,
  getGrupoEstadisticas,
  getMiembrosDelGrupo,
  asignarUsuarioAGrupo,
  removerUsuarioDeGrupo,
  getUsuariosDisponiblesParaGrupo,
  getLideresDisponiblesParaGrupo
} = require('../controllers/grupos.controller');

// CRUD
router.get('/', authMiddleware, getGrupos);
router.get('/:id', authMiddleware, getGrupo);
router.post('/', authMiddleware, allowRoles('admin', 'supervisor'), createGrupo);
router.put('/:id', authMiddleware, allowRoles('admin', 'supervisor'), updateGrupo);
router.delete('/:id', authMiddleware, allowRoles('admin', 'supervisor'), deleteGrupo);

// Estadísticas
router.get('/:id/estadisticas', authMiddleware, getGrupoEstadisticas);

// Miembros
router.get('/:grupoId/miembros', authMiddleware, getMiembrosDelGrupo);
router.post(
  '/asignar-usuario',
  authMiddleware,
  allowRoles('admin', 'supervisor'),
  asignarUsuarioAGrupo
);
router.post(
  '/remover-usuario',
  authMiddleware,
  allowRoles('admin', 'supervisor'),
  removerUsuarioDeGrupo
);
router.get('/:grupoId/usuarios-disponibles', authMiddleware, getUsuariosDisponiblesParaGrupo);
router.get('/:grupoId/lideres-disponibles', authMiddleware, getLideresDisponiblesParaGrupo);

module.exports = router;