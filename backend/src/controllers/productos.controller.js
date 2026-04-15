const Joi = require('joi');
const { Producto, sequelize, Op } = require('../models');
const { parseProductosExcel } = require('../utils/productosExcel');

const createProductoSchema = Joi.object({
  sku: Joi.string().max(80).required(),
  codigoBarra: Joi.string().max(120).required(),
  codigoQr: Joi.string().max(120).allow(null, ''),
  descripcion: Joi.string().max(255).required(),
  categoria: Joi.string().max(120).allow(null, '')
});

async function createProducto(req, res, next) {
  try {
    const { error, value } = createProductoSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const producto = await Producto.create({
      ...value,
      codigoQr: value.codigoQr || null,
      categoria: value.categoria || null
    });

    res.status(201).json({
      ok: true,
      data: producto
    });
  } catch (error) {
    next(error);
  }
}

async function getProductos(req, res, next) {
  try {
    const { q } = req.query;

    const where = {};
    if (q) {
      where[Op.or] = [
        { sku: { [Op.iLike]: `%${q}%` } },
        { codigoBarra: { [Op.iLike]: `%${q}%` } },
        { codigoQr: { [Op.iLike]: `%${q}%` } },
        { descripcion: { [Op.iLike]: `%${q}%` } }
      ];
    }

    const productos = await Producto.findAll({
      where,
      order: [['descripcion', 'ASC']],
      limit: 100
    });

    res.json({
      ok: true,
      data: productos
    });
  } catch (error) {
    next(error);
  }
}

async function importProductosExcel(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    if (!req.file) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'Debes subir un archivo Excel .xlsx'
      });
    }

    const { rows, errors } = await parseProductosExcel(req.file.buffer);

    let inserted = 0;
    let updated = 0;
    const duplicateErrors = [];

    for (const item of rows) {
      const existing = await Producto.findOne({
        where: {
          [Op.or]: [
            { sku: item.sku },
            { codigoBarra: item.codigoBarra },
            ...(item.codigoQr ? [{ codigoQr: item.codigoQr }] : [])
          ]
        },
        transaction
      });

      if (!existing) {
        await Producto.create(
          {
            sku: item.sku,
            codigoBarra: item.codigoBarra,
            codigoQr: item.codigoQr || null,
            descripcion: item.descripcion,
            categoria: item.categoria || null,
            activo: true
          },
          { transaction }
        );
        inserted += 1;
        continue;
      }

      const sameProduct =
        existing.sku === item.sku ||
        existing.codigoBarra === item.codigoBarra ||
        (item.codigoQr && existing.codigoQr === item.codigoQr);

      if (!sameProduct) {
        duplicateErrors.push({
          sku: item.sku,
          codigoBarra: item.codigoBarra,
          message: 'Conflicto de claves únicas'
        });
        continue;
      }

      await existing.update(
        {
          sku: item.sku,
          codigoBarra: item.codigoBarra,
          codigoQr: item.codigoQr || null,
          descripcion: item.descripcion,
          categoria: item.categoria || null,
          activo: true
        },
        { transaction }
      );

      updated += 1;
    }

    await transaction.commit();

    return res.status(200).json({
      ok: true,
      message: 'Importación de productos completada',
      data: {
        totalLeidos: rows.length,
        insertados: inserted,
        actualizados: updated,
        erroresFilas: errors,
        erroresConflicto: duplicateErrors
      }
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

module.exports = {
  createProducto,
  getProductos,
  importProductosExcel
};