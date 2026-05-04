const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const allowRoles = require('../middleware/role.middleware');
const controller = require('../controllers/diferencias.controller');

// Rutas principales
router.get('/', authMiddleware, controller.compareInventarios);
router.get('/exportar', authMiddleware, controller.exportarComparacionExcel);
router.post('/exportar', authMiddleware, controller.exportarComparacionExcel); // Soporte POST para cantidades aceptadas
router.post('/reconteo', authMiddleware, allowRoles('admin', 'supervisor'), controller.generarReconteoDesdeComparacion);
router.patch('/parejas/:parejaId/completar', authMiddleware, allowRoles('admin', 'supervisor'), controller.completarPareja);

// Rutas de parejas
router.get('/parejas', authMiddleware, allowRoles('admin', 'supervisor'), async (req, res, next) => {
  try {
    const { estado, limit } = req.query;
    const { ParejaInventario, Inventario, Zona } = require('../models');
    
    const where = {};
    if (estado && estado !== 'todas') where.estado = estado;
    
    const parejas = await ParejaInventario.findAll({
      where,
      include: [
        { model: Inventario, as: 'inventarioBase' },
        { model: Inventario, as: 'inventarioComparado' },
        { model: Zona, as: 'zona' }
      ],
      order: [['createdAt', 'DESC']],
      limit: limit ? Number(limit) : 100
    });
    
    res.json({ ok: true, data: parejas });
  } catch (error) {
    next(error);
  }
});

router.post('/parejas', authMiddleware, allowRoles('admin', 'supervisor'), async (req, res, next) => {
  try {
    const { inventarioBaseId, inventarioComparadoId, zonaId, estado, observaciones } = req.body;
    const { ParejaInventario } = require('../models');
    
    if (!inventarioBaseId || !inventarioComparadoId) {
      return res.status(400).json({ ok: false, message: 'Faltan inventarios' });
    }
    
    if (inventarioBaseId === inventarioComparadoId) {
      return res.status(400).json({ ok: false, message: 'No puedes crear una pareja con el mismo inventario' });
    }
    
    const [pareja, created] = await ParejaInventario.findOrCreate({
      where: { 
        inventarioBaseId, 
        inventarioComparadoId, 
        zonaId: zonaId || null 
      },
      defaults: {
        inventarioBaseId,
        inventarioComparadoId,
        zonaId: zonaId || null,
        estado: estado || 'pendiente',
        observaciones: observaciones || null,
        fechaComparacion: new Date(),
        rondasReconteoGeneradas: 0
      }
    });
    
    if (!created && estado) {
      await pareja.update({ estado, observaciones });
    }
    
    res.json({ ok: true, data: pareja });
  } catch (error) {
    next(error);
  }
});

router.put('/parejas/:id', authMiddleware, allowRoles('admin', 'supervisor'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { ParejaInventario } = require('../models');
    
    const pareja = await ParejaInventario.findByPk(id);
    if (!pareja) {
      return res.status(404).json({ ok: false, message: 'Pareja no encontrada' });
    }
    
    await pareja.update(req.body);
    res.json({ ok: true, data: pareja });
  } catch (error) {
    next(error);
  }
});

router.delete('/parejas/:id', authMiddleware, allowRoles('admin', 'supervisor'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { ParejaInventario } = require('../models');
    
    const pareja = await ParejaInventario.findByPk(id);
    if (!pareja) {
      return res.status(404).json({ ok: false, message: 'Pareja no encontrada' });
    }
    
    await pareja.destroy();
    res.json({ ok: true, message: 'Pareja eliminada correctamente' });
  } catch (error) {
    next(error);
  }
});

router.get('/parejas/:id', authMiddleware, allowRoles('admin', 'supervisor'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { ParejaInventario, Inventario, Zona } = require('../models');
    
    const pareja = await ParejaInventario.findByPk(id, {
      include: [
        { model: Inventario, as: 'inventarioBase' },
        { model: Inventario, as: 'inventarioComparado' },
        { model: Zona, as: 'zona' }
      ]
    });
    
    if (!pareja) {
      return res.status(404).json({ ok: false, message: 'Pareja no encontrada' });
    }
    
    res.json({ ok: true, data: pareja });
  } catch (error) {
    next(error);
  }
});

module.exports = router;