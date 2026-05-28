const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const controller = require('../controllers/sku-etiquetas.controller');

router.use(authMiddleware);

router.get('/', controller.getEtiquetas);
router.get('/:sku', controller.getEtiquetaPorSku);
router.post('/upsert', controller.upsertEtiqueta);
router.delete('/:id', controller.deleteEtiqueta);

module.exports = router;