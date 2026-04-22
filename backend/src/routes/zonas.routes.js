const express = require('express');
const router = express.Router();
const zonasController = require('../controllers/zonas.controller');
const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');

router.get('/', authMiddleware, zonasController.getZonas);
router.post('/', authMiddleware, allowRoles('admin', 'supervisor'), zonasController.createZona);
router.put('/:id', authMiddleware, allowRoles('admin', 'supervisor'), zonasController.updateZona);
router.delete('/:id', authMiddleware, allowRoles('admin', 'supervisor'), zonasController.deleteZona);

module.exports = router;