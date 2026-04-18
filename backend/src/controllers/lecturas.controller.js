const { Sequelize, Op } = require('sequelize');
const Joi = require('joi');
const {
  sequelize,
  Lectura,
  Producto,
  Inventario,
  Grupo,
  Zona,
  AsignacionConteo,
  RondaConteo,
  AsignacionRonda,
  DiscrepanciaConteo,
  Usuario
} = require('../models');
const { findProductoExternoByCodigo } = require('../services/sqlserverInventarios.service');

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

    // Validación SKU: solo 5-7 dígitos
    const codigoLimpio = value.codigo.trim();
    if (codigoLimpio.length < 5 || codigoLimpio.length > 7) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'Código inválido. Debe tener entre 5 y 7 dígitos.'
      });
    }

    const [inventario, grupo, zona, asignacion] = await Promise.all([
      Inventario.findByPk(value.inventarioId),
      Grupo.findByPk(value.grupoId),
      Zona.findByPk(value.zonaId),
      AsignacionConteo.findOne({
        where: {
          inventarioId: value.inventarioId,
          conteoTipo: value.conteoTipo,
          grupoId: value.grupoId,
          zonaId: value.zonaId
        }
      })
    ]);

    if (!inventario) {
      await transaction.rollback();
      return res.status(404).json({ ok: false, message: 'Inventario no encontrado' });
    }

    if (!grupo) {
      await transaction.rollback();
      return res.status(404).json({ ok: false, message: 'Grupo no encontrado' });
    }

    if (!zona) {
      await transaction.rollback();
      return res.status(404).json({ ok: false, message: 'Zona no encontrada' });
    }

    if (!asignacion) {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'Ese grupo no está asignado a esa zona para ese conteo'
      });
    }

    let producto = await Producto.findOne({
      where: {
        activo: true,
        [Op.or]: [
          { codigoBarra: codigoLimpio },
          { codigoQr: codigoLimpio },
          { sku: codigoLimpio }
        ]
      },
      transaction
    });

    let externalProduct = null;

    if (!producto) {
      externalProduct = await findProductoExternoByCodigo(codigoLimpio);
    }

    if (!producto && !externalProduct) {
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

    const skuFinal = producto ? producto.sku : externalProduct.codigoInventario;
    const descripcionFinal = producto ? producto.descripcion : externalProduct.descripcion;
    const productoIdFinal = producto ? producto.id : null;

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
      message: producto
        ? 'Lectura registrada correctamente'
        : 'Lectura registrada con producto resuelto desde SQL Server',
      data: {
        lecturaId: lectura.id,
        producto: {
          id: productoIdFinal,
          sku: skuFinal,
          codigoBarra: producto ? producto.codigoBarra : externalProduct.codigoBarras,
          descripcion: descripcionFinal,
          source: producto ? 'postgres' : 'sqlserver'
        },
        acumuladoSku: Number(acumuladoSku || 0)
      }
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

// ==================== SCAN POR RONDA (NUEVO FLUJO) ====================

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

    // Validación SKU: solo 5-7 dígitos
    const codigoLimpio = value.codigo.trim();
    if (codigoLimpio.length < 5 || codigoLimpio.length > 7) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'Código inválido. Debe tener entre 5 y 7 dígitos.'
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

    // Verificar que la ronda no esté pausada o cerrada
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

    let producto = await Producto.findOne({
      where: {
        activo: true,
        [Op.or]: [
          { codigoBarra: codigoLimpio },
          { codigoQr: codigoLimpio },
          { sku: codigoLimpio }
        ]
      },
      transaction
    });

    let externalProduct = null;

    if (!producto) {
      externalProduct = await findProductoExternoByCodigo(codigoLimpio);
    }

    if (!producto && !externalProduct) {
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

    const skuFinal = producto ? producto.sku : externalProduct.codigoInventario;
    const descripcionFinal = producto ? producto.descripcion : externalProduct.descripcion;
    const productoIdFinal = producto ? producto.id : null;

    // Validación para rondas de reconteo: solo SKUs pendientes
    if (ronda.tipoRonda === 'reconteo') {
      const pendiente = await DiscrepanciaConteo.findOne({
        where: {
          inventarioId: ronda.inventarioId,
          zonaId: ronda.zonaId,
          sku: skuFinal,
          proximaRondaNumero: ronda.numeroRonda,
          estado: {
            [Op.in]: ['pendiente_reconteo', 'reconteo_en_proceso']
          }
        },
        transaction
      });

      if (!pendiente) {
        await transaction.rollback();
        return res.status(403).json({
          ok: false,
          message: 'Ese SKU no está pendiente para esta ronda de reconteo'
        });
      }

      if (pendiente.estado === 'pendiente_reconteo') {
        await pendiente.update({ estado: 'reconteo_en_proceso' }, { transaction });
      }
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

    const acumuladoSku = await Lectura.sum('cantidad', {
      where: {
        rondaId: ronda.id,
        sku: skuFinal,
        estado: 'valida'
      },
      transaction
    });

    // Actualizar última actividad de la ronda
    await ronda.update({ updatedAt: new Date() }, { transaction });

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      message: producto
        ? 'Lectura registrada correctamente'
        : 'Lectura registrada con producto resuelto desde SQL Server',
      data: {
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
          codigoBarra: producto ? producto.codigoBarra : externalProduct.codigoBarras,
          descripcion: descripcionFinal,
          source: producto ? 'postgres' : 'sqlserver'
        },
        acumuladoSku: Number(acumuladoSku || 0)
      }
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

// ==================== ANULAR LECTURA (BORRAR POR ERROR) ====================

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

    // Verificar que pertenezca al grupo del usuario (si no es admin/supervisor)
    if (!req.canViewAllGroups && lectura.grupoId !== req.grupoId) {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'No puedes anular una lectura de otro grupo'
      });
    }

    // No se puede anular una lectura ya anulada
    if (lectura.estado === 'anulada') {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'Esta lectura ya estaba anulada'
      });
    }

    await lectura.update({ estado: 'anulada' }, { transaction });

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

// ==================== RESUMEN DE LECTURAS (CON AISLAMIENTO POR GRUPO) ====================

async function getResumenLecturas(req, res, next) {
  try {
    const { inventarioId, conteoTipo, zonaId, grupoId, rondaId } = req.query;

    const where = {
      estado: 'valida'
    };

    if (inventarioId) where.inventarioId = inventarioId;
    if (conteoTipo) where.conteoTipo = conteoTipo;
    if (zonaId) where.zonaId = zonaId;
    if (rondaId) where.rondaId = rondaId;

    // 🔒 AISLAMIENTO: si no es admin/supervisor, solo ve su grupo
    if (!req.canViewAllGroups && req.grupoId) {
      where.grupoId = req.grupoId;
    } else if (grupoId && req.canViewAllGroups) {
      // Si es admin y quiere filtrar por grupo específico
      where.grupoId = grupoId;
    }

    const resumen = await Lectura.findAll({
      where,
      attributes: [
        'sku',
        'descripcionSnapshot',
        [sequelize.fn('SUM', sequelize.col('cantidad')), 'cantidadTotal']
      ],
      group: ['sku', 'descripcionSnapshot'],
      order: [[sequelize.literal('"cantidadTotal"'), 'DESC']]
    });

    res.json({
      ok: true,
      data: resumen
    });
  } catch (error) {
    next(error);
  }
}

// ==================== HISTORIAL DE LECTURAS ====================

async function getHistorialLecturas(req, res, next) {
  try {
    const { inventarioId, conteoTipo, zonaId, grupoId, rondaId, limit = 200 } = req.query;

    const where = {};

    if (inventarioId) where.inventarioId = inventarioId;
    if (conteoTipo) where.conteoTipo = conteoTipo;
    if (zonaId) where.zonaId = zonaId;
    if (rondaId) where.rondaId = rondaId;

    // 🔒 AISLAMIENTO: si no es admin/supervisor, solo ve su grupo
    if (!req.canViewAllGroups && req.grupoId) {
      where.grupoId = req.grupoId;
    } else if (grupoId && req.canViewAllGroups) {
      where.grupoId = grupoId;
    }

    const lecturas = await Lectura.findAll({
      where,
      order: [['fechaHora', 'DESC']],
      limit: parseInt(limit),
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

// ==================== ESTADÍSTICAS POR GRUPO/RONDA ====================

async function getEstadisticasGrupo(req, res, next) {
  try {
    const { rondaId, grupoId } = req.query;

    if (!rondaId || !grupoId) {
      return res.status(400).json({
        ok: false,
        message: 'rondaId y grupoId son requeridos'
      });
    }

    // Verificar acceso
    if (!req.canViewAllGroups && parseInt(grupoId) !== req.grupoId) {
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

    const totalEscaneos = lecturas.reduce((sum, l) => sum + l.cantidad, 0);
    const productosUnicos = new Set(lecturas.map(l => l.sku).filter(s => s)).size;
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
        tiempoFormateado: tiempoTotal ? `${Math.floor(tiempoTotal / 60)}m ${tiempoTotal % 60}s` : null,
        primeraLectura: primeraLectura?.fechaHora || null,
        ultimaLectura: ultimaLectura?.fechaHora || null
      }
    });
  } catch (error) {
    next(error);
  }
}

// ==================== EXPORTACIÓN DE RESULTADOS POR GRUPO ====================

async function exportarResultadosGrupo(req, res, next) {
  try {
    const { rondaId, grupoId, inventarioId } = req.query;

    if (!rondaId || !grupoId) {
      return res.status(400).json({
        ok: false,
        message: 'rondaId y grupoId son requeridos'
      });
    }

    // Verificar acceso
    if (!req.canViewAllGroups && parseInt(grupoId) !== req.grupoId) {
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
        resultados: resumen.map(item => ({
          sku: item.sku,
          descripcion: item.descripcionSnapshot,
          cantidadTotal: parseInt(item.dataValues.cantidadTotal)
        })),
        totalProductos: resumen.length,
        totalUnidades: resumen.reduce((sum, item) => sum + parseInt(item.dataValues.cantidadTotal), 0)
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
  exportarResultadosGrupo
};