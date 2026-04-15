const Joi = require('joi');
const {
  AsignacionConteo,
  Inventario,
  Grupo,
  Zona
} = require('../models');

const createAsignacionSchema = Joi.object({
  inventarioId: Joi.number().integer().required(),
  conteoTipo: Joi.number().integer().valid(1, 2, 3).required(),
  grupoId: Joi.number().integer().required(),
  zonaId: Joi.number().integer().required()
});

async function createAsignacion(req, res, next) {
  try {
    const { error, value } = createAsignacionSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const [inventario, grupo, zona] = await Promise.all([
      Inventario.findByPk(value.inventarioId),
      Grupo.findByPk(value.grupoId),
      Zona.findByPk(value.zonaId)
    ]);

    if (!inventario) {
      return res.status(404).json({
        ok: false,
        message: 'Inventario no encontrado'
      });
    }

    if (!grupo) {
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado'
      });
    }

    if (!zona) {
      return res.status(404).json({
        ok: false,
        message: 'Zona no encontrada'
      });
    }

    if (Number(grupo.inventarioId) !== Number(value.inventarioId)) {
      return res.status(400).json({
        ok: false,
        message: 'El grupo no pertenece a ese inventario'
      });
    }

    const existeGrupoEnConteo = await AsignacionConteo.findOne({
      where: {
        inventarioId: value.inventarioId,
        conteoTipo: value.conteoTipo,
        grupoId: value.grupoId
      }
    });

    if (existeGrupoEnConteo) {
      return res.status(400).json({
        ok: false,
        message: 'Ese grupo ya tiene una zona asignada en ese conteo'
      });
    }

    const existeZonaEnConteo = await AsignacionConteo.findOne({
      where: {
        inventarioId: value.inventarioId,
        conteoTipo: value.conteoTipo,
        zonaId: value.zonaId
      }
    });

    if (existeZonaEnConteo) {
      return res.status(400).json({
        ok: false,
        message: 'Esa zona ya fue asignada a otro grupo en ese conteo'
      });
    }

    const asignacion = await AsignacionConteo.create(value);

    res.status(201).json({
      ok: true,
      data: asignacion
    });
  } catch (error) {
    next(error);
  }
}

async function getAsignaciones(req, res, next) {
  try {
    const { inventarioId, conteoTipo } = req.query;

    const where = {};
    if (inventarioId) where.inventarioId = inventarioId;
    if (conteoTipo) where.conteoTipo = conteoTipo;

    const asignaciones = await AsignacionConteo.findAll({
      where,
      include: [
        { model: Grupo, as: 'grupo', attributes: ['id', 'nombre'] },
        { model: Zona, as: 'zona', attributes: ['id', 'nombre', 'codigo'] }
      ],
      order: [['conteoTipo', 'ASC'], ['id', 'ASC']]
    });

    res.json({
      ok: true,
      data: asignaciones
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createAsignacion,
  getAsignaciones
};