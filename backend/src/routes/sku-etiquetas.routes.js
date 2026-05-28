const express = require('express');
const router = express.Router();

console.log('✅ sku-etiquetas.routes.js cargado');

const authMiddleware = require('../middleware/auth.middleware');
const etiquetasController = require('../controllers/etiqueta.controller');

console.log('✅ etiqueta.controller cargado:', {
  getEtiquetas: typeof etiquetasController.getEtiquetas,
  getEtiquetaPorSku: typeof etiquetasController.getEtiquetaPorSku,
  upsertEtiqueta: typeof etiquetasController.upsertEtiqueta,
  deleteEtiqueta: typeof etiquetasController.deleteEtiqueta
});

router.use((req, res, next) => {
  console.log('🏷️ Entró a sku-etiquetas router:', req.method, req.originalUrl);
  next();
});

router.use(authMiddleware);

router.get('/', etiquetasController.getEtiquetas);
router.post('/upsert', etiquetasController.upsertEtiqueta);
router.get('/:sku', etiquetasController.getEtiquetaPorSku);
router.delete('/:id', etiquetasController.deleteEtiqueta);

module.exports = router;
