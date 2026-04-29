const Joi = require('joi');
const { QueryTypes, Op } = require('sequelize');

const {
  sequelize,
  RondaConteo,
  Inventario,
  Zona,
  AsignacionRonda,
  AsignacionConteo,
  Grupo,
  DiscrepanciaConteo,
  Lectura,
  ConteoInicialDetalle
} = require('../models');

// ==================== SCHEMAS ====================

const createRondaSchema = Joi.object({
  grupoId: Joi.number().integer().required(),
  tipoRonda: Joi.string().valid('completa', 'reconteo').required(),
  generadaDesdeRondaId: Joi.number().integer().allow(null),
  observaciones: Joi.string().allow(null, '')
});
// ==================== HELPERS ====================
function buildWherePendienteReconteo(ronda, sku = null) {
  const and = [
    { inventarioId: ronda.inventarioId },
    { zonaId: ronda.zonaId },
    { diferencia: { [Op.ne]: 0 } },
    {
      [Op.or]: [
        { proximaRondaNumero: ronda.numeroRonda },
        { proximaRondaNumero: null }
      ]
    },
    {
      [Op.or]: [
        {
          estado: {
            [Op.in]: ['pendiente_reconteo', 'reconteo_en_proceso', 'pendiente']
          }
        },
        { estado: null }
      ]
    }
  ];

  if (sku) {
    and.push({ sku });
  }

  return { [Op.and]: and };
}
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
      AND l.sku IS NOT NULL
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

async function getTotalEscaneosRonda(rondaId, transaction = null) {
  const total = await Lectura.sum('cantidad', {
    where: {
      rondaId,
      estado: 'valida'
    },
    transaction
  });

  return Number(total || 0);
}

async function getRondaConAcceso(rondaId, req) {
  const ronda = await RondaConteo.findByPk(rondaId, {
    include: [
      { model: Zona, as: 'zona', attributes: ['id', 'nombre', 'codigo'] },
      {
        model: AsignacionRonda,
        as: 'asignacion',
        include: [{ model: Grupo, as: 'grupo', attributes: ['id', 'nombre'] }]
      }
    ]
  });

  if (!ronda) {
    return null;
  }

  if (req.canViewAllGroups) {
    return ronda;
  }

  const gruposUsuario = await sequelize.query(
    `
    SELECT ug."grupoId"
    FROM usuario_grupo ug
    WHERE ug."usuarioId" = :usuarioId
    `,
    {
      replacements: { usuarioId: req.user.id },
      type: QueryTypes.SELECT
    }
  );

  const grupoIds = gruposUsuario.map((row) => Number(row.grupoId));

  if (!grupoIds.length) {
    return 'FORBIDDEN';
  }

  const acceso = await AsignacionRonda.findOne({
    where: {
      rondaId: ronda.id,
      grupoId: {
        [Op.in]: grupoIds
      }
    }
  });

  return acceso ? ronda : 'FORBIDDEN';
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

    const grupo = await Grupo.findByPk(value.grupoId);

    if (!grupo) {
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado'
      });
    }

    const inventario = await Inventario.findByPk(grupo.inventarioId);

    if (!inventario) {
      return res.status(404).json({
        ok: false,
        message: 'Inventario no encontrado para este grupo'
      });
    }

    const asignacionZona = await AsignacionConteo.findOne({
      where: {
        inventarioId: grupo.inventarioId,
        grupoId: grupo.id
      },
      order: [['conteoTipo', 'ASC'], ['id', 'ASC']]
    });

    const zonaId = grupo.zonaId || asignacionZona?.zonaId || null;

    if (!zonaId) {
      return res.status(400).json({
        ok: false,
        message: 'El grupo no tiene una zona asignada. Asígnale zona antes de crear la ronda.'
      });
    }

    const zona = await Zona.findByPk(zonaId);

    if (!zona) {
      return res.status(404).json({
        ok: false,
        message: 'Zona no encontrada para este grupo'
      });
    }

    const rondaAbierta = await RondaConteo.findOne({
      where: {
        estado: {
          [Op.in]: ['borrador', 'activa', 'pausada']
        }
      },
      include: [
        {
          model: AsignacionRonda,
          as: 'asignacion',
          required: true,
          where: { grupoId: grupo.id }
        }
      ]
    });

    if (rondaAbierta) {
      return res.status(400).json({
        ok: false,
        message: 'Este grupo ya tiene una ronda abierta. Ciérrala o páusala antes de crear otra.'
      });
    }

    if (value.generadaDesdeRondaId) {
      const rondaOrigen = await RondaConteo.findByPk(value.generadaDesdeRondaId);

      if (!rondaOrigen) {
        return res.status(404).json({
          ok: false,
          message: 'La ronda origen no existe'
        });
      }

      if (
        Number(rondaOrigen.inventarioId) !== Number(grupo.inventarioId) ||
        Number(rondaOrigen.zonaId) !== Number(zonaId)
      ) {
        return res.status(400).json({
          ok: false,
          message: 'La ronda origen no pertenece al mismo inventario y zona del grupo'
        });
      }
    }

    const ultima = await RondaConteo.findOne({
      where: {
        inventarioId: grupo.inventarioId,
        zonaId
      },
      order: [['numeroRonda', 'DESC']]
    });

    const numeroRonda = Number(ultima?.numeroRonda || 0) + 1;

    const ronda = await RondaConteo.create({
      inventarioId: grupo.inventarioId,
      zonaId,
      numeroRonda,
      tipoRonda: value.tipoRonda,
      estado: 'borrador',
      generadaDesdeRondaId: value.generadaDesdeRondaId || null,
      observaciones: value.observaciones || null
    });

    await AsignacionRonda.create({
      rondaId: ronda.id,
      grupoId: grupo.id,
      estado: 'asignada'
    });

    const rondaCreada = await RondaConteo.findByPk(ronda.id, {
      include: [
        {
          model: Zona,
          as: 'zona',
          attributes: ['id', 'nombre', 'codigo']
        },
        {
          model: AsignacionRonda,
          as: 'asignacion',
          required: false,
          include: [
            {
              model: Grupo,
              as: 'grupo',
              attributes: ['id', 'nombre', 'inventarioId']
            }
          ]
        }
      ]
    });

    res.status(201).json({
      ok: true,
      data: rondaCreada
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
        include: [{ model: Grupo, as: 'grupo', attributes: ['id', 'nombre', 'inventarioId'] }]
      }
    ];

    if (!req.canViewAllGroups && req.grupoId) {
      include[1].required = true;
      include[1].where = { grupoId: req.grupoId };
    } else if (grupoId) {
      include[1].required = true;
      include[1].where = { grupoId };
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

async function getRonda(req, res, next) {
  try {
    const ronda = await getRondaConAcceso(req.params.id, req);

    if (!ronda) {
      return res.status(404).json({
        ok: false,
        message: 'Ronda no encontrada'
      });
    }

    if (ronda === 'FORBIDDEN') {
      return res.status(403).json({
        ok: false,
        message: 'No tienes acceso a esta ronda'
      });
    }

    res.json({
      ok: true,
      data: ronda
    });
  } catch (error) {
    next(error);
  }
}

// ==================== CONTROL DE ESTADO ====================

async function iniciarRonda(req, res, next) {
  try {
    const ronda = await getRondaConAcceso(req.params.id, req);

    if (!ronda) {
      return res.status(404).json({ ok: false, message: 'Ronda no encontrada' });
    }

    if (ronda === 'FORBIDDEN') {
      return res.status(403).json({ ok: false, message: 'No tienes acceso a esta ronda' });
    }

    if (!ronda.asignacion?.grupoId) {
      return res.status(400).json({
        ok: false,
        message: 'No se puede iniciar una ronda sin grupo asignado'
      });
    }

    if (ronda.estado !== 'borrador') {
      return res.status(400).json({
        ok: false,
        message: `No se puede iniciar una ronda en estado ${ronda.estado}`
      });
    }

    await ronda.update({
      estado: 'activa',
      tiempoInicio: ronda.tiempoInicio || new Date(),
      tiempoFin: null
    });

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
    const ronda = await getRondaConAcceso(req.params.id, req);

    if (!ronda) {
      return res.status(404).json({ ok: false, message: 'Ronda no encontrada' });
    }

    if (ronda === 'FORBIDDEN') {
      return res.status(403).json({ ok: false, message: 'No tienes acceso a esta ronda' });
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
    const ronda = await getRondaConAcceso(req.params.id, req);

    if (!ronda) {
      return res.status(404).json({ ok: false, message: 'Ronda no encontrada' });
    }

    if (ronda === 'FORBIDDEN') {
      return res.status(403).json({ ok: false, message: 'No tienes acceso a esta ronda' });
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
    const ronda = await RondaConteo.findByPk(req.params.id, {
      include: [
        {
          model: Zona,
          as: 'zona',
          attributes: ['id', 'nombre', 'codigo']
        },
        {
          model: AsignacionRonda,
          as: 'asignacion',
          required: false,
          include: [
            {
              model: Grupo,
              as: 'grupo',
              attributes: ['id', 'nombre', 'inventarioId']
            }
          ]
        }
      ]
    });

    if (!ronda) {
      return res.status(404).json({
        ok: false,
        message: 'Ronda no encontrada'
      });
    }

    if (ronda.estado !== 'activa' && ronda.estado !== 'pausada') {
      return res.status(400).json({
        ok: false,
        message: `No se puede cerrar una ronda en estado ${ronda.estado}`
      });
    }

    const totalEscaneos = await getTotalEscaneosRonda(ronda.id);

    await ronda.update({
      estado: 'cerrada',
      tiempoFin: new Date(),
      totalEscaneos
    });

    res.json({
      ok: true,
      data: ronda,
      message: 'Ronda cerrada correctamente'
    });
  } catch (error) {
    next(error);
  }
}

async function getPendientesRonda(req, res, next) {
  try {
    const rondaId = Number(req.params.id);

    if (!rondaId) {
      return res.status(400).json({
        ok: false,
        message: 'Id de ronda inválido'
      });
    }

    const ronda = await getRondaConAcceso(rondaId, req);

    if (ronda === 'FORBIDDEN') {
      return res.status(403).json({
        ok: false,
        message: 'No tienes acceso a esta ronda'
      });
    }

    if (!ronda) {
      return res.status(404).json({
        ok: false,
        message: 'Ronda no encontrada'
      });
    }

    console.log('\n====== DEBUG getPendientesRonda ======');
    console.log('Ronda ID:', ronda.id);
    console.log('Inventario:', ronda.inventarioId);
    console.log('Zona:', ronda.zonaId);
    console.log('Numero ronda:', ronda.numeroRonda);
    console.log('Estado:', ronda.estado);

    const wherePendientes = buildWherePendienteReconteo(ronda);
    console.log('WHERE pendientes:', JSON.stringify(wherePendientes, null, 2));

    const discrepancias = await DiscrepanciaConteo.findAll({
      where: wherePendientes,
      order: [['diferencia', 'DESC'], ['sku', 'ASC']]
    });

    console.log('Pendientes encontrados:', discrepancias.length);
    console.log(
      'Detalle pendientes:',
      discrepancias.map((x) => ({
        id: x.id,
        inventarioId: x.inventarioId,
        zonaId: x.zonaId,
        sku: x.sku,
        diferencia: x.diferencia,
        estado: x.estado,
        proximaRondaNumero: x.proximaRondaNumero
      }))
    );
    console.log('=====================================\n');

    const skus = [...new Set(discrepancias.map((item) => item.sku).filter(Boolean))];

    let mapaDetalle = new Map();

    if (skus.length > 0) {
      const detalles = await ConteoInicialDetalle.findAll({
        where: {
          inventarioId: ronda.inventarioId,
          zonaId: ronda.zonaId,
          sku: {
            [Op.in]: skus
          }
        }
      });

      mapaDetalle = new Map(
        detalles.map((item) => [
          item.sku,
          {
            descripcionSnapshot: item.descripcionSnapshot || 'Sin descripción',
            codigoLeido: item.codigoLeido || null
          }
        ])
      );
    }

    const pendientes = discrepancias.map((item) => {
      const detalle = mapaDetalle.get(item.sku);

      return {
        id: item.id,
        inventarioId: item.inventarioId,
        zonaId: item.zonaId,
        productoId: item.productoId,
        sku: item.sku,
        descripcionSnapshot:
          item.descripcionSnapshot ||
          detalle?.descripcionSnapshot ||
          'Sin descripción',
        codigoLeido: detalle?.codigoLeido || null,
        rondaBaseId: item.rondaBaseId,
        ultimaRondaId: item.ultimaRondaId,
        cantidadBase: Number(item.cantidadBase || 0),
        cantidadUltima: Number(item.cantidadUltima || 0),
        diferencia: Number(item.diferencia || 0),
        estado: item.estado,
        proximaRondaNumero: item.proximaRondaNumero,
        cantidadFinal: item.cantidadFinal,
        criterioCierre: item.criterioCierre,
        cerradoEn: item.cerradoEn,
        reconteoCount: Number(item.reconteoCount || 0)
      };
    });

    return res.json({
      ok: true,
      data: {
        ronda: {
          id: ronda.id,
          numeroRonda: ronda.numeroRonda,
          tipoRonda: ronda.tipoRonda,
          estado: ronda.estado,
          zona: ronda.zona || null,
          grupo: ronda.asignacion?.grupo || null
        },
        pendientes
      }
    });
  } catch (error) {
    next(error);
  }
}

async function reabrirRonda(req, res, next) {
  try {
    const ronda = await RondaConteo.findByPk(req.params.id, {
      include: [
        {
          model: Zona,
          as: 'zona',
          attributes: ['id', 'nombre', 'codigo']
        },
        {
          model: AsignacionRonda,
          as: 'asignacion',
          required: false,
          include: [
            {
              model: Grupo,
              as: 'grupo',
              attributes: ['id', 'nombre', 'inventarioId']
            }
          ]
        }
      ]
    });

    if (!ronda) {
      return res.status(404).json({
        ok: false,
        message: 'Ronda no encontrada'
      });
    }

    if (ronda.estado !== 'cerrada') {
      return res.status(400).json({
        ok: false,
        message: `Solo se puede reabrir una ronda cerrada. Estado actual: ${ronda.estado}`
      });
    }

    await ronda.update({
      estado: 'pausada',
      tiempoFin: null
    });

    return res.json({
      ok: true,
      message: 'Ronda reabierta correctamente',
      data: ronda
    });
  } catch (error) {
    next(error);
  }
}

async function conciliarRonda(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const rondaActual = await RondaConteo.findByPk(Number(req.params.id), {
      include: [
        {
          model: AsignacionRonda,
          as: 'asignacion',
          required: false,
          include: [{ model: Grupo, as: 'grupo', attributes: ['id', 'nombre', 'inventarioId'] }]
        }
      ],
      transaction
    });

    if (!rondaActual) {
      await transaction.rollback();
      return res.status(404).json({ ok: false, message: 'Ronda no encontrada' });
    }

    if (!['admin', 'supervisor'].includes(req.user?.rol)) {
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
      const pendientesActuales = await DiscrepanciaConteo.findAll({
        where: {
          inventarioId: rondaActual.inventarioId,
          zonaId: rondaActual.zonaId,
          proximaRondaNumero: rondaActual.numeroRonda,
          estado: { [Op.in]: ['pendiente_reconteo', 'reconteo_en_proceso'] }
        },
        transaction
      });

      skusEvaluar = pendientesActuales.map((item) => item.sku);
    }

    if (skusEvaluar.length === 0) {
      const totalEscaneos = await getTotalEscaneosRonda(rondaActual.id, transaction);

      await rondaActual.update(
        {
          estado: 'cerrada',
          tiempoFin: new Date(),
          totalEscaneos
        },
        { transaction }
      );

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
        where: {
          inventarioId: rondaActual.inventarioId,
          zonaId: rondaActual.zonaId,
          sku
        },
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

      if (rondaActual.asignacion?.grupoId) {
        await AsignacionRonda.findOrCreate({
          where: { rondaId: ronda.id },
          defaults: {
            rondaId: ronda.id,
            grupoId: rondaActual.asignacion.grupoId,
            estado: 'asignada'
          },
          transaction
        });
      }
    }

    const totalEscaneos = await getTotalEscaneosRonda(rondaActual.id, transaction);

    await rondaActual.update(
      {
        estado: 'cerrada',
        tiempoFin: new Date(),
        totalEscaneos
      },
      { transaction }
    );

    await transaction.commit();

    res.json({
      ok: true,
      message: 'Ronda conciliada correctamente',
      data: {
        rondaId: rondaActual.id,
        numeroRonda: rondaActual.numeroRonda,
        conciliados,
        pendientes,
        siguienteRonda: siguienteRonda
          ? {
            id: siguienteRonda.id,
            numeroRonda: siguienteRonda.numeroRonda,
            tipoRonda: siguienteRonda.tipoRonda,
            estado: siguienteRonda.estado
          }
          : null
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

    await discrepancia.update(
      {
        cantidadFinal: value.cantidadFinal,
        cantidadUltima: value.cantidadFinal,
        diferencia: 0,
        estado: 'conciliado_manual',
        criterioCierre: 'manual',
        cerradoEn: new Date()
      },
      { transaction }
    );

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
    const inventarioId = req.query.inventarioId
      ? Number(req.query.inventarioId)
      : null;

    const grupoIdQuery = req.query.grupoId
      ? Number(req.query.grupoId)
      : null;

    if (req.user.rol === 'admin' || req.user.rol === 'supervisor') {
      const where = { estado: 'activa' };
      if (inventarioId) where.inventarioId = inventarioId;

      const include = [
        {
          model: AsignacionRonda,
          as: 'asignacion',
          required: true,
          ...(grupoIdQuery ? { where: { grupoId: grupoIdQuery } } : {}),
          include: [
            {
              model: Grupo,
              as: 'grupo',
              attributes: ['id', 'nombre', 'inventarioId']
            }
          ]
        },
        {
          model: Zona,
          as: 'zona',
          attributes: ['id', 'nombre', 'codigo']
        }
      ];

      const rondas = await RondaConteo.findAll({
        where,
        include,
        order: [['updatedAt', 'DESC']]
      });

      return res.json({
        ok: true,
        data: rondas[0] || null
      });
    }

    if (!inventarioId) {
      return res.status(400).json({
        ok: false,
        message: 'inventarioId es requerido'
      });
    }

    const matches = await sequelize.query(
      `
      SELECT
        r.id,
        ug."grupoId"
      FROM usuario_grupo ug
      JOIN asignaciones_ronda ar
        ON ar."grupoId" = ug."grupoId"
      JOIN rondas_conteo r
        ON r.id = ar."rondaId"
      WHERE ug."usuarioId" = :usuarioId
        AND r.estado = 'activa'
        AND r."inventarioId" = :inventarioId
      ORDER BY r."updatedAt" DESC
      `,
      {
        replacements: {
          usuarioId: req.user.id,
          inventarioId
        },
        type: QueryTypes.SELECT
      }
    );

    if (matches.length === 0) {
      return res.json({
        ok: true,
        data: null
      });
    }

    if (matches.length > 1) {
      return res.status(400).json({
        ok: false,
        message: 'Tienes más de un grupo con ronda activa en este inventario. Cierra o pausa uno de ellos.'
      });
    }

    const ronda = await RondaConteo.findByPk(matches[0].id, {
      include: [
        {
          model: AsignacionRonda,
          as: 'asignacion',
          required: true,
          include: [
            {
              model: Grupo,
              as: 'grupo',
              attributes: ['id', 'nombre', 'inventarioId']
            }
          ]
        },
        {
          model: Zona,
          as: 'zona',
          attributes: ['id', 'nombre', 'codigo']
        }
      ]
    });

    return res.json({
      ok: true,
      data: ronda || null
    });
  } catch (error) {
    next(error);
  }
}
async function deleteRonda(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    const ronda = await RondaConteo.findByPk(id, { transaction });

    if (!ronda) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Ronda no encontrada'
      });
    }

    const totalLecturas = await Lectura.count({
      where: { rondaId: ronda.id },
      transaction
    });

    if (totalLecturas > 0) {
      await transaction.rollback();
      return res.status(409).json({
        ok: false,
        message: 'No se puede eliminar la ronda porque ya tiene lecturas registradas'
      });
    }

    await AsignacionRonda.destroy({
      where: { rondaId: ronda.id },
      transaction
    });

    await ronda.destroy({ transaction });

    await transaction.commit();

    return res.json({
      ok: true,
      message: 'Ronda eliminada correctamente'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

async function abrirTodasRondasInventario(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const inventarioId = Number(req.params.inventarioId);

    const inventario = await Inventario.findByPk(inventarioId, { transaction });

    if (!inventario) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Inventario no encontrado'
      });
    }

    const rondas = await RondaConteo.findAll({
      where: {
        inventarioId,
        estado: {
          [Op.in]: ['borrador', 'pausada']
        }
      },
      transaction
    });

    if (!rondas.length) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'No hay rondas en borrador o pausadas para abrir'
      });
    }

    for (const ronda of rondas) {
      await ronda.update(
        {
          estado: 'activa',
          tiempoInicio: ronda.tiempoInicio || new Date()
        },
        { transaction }
      );
    }

    await transaction.commit();

    return res.json({
      ok: true,
      message: `${rondas.length} ronda(s) abiertas correctamente`
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

async function pausarTodasRondasInventario(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const inventarioId = Number(req.params.inventarioId);

    const inventario = await Inventario.findByPk(inventarioId, { transaction });

    if (!inventario) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Inventario no encontrado'
      });
    }

    const rondas = await RondaConteo.findAll({
      where: {
        inventarioId,
        estado: 'activa'
      },
      transaction
    });

    if (!rondas.length) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'No hay rondas activas para frenar'
      });
    }

    for (const ronda of rondas) {
      await ronda.update(
        {
          estado: 'pausada'
        },
        { transaction }
      );
    }

    await transaction.commit();

    return res.json({
      ok: true,
      message: `${rondas.length} ronda(s) pausadas correctamente`
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

async function cerrarTodasRondasInventario(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const inventarioId = Number(req.params.inventarioId);

    const inventario = await Inventario.findByPk(inventarioId, { transaction });

    if (!inventario) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Inventario no encontrado'
      });
    }

    const rondas = await RondaConteo.findAll({
      where: {
        inventarioId,
        estado: {
          [Op.in]: ['borrador', 'activa', 'pausada']
        }
      },
      transaction
    });

    if (!rondas.length) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'No hay rondas abiertas para cerrar'
      });
    }

    for (const ronda of rondas) {
      await ronda.update(
        {
          estado: 'cerrada',
          tiempoFin: new Date()
        },
        { transaction }
      );
    }

    await transaction.commit();

    return res.json({
      ok: true,
      message: `${rondas.length} ronda(s) cerradas correctamente`
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

async function getMisRondasParaEscaneo(req, res, next) {
  try {
    const inventarioId = req.query.inventarioId ? Number(req.query.inventarioId) : null;

    if (!inventarioId) {
      return res.status(400).json({
        ok: false,
        message: 'inventarioId es requerido'
      });
    }

    const rondas = await sequelize.query(
      `
      SELECT
        r.id,
        r."inventarioId",
        r."zonaId",
        r."numeroRonda",
        r."tipoRonda",
        r.estado,
        r."tiempoInicio",
        r."tiempoFin",
        r."totalEscaneos",
        r."updatedAt",
        z.id as "zona.id",
        z.nombre as "zona.nombre",
        z.codigo as "zona.codigo",
        g.id as "asignacion.grupo.id",
        g.nombre as "asignacion.grupo.nombre",
        g."inventarioId" as "asignacion.grupo.inventarioId"
      FROM usuario_grupo ug
      JOIN asignaciones_ronda ar
        ON ar."grupoId" = ug."grupoId"
      JOIN rondas_conteo r
        ON r.id = ar."rondaId"
      JOIN grupos g
        ON g.id = ar."grupoId"
      JOIN zonas z
        ON z.id = r."zonaId"
      WHERE ug."usuarioId" = :usuarioId
        AND r."inventarioId" = :inventarioId
        AND r.estado IN ('borrador', 'activa', 'pausada')
      ORDER BY
        CASE r.estado
          WHEN 'activa' THEN 1
          WHEN 'pausada' THEN 2
          WHEN 'borrador' THEN 3
          ELSE 4
        END,
        r."updatedAt" DESC
      `,
      {
        replacements: {
          usuarioId: req.user.id,
          inventarioId
        },
        type: QueryTypes.SELECT
      }
    );

    const data = rondas.map((row) => ({
      id: row.id,
      inventarioId: row.inventarioId,
      zonaId: row.zonaId,
      numeroRonda: row.numeroRonda,
      tipoRonda: row.tipoRonda,
      estado: row.estado,
      tiempoInicio: row.tiempoInicio,
      tiempoFin: row.tiempoFin,
      totalEscaneos: row.totalEscaneos,
      updatedAt: row.updatedAt,
      zona: {
        id: row['zona.id'],
        nombre: row['zona.nombre'],
        codigo: row['zona.codigo']
      },
      asignacion: {
        grupoId: row['asignacion.grupo.id'],
        grupo: {
          id: row['asignacion.grupo.id'],
          nombre: row['asignacion.grupo.nombre'],
          inventarioId: row['asignacion.grupo.inventarioId']
        }
      }
    }));

    res.json({
      ok: true,
      data
    });
  } catch (error) {
    next(error);
  }
}
// ==================== EXPORTS ====================

module.exports = {
  createRonda,
  getRondas,
  getRonda,
  iniciarRonda,
  pausarRonda,
  reanudarRonda,
  cerrarRonda,
  getPendientesRonda,
  conciliarRonda,
  ajusteManual,
  getRondaActivaDelGrupo,
  reabrirRonda,
  getMisRondasParaEscaneo,
  deleteRonda,
  abrirTodasRondasInventario,
  pausarTodasRondasInventario,
  cerrarTodasRondasInventario,
  buildWherePendienteReconteo
};