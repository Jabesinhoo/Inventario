const Joi = require('joi');
const {
  AsignacionRonda,
  RondaConteo,
  Grupo,
  Zona
} = require('../models');

const createSchema = Joi.object({
  rondaId: Joi.number().integer().required(),
  grupoId: Joi.number().integer().required()
});

async function createAsignacionRonda(req, res, next) {
  try {
    const { error, value } = createSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const [ronda, grupo] = await Promise.all([
      RondaConteo.findByPk(value.rondaId),
      Grupo.findByPk(value.grupoId)
    ]);

    if (!ronda) {
      return res.status(404).json({ ok: false, message: 'Ronda no encontrada' });
    }

    if (!grupo) {
      return res.status(404).json({ ok: false, message: 'Grupo no encontrado' });
    }

    if (Number(grupo.inventarioId) !== Number(ronda.inventarioId)) {
      return res.status(400).json({
        ok: false,
        message: 'El grupo no pertenece al inventario de la ronda'
      });
    }

    const existente = await AsignacionRonda.findOne({
      where: { rondaId: value.rondaId }
    });

    if (existente) {
      return res.status(400).json({
        ok: false,
        message: 'La ronda ya tiene un grupo asignado'
      });
    }

    const asignacion = await AsignacionRonda.create(value);

    res.status(201).json({
      ok: true,
      data: asignacion
    });
  } catch (error) {
    next(error);
  }
}

async function getAsignacionesRonda(req, res, next) {
  try {
    const { rondaId } = req.query;

    const where = {};
    if (rondaId) where.rondaId = rondaId;

    const data = await AsignacionRonda.findAll({
      where,
      include: [
        {
          model: RondaConteo,
          as: 'ronda',
          include: [{ model: Zona, as: 'zona', attributes: ['id', 'nombre', 'codigo'] }]
        },
        {
          model: Grupo,
          as: 'grupo',
          attributes: ['id', 'nombre']
        }
      ],
      order: [['id', 'ASC']]
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
  createAsignacionRonda,
  getAsignacionesRonda
};