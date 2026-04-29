const { Op } = require('sequelize');
const Joi = require('joi');
const {
  sequelize,
  Lectura,
  Inventario,
  Grupo,
  Zona,
  AsignacionConteo,
  RondaConteo,
  AsignacionRonda,
  DiscrepanciaConteo,
  ConteoInicialDetalle,
  Usuario
} = require('../models');

// ==================== SCHEMAS ====================

const scanSchema = Joi.object({
  inventarioId: Joi.number().integer().required(),
  conteoTipo: Joi.number().integer().min(1).required(),
  zonaId: Joi.number().integer().required(),
  grupoId: Joi.number().integer().required(),
  codigo: Joi.string().trim().required()
});

const scanRondaSchema = Joi.object({
  rondaId: Joi.number().integer().required(),
  grupoId: Joi.number().integer().required(),
  codigo: Joi.string().trim().required()
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

  return {
    [Op.and]: and
  };
}

async function findProductoLocal(inventarioId, zonaId, codigoLimpio, transaction) {
  const whereCodigo = {
    [Op.or]: [
      { codigoLeido: codigoLimpio },
      { sku: codigoLimpio }
    ]
  };

  const candidatos = await ConteoInicialDetalle.findAll({
    where: whereCodigo,
    transaction
  });

  if (!candidatos.length) return null;

  const normalizar = (v) => String(v || '').trim().toLowerCase();
  const tieneDescripcionReal = (item) => {
    const d = normalizar(item.descripcionSnapshot);
    return d && d !== 'sin descripción' && d !== 'sin descripcion';
  };

  const score = (item) => {
    let puntos = 0;

    if (Number(item.inventarioId) === Number(inventarioId)) puntos += 100;
    if (Number(item.zonaId) === Number(zonaId)) puntos += 50;
    if (tieneDescripcionReal(item)) puntos += 25;
    if (normalizar(item.codigoLeido) === normalizar(codigoLimpio)) puntos += 10;

    return puntos;
  };

  candidatos.sort((a, b) => score(b) - score(a));

  return candidatos[0];
}

function validarCodigo(codigo) {
  const codigoLimpio = String(codigo || '').trim();

  if (codigoLimpio.length < 5 || codigoLimpio.length > 7) {
    return {
      ok: false,
      codigoLimpio,
      message: 'Código inválido. Debe tener entre 5 y 7 dígitos.'
    };
  }

  return {
    ok: true,
    codigoLimpio
  };
}

async function calcularTotalReconteo(rondaId, sku, transaction) {
  const total = await Lectura.sum('cantidad', {
    where: {
      rondaId,
      sku,
      estado: 'valida'
    },
    transaction
  });

  return Number(total || 0);
}

// ==================== SCAN LEGACY (con conteoTipo) ====================

async function scanLectura(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const { error, value } = scanSchema.validate(req.body);

    if (error) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const validacionCodigo = validarCodigo(value.codigo);
    if (!validacionCodigo.ok) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: validacionCodigo.message
      });
    }

    const { codigoLimpio } = validacionCodigo;

    if (!req.canViewAllGroups && Number(value.grupoId) !== Number(req.grupoId)) {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'No puedes registrar lecturas en otro grupo'
      });
    }

    const [inventario, grupo, zona, asignacion] = await Promise.all([
      Inventario.findByPk(value.inventarioId, { transaction }),
      Grupo.findByPk(value.grupoId, { transaction }),
      Zona.findByPk(value.zonaId, { transaction }),
      AsignacionConteo.findOne({
        where: {
          inventarioId: value.inventarioId,
          conteoTipo: value.conteoTipo,
          grupoId: value.grupoId,
          zonaId: value.zonaId
        },
        transaction
      })
    ]);

    if (!inventario) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Inventario no encontrado'
      });
    }

    if (!grupo) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado'
      });
    }

    if (!zona) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Zona no encontrada'
      });
    }

    if (!asignacion) {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'Ese grupo no está asignado a esa zona para ese conteo'
      });
    }

    const productoLocal = await findProductoLocal(
      value.inventarioId,
      value.zonaId,
      codigoLimpio,
      transaction
    );

    if (!productoLocal) {
      const lectura = await Lectura.create(
        {
          inventarioId: value.inventarioId,
          conteoTipo: value.conteoTipo,
          rondaId: null,
          zonaId: value.zonaId,
          grupoId: value.grupoId,
          usuarioId: req.user.id,
          productoId: null,
          sku: null,
          codigoLeido: codigoLimpio,
          descripcionSnapshot: null,
          cantidad: 1,
          estado: 'no_reconocida'
        },
        { transaction }
      );

      await transaction.commit();

      return res.status(200).json({
        ok: true,
        warning: true,
        message: 'Código no reconocido, lectura guardada para revisión',
        data: {
          lecturaId: lectura.id,
          codigo: codigoLimpio,
          estado: lectura.estado
        }
      });
    }

    const skuFinal = productoLocal.sku || codigoLimpio;
    const descripcionFinal = productoLocal.descripcionSnapshot || 'Sin descripción';
    const productoIdFinal = productoLocal.productoId || null;

    const lectura = await Lectura.create(
      {
        inventarioId: value.inventarioId,
        conteoTipo: value.conteoTipo,
        rondaId: null,
        zonaId: value.zonaId,
        grupoId: value.grupoId,
        usuarioId: req.user.id,
        productoId: productoIdFinal,
        sku: skuFinal,
        codigoLeido: codigoLimpio,
        descripcionSnapshot: descripcionFinal,
        cantidad: 1,
        estado: 'valida'
      },
      { transaction }
    );

    const acumuladoSku = await Lectura.sum('cantidad', {
      where: {
        inventarioId: value.inventarioId,
        conteoTipo: value.conteoTipo,
        zonaId: value.zonaId,
        grupoId: value.grupoId,
        sku: skuFinal,
        estado: 'valida'
      },
      transaction
    });

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      message: 'Lectura registrada correctamente',
      data: {
        lecturaId: lectura.id,
        producto: {
          id: productoIdFinal,
          sku: skuFinal,
          codigoBarra: productoLocal.codigoLeido || codigoLimpio,
          descripcion: descripcionFinal,
          source: 'postgres'
        },
        acumuladoSku: Number(acumuladoSku || 0)
      }
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

// ==================== SCAN POR RONDA ====================

async function scanLecturaRonda(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const { error, value } = scanRondaSchema.validate(req.body);

    if (error) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const validacionCodigo = validarCodigo(value.codigo);
    if (!validacionCodigo.ok) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: validacionCodigo.message
      });
    }

    const { codigoLimpio } = validacionCodigo;

    if (!req.canViewAllGroups && Number(value.grupoId) !== Number(req.grupoId)) {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'No puedes registrar lecturas en otro grupo'
      });
    }

    const ronda = await RondaConteo.findByPk(value.rondaId, {
      include: [{ model: Zona, as: 'zona', attributes: ['id', 'nombre', 'codigo'] }],
      transaction
    });

    if (!ronda) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Ronda no encontrada'
      });
    }

    if (ronda.estado === 'pausada') {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'La ronda está pausada. Reanúdala para continuar escaneando.'
      });
    }

    if (ronda.estado === 'cerrada') {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'La ronda ya está cerrada. No se pueden registrar más lecturas.'
      });
    }

    if (ronda.estado !== 'activa') {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'La ronda debe estar activa para registrar lecturas.'
      });
    }

    const grupo = await Grupo.findByPk(value.grupoId, { transaction });

    if (!grupo) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado'
      });
    }

    const asignacionRonda = await AsignacionRonda.findOne({
      where: {
        rondaId: ronda.id,
        grupoId: grupo.id
      },
      transaction
    });

    if (!asignacionRonda) {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'Ese grupo no está asignado a esta ronda'
      });
    }

    const productoLocal = await findProductoLocal(
      ronda.inventarioId,
      ronda.zonaId,
      codigoLimpio,
      transaction
    );

    if (!productoLocal) {
      if (ronda.tipoRonda === 'reconteo') {
        await transaction.rollback();
        return res.status(400).json({
          ok: false,
          message: 'En una ronda de reconteo solo se permiten productos reconocidos y pendientes'
        });
      }

      const lectura = await Lectura.create(
        {
          inventarioId: ronda.inventarioId,
          conteoTipo: ronda.numeroRonda,
          rondaId: ronda.id,
          zonaId: ronda.zonaId,
          grupoId: grupo.id,
          usuarioId: req.user.id,
          productoId: null,
          sku: null,
          codigoLeido: codigoLimpio,
          descripcionSnapshot: null,
          cantidad: 1,
          estado: 'no_reconocida'
        },
        { transaction }
      );

      await transaction.commit();

      return res.status(200).json({
        ok: true,
        warning: true,
        message: 'Código no reconocido, lectura guardada para revisión',
        data: {
          lecturaId: lectura.id,
          codigo: codigoLimpio,
          estado: lectura.estado
        }
      });
    }

    const skuFinal = productoLocal.sku || codigoLimpio;
    const descripcionFinal = productoLocal.descripcionSnapshot || 'Sin descripción';
    const productoIdFinal = productoLocal.productoId || null;

    let pendiente = null;
    let esReconteo = false;

    if (ronda.tipoRonda === 'reconteo') {
      esReconteo = true;

      console.log('\n========== DEBUG RECONTEO ==========');
      console.log('Ronda ID:', ronda.id);
      console.log('Inventario:', ronda.inventarioId);
      console.log('Zona:', ronda.zonaId);
      console.log('Numero ronda:', ronda.numeroRonda);
      console.log('Estado ronda:', ronda.estado);
      console.log('Grupo:', grupo.id);
      console.log('Codigo leido:', codigoLimpio);
      console.log('SKU final:', skuFinal);

      const wherePendiente = buildWherePendienteReconteo(ronda, skuFinal);
      console.log('WHERE buildWherePendienteReconteo:', JSON.stringify(wherePendiente, null, 2));

      pendiente = await DiscrepanciaConteo.findOne({
        where: wherePendiente,
        transaction
      });

      console.log('Pendiente exacto encontrado:', pendiente ? pendiente.toJSON() : null);

      const pendienteAlterno = await DiscrepanciaConteo.findOne({
        where: {
          inventarioId: ronda.inventarioId,
          zonaId: ronda.zonaId,
          sku: skuFinal
        },
        transaction
      });

      console.log('Pendiente alterno misma zona:', pendienteAlterno ? pendienteAlterno.toJSON() : null);

      const todosSkuMismaZona = await DiscrepanciaConteo.findAll({
        where: {
          inventarioId: ronda.inventarioId,
          zonaId: ronda.zonaId,
          sku: skuFinal
        },
        order: [['id', 'DESC']],
        transaction
      });

      console.log(
        'Todos los registros para ese SKU en misma zona:',
        todosSkuMismaZona.map((x) => x.toJSON())
      );

      const pendienteOtraZona = await DiscrepanciaConteo.findAll({
        where: {
          inventarioId: ronda.inventarioId,
          sku: skuFinal
        },
        order: [['zonaId', 'ASC'], ['id', 'DESC']],
        transaction
      });

      console.log(
        'Registros del SKU en otras zonas del mismo inventario:',
        pendienteOtraZona.map((x) => x.toJSON())
      );

      if (!pendiente) {
        const pendienteEnOtraRonda = await DiscrepanciaConteo.findOne({
          where: {
            sku: skuFinal,
            estado: {
              [Op.in]: ['pendiente_reconteo', 'reconteo_en_proceso', 'pendiente']
            }
          },
          order: [['updatedAt', 'DESC']],
          transaction
        });

        await transaction.rollback();

        if (pendienteEnOtraRonda) {
          return res.status(403).json({
            ok: false,
            message: `Ese SKU está pendiente en inventario ${pendienteEnOtraRonda.inventarioId}, zona ${pendienteEnOtraRonda.zonaId}, ronda ${pendienteEnOtraRonda.proximaRondaNumero || 'sin número'}`
          });
        }

        return res.status(403).json({
          ok: false,
          message: 'Ese SKU no está pendiente para esta ronda de reconteo'
        });
      }

      if (
        !pendiente.estado ||
        pendiente.estado === 'pendiente' ||
        pendiente.estado === 'pendiente_reconteo'
      ) {
        await pendiente.update(
          {
            estado: 'reconteo_en_proceso',
            reconteoCount: Number(pendiente.reconteoCount || 0) + 1,
            proximaRondaNumero: pendiente.proximaRondaNumero || ronda.numeroRonda
          },
          { transaction }
        );

        console.log('✅ Pendiente actualizado a reconteo_en_proceso');
      }

      console.log('✅ RESULTADO: SKU válido para reconteo');
      console.log('====================================\n');
    }

    const lectura = await Lectura.create(
      {
        inventarioId: ronda.inventarioId,
        conteoTipo: ronda.numeroRonda,
        rondaId: ronda.id,
        zonaId: ronda.zonaId,
        grupoId: grupo.id,
        usuarioId: req.user.id,
        productoId: productoIdFinal,
        sku: skuFinal,
        codigoLeido: codigoLimpio,
        descripcionSnapshot: descripcionFinal,
        cantidad: 1,
        estado: 'valida'
      },
      { transaction }
    );

    const cantidadTotalReconteo = await calcularTotalReconteo(ronda.id, skuFinal, transaction);

    if (esReconteo && pendiente) {
      const nuevaDiferencia = Math.abs(
        Number(pendiente.cantidadBase || 0) - Number(cantidadTotalReconteo || 0)
      );

      await pendiente.update(
        {
          cantidadUltima: cantidadTotalReconteo,
          diferencia: nuevaDiferencia,
          ultimaRondaId: ronda.id
        },
        { transaction }
      );
    }

    const totalEscaneosRonda = await Lectura.sum('cantidad', {
      where: {
        rondaId: ronda.id,
        estado: 'valida'
      },
      transaction
    });

    await ronda.update(
      {
        updatedAt: new Date(),
        totalEscaneos: Number(totalEscaneosRonda || 0)
      },
      { transaction }
    );

    await transaction.commit();

    const responseData = {
      lecturaId: lectura.id,
      ronda: {
        id: ronda.id,
        numeroRonda: ronda.numeroRonda,
        tipoRonda: ronda.tipoRonda,
        estado: ronda.estado
      },
      producto: {
        id: productoIdFinal,
        sku: skuFinal,
        codigoBarra: productoLocal.codigoLeido || codigoLimpio,
        descripcion: descripcionFinal,
        source: 'postgres'
      },
      acumuladoSku: cantidadTotalReconteo
    };

    if (esReconteo && pendiente) {
      responseData.discrepancia = {
        cantidadBase: Number(pendiente.cantidadBase || 0),
        cantidadReconteo: cantidadTotalReconteo,
        diferencia: Math.abs(
          Number(pendiente.cantidadBase || 0) - Number(cantidadTotalReconteo || 0)
        ),
        reconteoCount: Number(pendiente.reconteoCount || 0)
      };
    }

    return res.status(201).json({
      ok: true,
      message: esReconteo
        ? `Reconteo registrado. Total para SKU ${skuFinal}: ${cantidadTotalReconteo}`
        : 'Lectura registrada correctamente',
      data: responseData
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

// ==================== ANULAR LECTURA ====================

async function anularLectura(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const lectura = await Lectura.findByPk(req.params.id, { transaction });

    if (!lectura) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Lectura no encontrada'
      });
    }

    if (!req.canViewAllGroups && Number(lectura.grupoId) !== Number(req.grupoId)) {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'No puedes anular una lectura de otro grupo'
      });
    }

    if (lectura.estado === 'anulada') {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'Esta lectura ya estaba anulada'
      });
    }

    await lectura.update({ estado: 'anulada' }, { transaction });

    if (lectura.rondaId) {
      const ronda = await RondaConteo.findByPk(lectura.rondaId, { transaction });

      if (ronda && ronda.tipoRonda === 'reconteo' && lectura.sku) {
        const nuevaCantidad = await calcularTotalReconteo(
          ronda.id,
          lectura.sku,
          transaction
        );

        const discrepancia = await DiscrepanciaConteo.findOne({
          where: {
            inventarioId: ronda.inventarioId,
            zonaId: ronda.zonaId,
            sku: lectura.sku
          },
          transaction
        });

        if (discrepancia) {
          await discrepancia.update(
            {
              cantidadUltima: nuevaCantidad,
              diferencia: Math.abs(
                Number(discrepancia.cantidadBase || 0) - Number(nuevaCantidad || 0)
              ),
              ultimaRondaId: ronda.id
            },
            { transaction }
          );
        }

        const totalEscaneosRonda = await Lectura.sum('cantidad', {
          where: {
            rondaId: ronda.id,
            estado: 'valida'
          },
          transaction
        });

        await ronda.update(
          {
            totalEscaneos: Number(totalEscaneosRonda || 0),
            updatedAt: new Date()
          },
          { transaction }
        );
      }
    }

    await transaction.commit();

    res.json({
      ok: true,
      message: 'Lectura anulada correctamente',
      data: {
        lecturaId: lectura.id,
        sku: lectura.sku,
        codigoLeido: lectura.codigoLeido
      }
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

// ==================== RESUMEN Y CONSULTAS ====================

async function getResumenLecturas(req, res, next) {
  try {
    const { inventarioId, conteoTipo, zonaId, grupoId, rondaId } = req.query;

    // Si se filtra por una ronda específica, no aplicamos el filtro de tipoRonda
    // porque el usuario está consultando esa ronda a propósito.
    // Si no, excluimos las lecturas de rondas de reconteo para no inflar los totales.
    if (rondaId) {
      const where = { estado: 'valida', rondaId };

      if (inventarioId) where.inventarioId = inventarioId;
      if (conteoTipo) where.conteoTipo = conteoTipo;
      if (zonaId) where.zonaId = zonaId;

      if (!req.canViewAllGroups && req.grupoId) {
        where.grupoId = req.grupoId;
      } else if (grupoId && req.canViewAllGroups) {
        where.grupoId = grupoId;
      }

      const resumen = await Lectura.findAll({
        where,
        attributes: [
          'sku',
          [sequelize.fn('MAX', sequelize.col('descripcionSnapshot')), 'descripcionSnapshot'],
          [sequelize.fn('SUM', sequelize.col('cantidad')), 'cantidadTotal']
        ],
        group: ['sku'],
        order: [[sequelize.literal('"cantidadTotal"'), 'DESC']]
      });

      return res.json({ ok: true, data: resumen });
    }

    // Sin rondaId: excluir lecturas de rondas de reconteo para que no inflen el inventario
    const replacements = {};
    const conditions = [`l.estado = 'valida'`];

    if (inventarioId) {
      conditions.push(`l."inventarioId" = :inventarioId`);
      replacements.inventarioId = inventarioId;
    }

    if (conteoTipo) {
      conditions.push(`l."conteoTipo" = :conteoTipo`);
      replacements.conteoTipo = conteoTipo;
    }

    if (zonaId) {
      conditions.push(`l."zonaId" = :zonaId`);
      replacements.zonaId = zonaId;
    }

    if (!req.canViewAllGroups && req.grupoId) {
      conditions.push(`l."grupoId" = :grupoId`);
      replacements.grupoId = req.grupoId;
    } else if (grupoId && req.canViewAllGroups) {
      conditions.push(`l."grupoId" = :grupoId`);
      replacements.grupoId = grupoId;
    }

    // Excluir lecturas pertenecientes a rondas de reconteo
    conditions.push(`(l."rondaId" IS NULL OR r."tipoRonda" != 'reconteo')`);

    const whereClause = conditions.join(' AND ');

    const resumen = await sequelize.query(
      `
      SELECT
        l.sku,
        MAX(l."descripcionSnapshot") AS "descripcionSnapshot",
        COALESCE(SUM(l.cantidad), 0)::int AS "cantidadTotal"
      FROM lecturas l
      LEFT JOIN rondas_conteo r ON r.id = l."rondaId"
      WHERE ${whereClause}
        AND l.sku IS NOT NULL
      GROUP BY l.sku
      ORDER BY "cantidadTotal" DESC
      `,
      {
        replacements,
        type: require('sequelize').QueryTypes.SELECT
      }
    );

    return res.json({ ok: true, data: resumen });
  } catch (error) {
    next(error);
  }
}

async function getHistorialLecturas(req, res, next) {
  try {
    const { inventarioId, conteoTipo, zonaId, grupoId, rondaId, limit = 200 } = req.query;

    const where = {};

    if (inventarioId) where.inventarioId = inventarioId;
    if (conteoTipo) where.conteoTipo = conteoTipo;
    if (zonaId) where.zonaId = zonaId;
    if (rondaId) where.rondaId = rondaId;

    if (!req.canViewAllGroups && req.grupoId) {
      where.grupoId = req.grupoId;
    } else if (grupoId && req.canViewAllGroups) {
      where.grupoId = grupoId;
    }

    const lecturas = await Lectura.findAll({
      where,
      order: [['fechaHora', 'DESC']],
      limit: parseInt(limit, 10),
      include: [
        { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] },
        { model: Zona, as: 'zona', attributes: ['id', 'nombre'] }
      ]
    });

    res.json({
      ok: true,
      data: lecturas
    });
  } catch (error) {
    next(error);
  }
}

async function getEstadisticasGrupo(req, res, next) {
  try {
    const { rondaId, grupoId } = req.query;

    if (!rondaId || !grupoId) {
      return res.status(400).json({
        ok: false,
        message: 'rondaId y grupoId son requeridos'
      });
    }

    if (!req.canViewAllGroups && Number(grupoId) !== Number(req.grupoId)) {
      return res.status(403).json({
        ok: false,
        message: 'No puedes ver estadísticas de otro grupo'
      });
    }

    const lecturas = await Lectura.findAll({
      where: {
        rondaId,
        grupoId,
        estado: 'valida'
      }
    });

    const totalEscaneos = lecturas.reduce((sum, l) => sum + Number(l.cantidad || 0), 0);
    const productosUnicos = new Set(lecturas.map((l) => l.sku).filter(Boolean)).size;

    const primeraLectura = await Lectura.findOne({
      where: { rondaId, grupoId, estado: 'valida' },
      order: [['fechaHora', 'ASC']]
    });

    const ultimaLectura = await Lectura.findOne({
      where: { rondaId, grupoId, estado: 'valida' },
      order: [['fechaHora', 'DESC']]
    });

    let tiempoTotal = null;
    if (primeraLectura && ultimaLectura) {
      tiempoTotal = Math.round((ultimaLectura.fechaHora - primeraLectura.fechaHora) / 1000);
    }

    res.json({
      ok: true,
      data: {
        totalEscaneos,
        productosUnicos,
        tiempoSegundos: tiempoTotal,
        tiempoFormateado: tiempoTotal
          ? `${Math.floor(tiempoTotal / 60)}m ${tiempoTotal % 60}s`
          : null,
        primeraLectura: primeraLectura?.fechaHora || null,
        ultimaLectura: ultimaLectura?.fechaHora || null
      }
    });
  } catch (error) {
    next(error);
  }
}

async function exportarResultadosGrupo(req, res, next) {
  try {
    const { rondaId, grupoId } = req.query;

    if (!rondaId || !grupoId) {
      return res.status(400).json({
        ok: false,
        message: 'rondaId y grupoId son requeridos'
      });
    }

    if (!req.canViewAllGroups && Number(grupoId) !== Number(req.grupoId)) {
      return res.status(403).json({
        ok: false,
        message: 'No puedes exportar resultados de otro grupo'
      });
    }

    const resumen = await Lectura.findAll({
      where: {
        rondaId,
        grupoId,
        estado: 'valida'
      },
      attributes: [
        'sku',
        'descripcionSnapshot',
        [sequelize.fn('SUM', sequelize.col('cantidad')), 'cantidadTotal']
      ],
      group: ['sku', 'descripcionSnapshot'],
      order: [[sequelize.literal('"cantidadTotal"'), 'DESC']]
    });

    const grupoInfo = await Grupo.findByPk(grupoId);
    const rondaInfo = await RondaConteo.findByPk(rondaId, {
      include: [{ model: Zona, as: 'zona' }]
    });

    res.json({
      ok: true,
      data: {
        grupo: {
          id: grupoInfo?.id,
          nombre: grupoInfo?.nombre
        },
        ronda: {
          id: rondaInfo?.id,
          numeroRonda: rondaInfo?.numeroRonda,
          tipoRonda: rondaInfo?.tipoRonda,
          zona: rondaInfo?.zona?.nombre || null
        },
        resultados: resumen.map((item) => ({
          sku: item.sku,
          descripcion: item.descripcionSnapshot,
          cantidadTotal: parseInt(item.dataValues.cantidadTotal, 10)
        })),
        totalProductos: resumen.length,
        totalUnidades: resumen.reduce(
          (sum, item) => sum + parseInt(item.dataValues.cantidadTotal, 10),
          0
        )
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  scanLectura,
  scanLecturaRonda,
  anularLectura,
  getResumenLecturas,
  getHistorialLecturas,
  getEstadisticasGrupo,
  exportarResultadosGrupo,
  buildWherePendienteReconteo
};