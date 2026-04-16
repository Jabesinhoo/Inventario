const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/zonas', require('./zonas.routes'));
router.use('/inventarios', require('./inventarios.routes'));
router.use('/grupos', require('./grupos.routes'));
router.use('/productos', require('./productos.routes'));
router.use('/asignaciones', require('./asignaciones.routes'));
router.use('/lecturas', require('./lecturas.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/conteo-inicial', require('./conteoInicial.routes'));
router.use('/diferencias', require('./diferencias.routes'));
router.use('/tercer-conteo', require('./tercerConteo.routes'));
router.use('/rondas', require('./rondas.routes'));
router.use('/asignaciones-ronda', require('./asignacionesRonda.routes'));
router.use('/sqlserver-inventarios', require('./sqlserverInventarios.routes'));
module.exports = router;