const Joi = require('joi');
const { Zona } = require('../models');

const createZonaSchema = Joi.object({
  nombre: Joi.string().max(120).required(),
  codigo: Joi.string().max(40).required()
});

async function createZona(req, res, next) {
  try {
    const { error, value } = createZonaSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const zona = await Zona.create(value);

    res.status(201).json({
      ok: true,
      data: zona
    });
  } catch (error) {
    next(error);
  }
}

async function getZonas(req, res, next) {
  try {
    const zonas = await Zona.findAll({
      order: [['nombre', 'ASC']]
    });

    res.json({
      ok: true,
      data: zonas
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createZona,
  getZonas
};