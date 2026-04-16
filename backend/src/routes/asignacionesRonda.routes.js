const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');
const controller = require('../controllers/asignacionesRonda.controller');

router.get('/', authMiddleware, controller.getAsignacionesRonda);
router.post('/', authMiddleware, allowRoles('admin', 'supervisor'), controller.createAsignacionRonda);

module.exports = router;