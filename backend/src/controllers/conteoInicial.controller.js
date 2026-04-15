const Joi = require('joi');
const {
  sequelize,
  Inventario,
  Zona,
  Producto,
  ConteoInicialDetalle,
  Op
} = require('../models');
const { parseConteoInicialExcel } = require('../utils/conteoInicialExcel');

const querySchema = Joi.object({
  inventarioId: Joi.number().integer().required()
});

async function importConteoInicialExcel(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const { error, value } = querySchema.validate(req.body);

    if (error) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    if (!req.file) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'Debes subir un archivo Excel .xlsx'
      });
    }

    const inventario = await Inventario.findByPk(value.inventarioId);
    if (!inventario) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Inventario no encontrado'
      });
    }

    const { rows, errors } = await parseConteoInicialExcel(req.file.buffer);

    let inserted = 0;
    let updated = 0;
    const unresolved = [];

    for (const item of rows) {
      const zona = await Zona.findOne({
        where: {
          [Op.or]: [
            { nombre: item.zona },
            { codigo: item.zona }
          ]
        },
        transaction
      });

      if (!zona) {
        unresolved.push({
          tipo: 'zona',
          zona: item.zona,
          sku: item.sku,
          codigo: item.codigo,
          message: 'Zona no encontrada'
        });
        continue;
      }

      let producto = null;

      if (item.sku || item.codigo) {
        producto = await Producto.findOne({
          where: {
            [Op.or]: [
              ...(item.sku ? [{ sku: item.sku }] : []),
              ...(item.codigo ? [{ codigoBarra: item.codigo }] : []),
              ...(item.codigo ? [{ codigoQr: item.codigo }] : [])
            ]
          },
          transaction
        });
      }

      const sku = producto?.sku || item.sku;
      const codigoLeido = item.codigo || producto?.codigoBarra || null;
      const descripcionSnapshot =
        producto?.descripcion || item.descripcion || null;

      if (!sku) {
        unresolved.push({
          tipo: 'producto',
          zona: item.zona,
          codigo: item.codigo,
          message: 'No se pudo resolver SKU del producto'
        });
        continue;
      }

      const existing = await ConteoInicialDetalle.findOne({
        where: {
          inventarioId: value.inventarioId,
          zonaId: zona.id,
          sku
        },
        transaction
      });

      if (!existing) {
        await ConteoInicialDetalle.create(
          {
            inventarioId: value.inventarioId,
            zonaId: zona.id,
            productoId: producto?.id || null,
            sku,
            codigoLeido,
            descripcionSnapshot,
            cantidad: item.cantidad,
            origenArchivo: req.file.originalname
          },
          { transaction }
        );
        inserted += 1;
      } else {
        await existing.update(
          {
            productoId: producto?.id || existing.productoId,
            codigoLeido,
            descripcionSnapshot,
            cantidad: item.cantidad,
            origenArchivo: req.file.originalname
          },
          { transaction }
        );
        updated += 1;
      }
    }

    await transaction.commit();

    res.json({
      ok: true,
      message: 'Conteo inicial importado correctamente',
      data: {
        totalLeidos: rows.length,
        insertados: inserted,
        actualizados: updated,
        erroresFilas: errors,
        noResueltos: unresolved
      }
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

async function getConteoInicialResumen(req, res, next) {
  try {
    const { inventarioId } = req.query;

    if (!inventarioId) {
      return res.status(400).json({
        ok: false,
        message: 'inventarioId es requerido'
      });
    }

    const data = await ConteoInicialDetalle.findAll({
      where: { inventarioId },
      include: [
        { model: Zona, as: 'zona', attributes: ['id', 'nombre', 'codigo'] }
      ],
      order: [['zonaId', 'ASC'], ['sku', 'ASC']]
    });

    res.json({
      ok: true,
      data
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  importConteoInicialExcel,
  getConteoInicialResumen
};