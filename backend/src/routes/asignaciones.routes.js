const express = require('express');
const router = express.Router();
const asignacionesController = require('../controllers/asignaciones.controller');
const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');

router.get('/', authMiddleware, asignacionesController.getAsignaciones);
router.post('/', authMiddleware, allowRoles('admin', 'supervisor'), asignacionesController.createAsignacion);

module.exports = router;