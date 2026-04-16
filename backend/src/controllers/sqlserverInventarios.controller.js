const Joi = require('joi');
const { findProductoExternoByCodigo } = require('../services/sqlserverInventarios.service');

const schema = Joi.object({
  codigo: Joi.string().trim().required()
});

async function buscarProductoExterno(req, res, next) {
  try {
    const { error, value } = schema.validate(req.query);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const producto = await findProductoExternoByCodigo(value.codigo);

    if (!producto) {
      return res.status(404).json({
        ok: false,
        message: 'Producto no encontrado en SQL Server'
      });
    }

    res.json({
      ok: true,
      data: producto
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  buscarProductoExterno
};