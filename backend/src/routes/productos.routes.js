const express = require('express');
const router = express.Router();
const productosController = require('../controllers/productos.controller');
const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');
const { uploadExcel } = require('../middleware/upload.middleware');

router.get('/', authMiddleware, productosController.getProductos);

router.post(
  '/',
  authMiddleware,
  allowRoles('admin', 'supervisor'),
  productosController.createProducto
);

router.post(
  '/import-excel',
  authMiddleware,
  allowRoles('admin', 'supervisor'),
  uploadExcel.single('file'),
  productosController.importProductosExcel
);

module.exports = router;