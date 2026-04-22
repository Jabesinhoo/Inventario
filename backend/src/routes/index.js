const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/usuarios', require('./usuarios.routes'));  
router.use('/zonas', require('./zonas.routes'));
router.use('/inventarios', require('./inventarios.routes'));
router.use('/grupos', require('./grupos.routes'));
router.use('/asignaciones', require('./asignaciones.routes'));
router.use('/lecturas', require('./lecturas.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/conteo-inicial', require('./conteoInicial.routes'));
router.use('/diferencias', require('./diferencias.routes'));
router.use('/tercer-conteo', require('./tercerConteo.routes'));
router.use('/rondas', require('./rondas.routes'));
router.use('/asignaciones-ronda', require('./asignacionesRonda.routes'));
router.use('/sqlserver-inventarios', require('./sqlserverInventarios.routes'));
router.use('/exportaciones', require('./exportaciones.routes'));
router.use('/estadisticas', require('./estadisticas.routes'));
router.use('/scripts', require('./scripts.routes'));
router.use('/grupo-miembros', require('./grupoMiembros.routes'));

module.exports = router;