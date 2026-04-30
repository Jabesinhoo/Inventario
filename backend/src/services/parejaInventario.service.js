const { ParejaInventario, Inventario, Zona } = require('../models');

async function crearOPareja(inventarioBaseId, inventarioComparadoId, zonaId = null) {
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
      estado: 'pendiente',
      fechaComparacion: new Date()
    }
  });

  return pareja;
}

async function actualizarEstadoPareja(parejaId, estado, fechaCompletada = null) {
  const pareja = await ParejaInventario.findByPk(parejaId);
  if (!pareja) throw new Error('Pareja no encontrada');

  pareja.estado = estado;
  if (fechaCompletada) pareja.fechaCompletada = fechaCompletada;
  await pareja.save();

  return pareja;
}

async function actualizarPorInventarios(inventarioBaseId, inventarioComparadoId, zonaId, estado) {
  const pareja = await ParejaInventario.findOne({
    where: {
      inventarioBaseId,
      inventarioComparadoId,
      zonaId: zonaId || null
    }
  });

  if (pareja) {
    pareja.estado = estado;
    if (estado === 'completada') pareja.fechaCompletada = new Date();
    await pareja.save();
  }

  return pareja;
}

async function getParejaPorInventarios(inventarioBaseId, inventarioComparadoId, zonaId = null) {
  return await ParejaInventario.findOne({
    where: {
      inventarioBaseId,
      inventarioComparadoId,
      zonaId: zonaId || null
    },
    include: [
      { model: Inventario, as: 'inventarioBase' },
      { model: Inventario, as: 'inventarioComparado' },
      { model: Zona, as: 'zona' }
    ]
  });
}

async function getParejasPendientes() {
  return await ParejaInventario.findAll({
    where: { estado: 'pendiente' },
    include: [
      { model: Inventario, as: 'inventarioBase' },
      { model: Inventario, as: 'inventarioComparado' },
      { model: Zona, as: 'zona' }
    ],
    order: [['fechaComparacion', 'ASC']]
  });
}

async function getParejasCompletadas(limit = 10) {
  return await ParejaInventario.findAll({
    where: { estado: 'completada' },
    include: [
      { model: Inventario, as: 'inventarioBase' },
      { model: Inventario, as: 'inventarioComparado' },
      { model: Zona, as: 'zona' }
    ],
    order: [['fechaCompletada', 'DESC']],
    limit
  });
}

module.exports = {
  crearOPareja,
  actualizarEstadoPareja,
  actualizarPorInventarios,
  getParejaPorInventarios,
  getParejasPendientes,
  getParejasCompletadas
};