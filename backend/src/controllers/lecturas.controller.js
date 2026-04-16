const Joi = require('joi');
const {
  sequelize,
  Op,
  Lectura,
  Producto,
  Inventario,
  Grupo,
  Zona,
  AsignacionConteo,
  RondaConteo,
  AsignacionRonda,
  DiscrepanciaConteo
} = require('../models');
const { findProductoExternoByCodigo } = require('../services/sqlserverInventarios.service');

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
          { codigoBarra: value.codigo },
          { codigoQr: value.codigo },
          { sku: value.codigo }
        ]
      },
      transaction
    });

    let externalProduct = null;

    if (!producto) {
      externalProduct = await findProductoExternoByCodigo(value.codigo);
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
          codigoLeido: value.codigo,
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
          codigo: value.codigo,
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
        codigoLeido: value.codigo,
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
          { codigoBarra: value.codigo },
          { codigoQr: value.codigo },
          { sku: value.codigo }
        ]
      },
      transaction
    });

    let externalProduct = null;

    if (!producto) {
      externalProduct = await findProductoExternoByCodigo(value.codigo);
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
          codigoLeido: value.codigo,
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
          codigo: value.codigo,
          estado: lectura.estado
        }
      });
    }

    const skuFinal = producto ? producto.sku : externalProduct.codigoInventario;
    const descripcionFinal = producto ? producto.descripcion : externalProduct.descripcion;
    const productoIdFinal = producto ? producto.id : null;

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
        codigoLeido: value.codigo,
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
          tipoRonda: ronda.tipoRonda
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

async function getResumenLecturas(req, res, next) {
  try {
    const { inventarioId, conteoTipo, zonaId, grupoId, rondaId } = req.query;

    const where = {
      estado: 'valida'
    };

    if (inventarioId) where.inventarioId = inventarioId;
    if (conteoTipo) where.conteoTipo = conteoTipo;
    if (zonaId) where.zonaId = zonaId;
    if (grupoId) where.grupoId = grupoId;
    if (rondaId) where.rondaId = rondaId;

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

async function getHistorialLecturas(req, res, next) {
  try {
    const { inventarioId, conteoTipo, zonaId, grupoId, rondaId } = req.query;

    const where = {};
    if (inventarioId) where.inventarioId = inventarioId;
    if (conteoTipo) where.conteoTipo = conteoTipo;
    if (zonaId) where.zonaId = zonaId;
    if (grupoId) where.grupoId = grupoId;
    if (rondaId) where.rondaId = rondaId;

    const lecturas = await Lectura.findAll({
      where,
      order: [['fechaHora', 'DESC']],
      limit: 200
    });

    res.json({
      ok: true,
      data: lecturas
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  scanLectura,
  scanLecturaRonda,
  getResumenLecturas,
  getHistorialLecturas
};