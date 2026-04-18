const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { injectGrupoId } = require('../middleware/grupo.middleware'); 
const allowRoles = require('../middleware/role.middleware');
const controller = require('../controllers/rondas.controller');

router.get('/', authMiddleware, injectGrupoId, controller.getRondas);
router.post('/', authMiddleware, allowRoles('admin', 'supervisor'), controller.createRonda);
router.get('/:id/pendientes', authMiddleware, injectGrupoId, controller.getPendientesRonda);
router.post('/:id/conciliar', authMiddleware, allowRoles('admin', 'supervisor'), controller.conciliarRonda);
router.patch('/:id/iniciar', authMiddleware, injectGrupoId, controller.iniciarRonda);
router.patch('/:id/pausar', authMiddleware, injectGrupoId, controller.pausarRonda);
router.patch('/:id/reanudar', authMiddleware, injectGrupoId, controller.reanudarRonda);
router.patch('/:id/cerrar', authMiddleware, allowRoles('admin', 'supervisor'), controller.cerrarRonda);
router.get('/activa', authMiddleware, controller.getRondaActivaDelGrupo);
module.exports = router;