const Joi = require('joi');
const { QueryTypes } = require('sequelize');
const {
  sequelize,
  Op,
  RondaConteo,
  Inventario,
  Zona,
  AsignacionRonda,
  Grupo,
  DiscrepanciaConteo,
  Lectura
} = require('../models');

// ==================== SCHEMAS ====================

const createRondaSchema = Joi.object({
  inventarioId: Joi.number().integer().required(),
  zonaId: Joi.number().integer().required(),
  numeroRonda: Joi.number().integer().min(1).required(),
  tipoRonda: Joi.string().valid('completa', 'reconteo').required(),
  generadaDesdeRondaId: Joi.number().integer().allow(null),
  observaciones: Joi.string().allow(null, '')
});

// ==================== HELPERS ====================

async function getRoundQtyMap(rondaId, transaction) {
  const rows = await sequelize.query(
    `
    SELECT
      l.sku,
      MAX(l."descripcionSnapshot") AS descripcion,
      MAX(l."productoId") AS "productoId",
      COALESCE(SUM(l.cantidad), 0)::int AS cantidad
    FROM lecturas l
    WHERE l."rondaId" = :rondaId
      AND l.estado = 'valida'
    GROUP BY l.sku
    `,
    {
      replacements: { rondaId },
      type: QueryTypes.SELECT,
      transaction
    }
  );

  const map = new Map();

  for (const row of rows) {
    map.set(row.sku, {
      sku: row.sku,
      descripcion: row.descripcion,
      productoId: row.productoId,
      cantidad: Number(row.cantidad || 0)
    });
  }

  return map;
}

// ==================== CRUD BÁSICO ====================

async function createRonda(req, res, next) {
  try {
    const { error, value } = createRondaSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const [inventario, zona] = await Promise.all([
      Inventario.findByPk(value.inventarioId),
      Zona.findByPk(value.zonaId)
    ]);

    if (!inventario) {
      return res.status(404).json({ ok: false, message: 'Inventario no encontrado' });
    }

    if (!zona) {
      return res.status(404).json({ ok: false, message: 'Zona no encontrada' });
    }

    const existente = await RondaConteo.findOne({
      where: {
        inventarioId: value.inventarioId,
        zonaId: value.zonaId,
        numeroRonda: value.numeroRonda
      }
    });

    if (existente) {
      return res.status(400).json({
        ok: false,
        message: 'Ya existe esa ronda para ese inventario y zona'
      });
    }

    const ronda = await RondaConteo.create({
      ...value,
      estado: 'borrador',
      generadaDesdeRondaId: value.generadaDesdeRondaId || null,
      observaciones: value.observaciones || null
    });

    res.status(201).json({
      ok: true,
      data: ronda
    });
  } catch (error) {
    next(error);
  }
}

async function getRondas(req, res, next) {
  try {
    const { inventarioId, zonaId, estado, grupoId } = req.query;

    const where = {};
    if (inventarioId) where.inventarioId = inventarioId;
    if (zonaId) where.zonaId = zonaId;
    if (estado) where.estado = estado;

    const include = [
      { model: Zona, as: 'zona', attributes: ['id', 'nombre', 'codigo'] },
      {
        model: AsignacionRonda,
        as: 'asignacion',
        required: false,
        include: [{ model: Grupo, as: 'grupo', attributes: ['id', 'nombre'] }]
      }
    ];

    // Si se filtra por grupo específico
    if (grupoId) {
      include[1].required = true;
      include[1].where = { grupoId };
    }

    // 🔒 AISLAMIENTO: si no es admin/supervisor, solo ve sus rondas
    if (!req.canViewAllGroups && req.grupoId) {
      include[1].required = true;
      include[1].where = { grupoId: req.grupoId };
    }

    const data = await RondaConteo.findAll({
      where,
      include,
      order: [['zonaId', 'ASC'], ['numeroRonda', 'ASC']]
    });

    res.json({
      ok: true,
      data
    });
  } catch (error) {
    next(error);
  }
}

// ==================== CONTROL DE ESTADO ====================

async function iniciarRonda(req, res, next) {
  try {
    const ronda = await RondaConteo.findByPk(req.params.id);

    if (!ronda) {
      return res.status(404).json({ ok: false, message: 'Ronda no encontrada' });
    }

    // Verificar acceso
    if (!req.canViewAllGroups && req.grupoId) {
      const asignacion = await AsignacionRonda.findOne({
        where: { rondaId: ronda.id, grupoId: req.grupoId }
      });
      if (!asignacion) {
        return res.status(403).json({ ok: false, message: 'No tienes acceso a esta ronda' });
      }
    }

    if (ronda.estado !== 'borrador' && ronda.estado !== 'pausada') {
      return res.status(400).json({
        ok: false,
        message: `No se puede iniciar una ronda en estado ${ronda.estado}`
      });
    }

    await ronda.update({ estado: 'activa' });

    res.json({
      ok: true,
      data: ronda,
      message: 'Ronda iniciada correctamente'
    });
  } catch (error) {
    next(error);
  }
}

async function pausarRonda(req, res, next) {
  try {
    const ronda = await RondaConteo.findByPk(req.params.id);

    if (!ronda) {
      return res.status(404).json({ ok: false, message: 'Ronda no encontrada' });
    }

    // Verificar acceso
    if (!req.canViewAllGroups && req.grupoId) {
      const asignacion = await AsignacionRonda.findOne({
        where: { rondaId: ronda.id, grupoId: req.grupoId }
      });
      if (!asignacion) {
        return res.status(403).json({ ok: false, message: 'No tienes acceso a esta ronda' });
      }
    }

    if (ronda.estado !== 'activa') {
      return res.status(400).json({
        ok: false,
        message: `No se puede pausar una ronda en estado ${ronda.estado}`
      });
    }

    await ronda.update({ estado: 'pausada' });

    res.json({
      ok: true,
      data: ronda,
      message: 'Ronda pausada correctamente'
    });
  } catch (error) {
    next(error);
  }
}

async function reanudarRonda(req, res, next) {
  try {
    const ronda = await RondaConteo.findByPk(req.params.id);

    if (!ronda) {
      return res.status(404).json({ ok: false, message: 'Ronda no encontrada' });
    }

    // Verificar acceso
    if (!req.canViewAllGroups && req.grupoId) {
      const asignacion = await AsignacionRonda.findOne({
        where: { rondaId: ronda.id, grupoId: req.grupoId }
      });
      if (!asignacion) {
        return res.status(403).json({ ok: false, message: 'No tienes acceso a esta ronda' });
      }
    }

    if (ronda.estado !== 'pausada') {
      return res.status(400).json({
        ok: false,
        message: `No se puede reanudar una ronda en estado ${ronda.estado}`
      });
    }

    await ronda.update({ estado: 'activa' });

    res.json({
      ok: true,
      data: ronda,
      message: 'Ronda reanudada correctamente'
    });
  } catch (error) {
    next(error);
  }
}

async function cerrarRonda(req, res, next) {
  try {
    const ronda = await RondaConteo.findByPk(req.params.id);

    if (!ronda) {
      return res.status(404).json({ ok: false, message: 'Ronda no encontrada' });
    }

    // Verificar acceso (solo admin/supervisor puede cerrar)
    if (!req.canViewAllGroups) {
      return res.status(403).json({
        ok: false,
        message: 'Solo administradores o supervisores pueden cerrar rondas'
      });
    }

    if (ronda.estado !== 'activa' && ronda.estado !== 'pausada') {
      return res.status(400).json({
        ok: false,
        message: `No se puede cerrar una ronda en estado ${ronda.estado}`
      });
    }

    await ronda.update({ estado: 'cerrada' });

    res.json({
      ok: true,
      data: ronda,
      message: 'Ronda cerrada correctamente'
    });
  } catch (error) {
    next(error);
  }
}

// ==================== CONCILIACIÓN AUTOMÁTICA ====================

async function getPendientesRonda(req, res, next) {
  try {
    const rondaId = Number(req.params.id);

    const ronda = await RondaConteo.findByPk(rondaId, {
      include: [{ model: Zona, as: 'zona', attributes: ['id', 'nombre', 'codigo'] }]
    });

    if (!ronda) {
      return res.status(404).json({ ok: false, message: 'Ronda no encontrada' });
    }

    // Verificar acceso
    if (!req.canViewAllGroups && req.grupoId) {
      const asignacion = await AsignacionRonda.findOne({
        where: { rondaId: ronda.id, grupoId: req.grupoId }
      });
      if (!asignacion) {
        return res.status(403).json({ ok: false, message: 'No tienes acceso a esta ronda' });
      }
    }

    const data = await DiscrepanciaConteo.findAll({
      where: {
        inventarioId: ronda.inventarioId,
        zonaId: ronda.zonaId,
        proximaRondaNumero: ronda.numeroRonda,
        estado: {
          [Op.in]: ['pendiente_reconteo', 'reconteo_en_proceso']
        }
      },
      order: [['diferencia', 'DESC'], ['sku', 'ASC']]
    });

    res.json({
      ok: true,
      data: {
        ronda: {
          id: ronda.id,
          numeroRonda: ronda.numeroRonda,
          tipoRonda: ronda.tipoRonda,
          estado: ronda.estado,
          zona: ronda.zona
        },
        pendientes: data
      }
    });
  } catch (error) {
    next(error);
  }
}

async function conciliarRonda(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const rondaId = Number(req.params.id);

    const rondaActual = await RondaConteo.findByPk(rondaId, { transaction });

    if (!rondaActual) {
      await transaction.rollback();
      return res.status(404).json({ ok: false, message: 'Ronda no encontrada' });
    }

    // Solo admin/supervisor puede conciliar
    if (!req.canViewAllGroups) {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'Solo administradores o supervisores pueden conciliar rondas'
      });
    }

    if (rondaActual.numeroRonda === 1) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'La ronda 1 no se concilia contra sí misma'
      });
    }

    const rondaBase = await RondaConteo.findOne({
      where: {
        inventarioId: rondaActual.inventarioId,
        zonaId: rondaActual.zonaId,
        numeroRonda: 1
      },
      transaction
    });

    if (!rondaBase) {
      await transaction.rollback();
      return res.status(400).json({ ok: false, message: 'No existe ronda 1 para esa zona' });
    }

    const baseMap = await getRoundQtyMap(rondaBase.id, transaction);
    const actualMap = await getRoundQtyMap(rondaActual.id, transaction);

    let skusEvaluar = [];

    if (rondaActual.numeroRonda === 2) {
      skusEvaluar = Array.from(new Set([...baseMap.keys(), ...actualMap.keys()]));
    } else {
      const pendientes = await DiscrepanciaConteo.findAll({
        where: {
          inventarioId: rondaActual.inventarioId,
          zonaId: rondaActual.zonaId,
          proximaRondaNumero: rondaActual.numeroRonda,
          estado: { [Op.in]: ['pendiente_reconteo', 'reconteo_en_proceso'] }
        },
        transaction
      });
      skusEvaluar = pendientes.map((item) => item.sku);
    }

    if (skusEvaluar.length === 0) {
      await rondaActual.update({ estado: 'cerrada' }, { transaction });
      await transaction.commit();
      return res.json({
        ok: true,
        message: 'No había SKUs pendientes para conciliar en esta ronda',
        data: {
          rondaId: rondaActual.id,
          numeroRonda: rondaActual.numeroRonda,
          conciliados: 0,
          pendientes: 0,
          siguienteRonda: null
        }
      });
    }

    const nextRoundNumber = rondaActual.numeroRonda + 1;
    let conciliados = 0;
    let pendientes = 0;

    for (const sku of skusEvaluar) {
      const base = baseMap.get(sku) || { sku, descripcion: null, productoId: null, cantidad: 0 };
      const actual = actualMap.get(sku) || { sku, descripcion: null, productoId: null, cantidad: 0 };

      const cantidadBase = Number(base.cantidad || 0);
      const cantidadActual = Number(actual.cantidad || 0);
      const diferencia = Math.abs(cantidadBase - cantidadActual);

      const payloadBase = {
        inventarioId: rondaActual.inventarioId,
        zonaId: rondaActual.zonaId,
        productoId: actual.productoId || base.productoId || null,
        sku,
        descripcionSnapshot: actual.descripcion || base.descripcion || null,
        rondaBaseId: rondaBase.id,
        ultimaRondaId: rondaActual.id,
        cantidadBase,
        cantidadUltima: cantidadActual,
        diferencia
      };

      const existente = await DiscrepanciaConteo.findOne({
        where: { inventarioId: rondaActual.inventarioId, zonaId: rondaActual.zonaId, sku },
        transaction
      });

      if (diferencia === 0) {
        conciliados += 1;
        const payload = {
          ...payloadBase,
          estado: 'conciliado',
          proximaRondaNumero: null,
          cantidadFinal: cantidadBase,
          criterioCierre: `ronda_1_igual_ronda_${rondaActual.numeroRonda}`,
          cerradoEn: new Date()
        };
        if (existente) {
          await existente.update(payload, { transaction });
        } else {
          await DiscrepanciaConteo.create(payload, { transaction });
        }
      } else {
        pendientes += 1;
        const payload = {
          ...payloadBase,
          estado: 'pendiente_reconteo',
          proximaRondaNumero: nextRoundNumber,
          cantidadFinal: null,
          criterioCierre: null,
          cerradoEn: null
        };
        if (existente) {
          await existente.update(payload, { transaction });
        } else {
          await DiscrepanciaConteo.create(payload, { transaction });
        }
      }
    }

    let siguienteRonda = null;

    if (pendientes > 0) {
      const [ronda] = await RondaConteo.findOrCreate({
        where: {
          inventarioId: rondaActual.inventarioId,
          zonaId: rondaActual.zonaId,
          numeroRonda: nextRoundNumber
        },
        defaults: {
          tipoRonda: 'reconteo',
          estado: 'borrador',
          generadaDesdeRondaId: rondaActual.id,
          observaciones: `Generada automáticamente por discrepancias de la ronda ${rondaActual.numeroRonda}`
        },
        transaction
      });
      siguienteRonda = ronda;
    }

    await rondaActual.update({ estado: 'cerrada' }, { transaction });
    await transaction.commit();

    res.json({
      ok: true,
      message: 'Ronda conciliada correctamente',
      data: {
        rondaId: rondaActual.id,
        numeroRonda: rondaActual.numeroRonda,
        conciliados,
        pendientes,
        siguienteRonda: siguienteRonda ? {
          id: siguienteRonda.id,
          numeroRonda: siguienteRonda.numeroRonda,
          tipoRonda: siguienteRonda.tipoRonda,
          estado: siguienteRonda.estado
        } : null
      }
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

// ==================== AJUSTE MANUAL DE CANTIDAD ====================

const ajusteManualSchema = Joi.object({
  sku: Joi.string().required(),
  cantidadFinal: Joi.number().integer().min(0).required(),
  observacion: Joi.string().allow(null, '')
});

async function ajusteManual(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const { error, value } = ajusteManualSchema.validate(req.body);
    if (error) {
      await transaction.rollback();
      return res.status(400).json({ ok: false, message: error.details[0].message });
    }

    const discrepancia = await DiscrepanciaConteo.findOne({
      where: {
        inventarioId: req.params.inventarioId,
        zonaId: req.params.zonaId,
        sku: value.sku
      },
      transaction
    });

    if (!discrepancia) {
      await transaction.rollback();
      return res.status(404).json({ ok: false, message: 'Discrepancia no encontrada' });
    }

    await discrepancia.update({
      cantidadFinal: value.cantidadFinal,
      estado: 'conciliado_manual',
      criterioCierre: 'manual',
      cerradoEn: new Date(),
      observaciones: value.observacion || null
    }, { transaction });

    await transaction.commit();

    res.json({
      ok: true,
      message: 'Ajuste manual registrado correctamente',
      data: discrepancia
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}
// ==================== RONDA ACTIVA POR GRUPO ====================

async function getRondaActivaDelGrupo(req, res, next) {
  try {
    const { grupoId } = req.query;
    
    if (!grupoId) {
      return res.status(400).json({
        ok: false,
        message: 'grupoId es requerido'
      });
    }
    
    const ronda = await RondaConteo.findOne({
      include: [{
        model: AsignacionRonda,
        as: 'asignacion',
        where: { grupoId },
        required: true,
        include: [{ model: Grupo, as: 'grupo', attributes: ['id', 'nombre'] }]
      }],
      where: { estado: 'activa' },
      include: [
        { model: Zona, as: 'zona', attributes: ['id', 'nombre', 'codigo'] }
      ]
    });
    
    res.json({
      ok: true,
      data: ronda || null
    });
  } catch (error) {
    next(error);
  }
}

// ==================== EXPORTS ====================
module.exports = {
  createRonda,
  getRondas,
  iniciarRonda,
  pausarRonda,
  reanudarRonda,
  cerrarRonda,
  getPendientesRonda,
  conciliarRonda,
  ajusteManual,
  getRondaActivaDelGrupo  // 👈 AGREGAR ESTA LÍNEA
};