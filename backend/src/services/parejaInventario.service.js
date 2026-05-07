const { Op } = require('sequelize');
const { ParejaInventario, Inventario, Zona } = require('../models');

function normalizeZonaId(zonaId = null) {
  return zonaId ? Number(zonaId) : null;
}

async function findParejaFlexible(inventarioBaseId, inventarioComparadoId, zonaId = null, transaction = null) {
  const zonaNormalizada = normalizeZonaId(zonaId);

  // 1) Coincidencia exacta, que es la deseada cuando el esquema permite pareja por zona.
  let pareja = await ParejaInventario.findOne({
    where: {
      inventarioBaseId,
      inventarioComparadoId,
      zonaId: zonaNormalizada
    },
    transaction
  });

  if (pareja) return pareja;

  // 2) Misma pareja, aunque tenga zona distinta o null.
  pareja = await ParejaInventario.findOne({
    where: {
      [Op.or]: [
        { inventarioBaseId, inventarioComparadoId },
        { inventarioBaseId: inventarioComparadoId, inventarioComparadoId: inventarioBaseId }
      ]
    },
    order: [['updatedAt', 'DESC']],
    transaction
  });

  if (pareja) return pareja;

  // 3) Compatibilidad con bases de datos que tienen UNIQUE solo sobre inventarioBaseId.
  pareja = await ParejaInventario.findOne({
    where: { inventarioBaseId },
    order: [['updatedAt', 'DESC']],
    transaction
  });

  if (pareja) return pareja;

  pareja = await ParejaInventario.findOne({
    where: { inventarioBaseId: inventarioComparadoId },
    order: [['updatedAt', 'DESC']],
    transaction
  });

  return pareja;
}

async function safeUpdatePareja(pareja, values, transaction = null) {
  try {
    await pareja.update(values, { transaction });
  } catch (error) {
    // Si el esquema tiene restricciones únicas antiguas, evita romper el flujo principal.
    // Mantiene el registro existente y solo actualiza metadatos seguros.
    if (error?.name !== 'SequelizeUniqueConstraintError') throw error;

    const safeValues = {
      estado: values.estado || pareja.estado || 'pendiente',
      fechaComparacion: values.fechaComparacion || new Date()
    };

    if (values.fechaCompletada !== undefined) {
      safeValues.fechaCompletada = values.fechaCompletada;
    }

    if (values.rondasReconteoGeneradas !== undefined) {
      safeValues.rondasReconteoGeneradas = values.rondasReconteoGeneradas;
    }

    await pareja.update(safeValues, { transaction });
  }

  return pareja;
}

async function crearOPareja(inventarioBaseId, inventarioComparadoId, zonaId = null, options = {}) {
  const transaction = options.transaction || null;
  const zonaNormalizada = normalizeZonaId(zonaId);

  const baseId = Number(inventarioBaseId);
  const comparadoId = Number(inventarioComparadoId);

  let pareja = await findParejaFlexible(baseId, comparadoId, zonaNormalizada, transaction);

  if (pareja) {
    await safeUpdatePareja(
      pareja,
      {
        inventarioBaseId: baseId,
        inventarioComparadoId: comparadoId,
        zonaId: zonaNormalizada,
        estado: pareja.estado || 'pendiente',
        fechaComparacion: new Date()
      },
      transaction
    );

    return pareja;
  }

  try {
    pareja = await ParejaInventario.create(
      {
        inventarioBaseId: baseId,
        inventarioComparadoId: comparadoId,
        zonaId: zonaNormalizada,
        estado: 'pendiente',
        fechaComparacion: new Date()
      },
      { transaction }
    );

    return pareja;
  } catch (error) {
    // Fallback para esquemas con UNIQUE solo en inventarioBaseId.
    if (error?.name !== 'SequelizeUniqueConstraintError') throw error;

    pareja = await findParejaFlexible(baseId, comparadoId, zonaNormalizada, transaction);

    if (!pareja) throw error;

    await safeUpdatePareja(
      pareja,
      {
        inventarioBaseId: baseId,
        inventarioComparadoId: comparadoId,
        zonaId: zonaNormalizada,
        estado: pareja.estado || 'pendiente',
        fechaComparacion: new Date()
      },
      transaction
    );

    return pareja;
  }
}

async function actualizarEstadoPareja(parejaId, estado, fechaCompletada = null, options = {}) {
  const transaction = options.transaction || null;
  const pareja = await ParejaInventario.findByPk(parejaId, { transaction });
  if (!pareja) throw new Error('Pareja no encontrada');

  const values = { estado };
  if (fechaCompletada) values.fechaCompletada = fechaCompletada;

  await pareja.update(values, { transaction });

  return pareja;
}

async function actualizarPorInventarios(inventarioBaseId, inventarioComparadoId, zonaId, estado, options = {}) {
  const transaction = options.transaction || null;
  const pareja = await findParejaFlexible(
    Number(inventarioBaseId),
    Number(inventarioComparadoId),
    normalizeZonaId(zonaId),
    transaction
  );

  if (pareja) {
    const values = { estado };
    if (estado === 'completada') values.fechaCompletada = new Date();
    await pareja.update(values, { transaction });
  }

  return pareja;
}

async function getParejaPorInventarios(inventarioBaseId, inventarioComparadoId, zonaId = null) {
  const pareja = await findParejaFlexible(
    Number(inventarioBaseId),
    Number(inventarioComparadoId),
    normalizeZonaId(zonaId)
  );

  if (!pareja) return null;

  return ParejaInventario.findByPk(pareja.id, {
    include: [
      { model: Inventario, as: 'inventarioBase' },
      { model: Inventario, as: 'inventarioComparado' },
      { model: Zona, as: 'zona' }
    ]
  });
}

async function getParejasPendientes() {
  return ParejaInventario.findAll({
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
  return ParejaInventario.findAll({
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
