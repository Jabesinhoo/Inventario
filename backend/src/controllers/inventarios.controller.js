const Joi = require('joi');
const { Inventario } = require('../models');

const createInventarioSchema = Joi.object({
  nombre: Joi.string().max(150).required(),
  fecha: Joi.date().required()
});

async function createInventario(req, res, next) {
  try {
    const { error, value } = createInventarioSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const inventario = await Inventario.create({
      nombre: value.nombre,
      fecha: value.fecha
    });

    res.status(201).json({
      ok: true,
      data: inventario
    });
  } catch (error) {
    next(error);
  }
}

async function getInventarios(req, res, next) {
  try {
    const inventarios = await Inventario.findAll({
      order: [['fecha', 'DESC']]
    });

    res.json({
      ok: true,
      data: inventarios
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createInventario,
  getInventarios
};