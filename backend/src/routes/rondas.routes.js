const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');
const controller = require('../controllers/rondas.controller');

router.get('/', authMiddleware, controller.getRondas);
router.post('/', authMiddleware, allowRoles('admin', 'supervisor'), controller.createRonda);
router.get('/:id/pendientes', authMiddleware, controller.getPendientesRonda);
router.post('/:id/conciliar', authMiddleware, allowRoles('admin', 'supervisor'), controller.conciliarRonda);
router.patch('/:id/cerrar', authMiddleware, allowRoles('admin', 'supervisor'), controller.cerrarRonda);

module.exports = router;