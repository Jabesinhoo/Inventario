const Joi = require('joi');
const { Grupo, Inventario } = require('../models');

const createGrupoSchema = Joi.object({
  inventarioId: Joi.number().integer().required(),
  nombre: Joi.string().max(120).required()
});

async function createGrupo(req, res, next) {
  try {
    const { error, value } = createGrupoSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const inventario = await Inventario.findByPk(value.inventarioId);

    if (!inventario) {
      return res.status(404).json({
        ok: false,
        message: 'Inventario no encontrado'
      });
    }

    const grupo = await Grupo.create(value);

    res.status(201).json({
      ok: true,
      data: grupo
    });
  } catch (error) {
    next(error);
  }
}

async function getGrupos(req, res, next) {
  try {
    const { inventarioId } = req.query;

    const where = {};
    if (inventarioId) where.inventarioId = inventarioId;

    const grupos = await Grupo.findAll({
      where,
      order: [['nombre', 'ASC']]
    });

    res.json({
      ok: true,
      data: grupos
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createGrupo,
  getGrupos
};