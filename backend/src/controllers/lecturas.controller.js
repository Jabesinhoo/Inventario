const Joi = require('joi');
const {
  sequelize,
  Op,
  Lectura,
  Producto,
  Inventario,
  Grupo,
  Zona,
  AsignacionConteo
} = require('../models');

const scanSchema = Joi.object({
  inventarioId: Joi.number().integer().required(),
  conteoTipo: Joi.number().integer().valid(1, 2, 3).required(),
  zonaId: Joi.number().integer().required(),
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

    const producto = await Producto.findOne({
      where: {
        activo: true,
        [Op.or]: [
          { codigoBarra: value.codigo },
          { codigoQr: value.codigo },
          { sku: value.codigo }
        ]
      }
    });

    let lectura;

    if (!producto) {
      lectura = await Lectura.create(
        {
          inventarioId: value.inventarioId,
          conteoTipo: value.conteoTipo,
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

    lectura = await Lectura.create(
      {
        inventarioId: value.inventarioId,
        conteoTipo: value.conteoTipo,
        zonaId: value.zonaId,
        grupoId: value.grupoId,
        usuarioId: req.user.id,
        productoId: producto.id,
        sku: producto.sku,
        codigoLeido: value.codigo,
        descripcionSnapshot: producto.descripcion,
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
        sku: producto.sku,
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
          id: producto.id,
          sku: producto.sku,
          codigoBarra: producto.codigoBarra,
          descripcion: producto.descripcion
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
    const { inventarioId, conteoTipo, zonaId, grupoId } = req.query;

    const where = {
      estado: 'valida'
    };

    if (inventarioId) where.inventarioId = inventarioId;
    if (conteoTipo) where.conteoTipo = conteoTipo;
    if (zonaId) where.zonaId = zonaId;
    if (grupoId) where.grupoId = grupoId;

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
    const { inventarioId, conteoTipo, zonaId, grupoId } = req.query;

    const where = {};
    if (inventarioId) where.inventarioId = inventarioId;
    if (conteoTipo) where.conteoTipo = conteoTipo;
    if (zonaId) where.zonaId = zonaId;
    if (grupoId) where.grupoId = grupoId;

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
  getResumenLecturas,
  getHistorialLecturas
};