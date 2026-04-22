const Joi = require('joi');
const { UniqueConstraintError } = require('sequelize');
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

    const inventarioId = Number(value.inventarioId);
    const conteoTipo = Number(value.conteoTipo);
    const grupoId = Number(value.grupoId);
    const zonaId = Number(value.zonaId);

    const [inventario, grupo, zona] = await Promise.all([
      Inventario.findByPk(inventarioId),
      Grupo.findByPk(grupoId),
      Zona.findByPk(zonaId)
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

    if (Number(grupo.inventarioId) !== inventarioId) {
      return res.status(400).json({
        ok: false,
        message: 'El grupo no pertenece a ese inventario'
      });
    }

    // 1) Evitar duplicado exacto del mismo grupo en el mismo conteo
    const existeAsignacionExactaGrupo = await AsignacionConteo.findOne({
      where: {
        inventarioId,
        conteoTipo,
        grupoId
      }
    });

    if (existeAsignacionExactaGrupo) {
      return res.status(400).json({
        ok: false,
        message: 'Ese grupo ya tiene una zona asignada en ese conteo'
      });
    }

    // 2) Evitar duplicado exacto de la misma zona en el mismo conteo
    const existeAsignacionExactaZona = await AsignacionConteo.findOne({
      where: {
        inventarioId,
        conteoTipo,
        zonaId
      }
    });

    if (existeAsignacionExactaZona) {
      return res.status(400).json({
        ok: false,
        message: 'Esa zona ya fue asignada a otro grupo en ese conteo'
      });
    }

    // 3) Regla de negocio:
    // un grupo no puede quedar asociado a distintas zonas dentro del mismo inventario
    const grupoYaTieneOtraZona = await AsignacionConteo.findOne({
      where: {
        inventarioId,
        grupoId
      },
      include: [
        {
          model: Zona,
          as: 'zona',
          attributes: ['id', 'nombre', 'codigo']
        }
      ]
    });

    if (grupoYaTieneOtraZona && Number(grupoYaTieneOtraZona.zonaId) !== zonaId) {
      return res.status(400).json({
        ok: false,
        message: `El grupo ya está vinculado a la zona "${grupoYaTieneOtraZona.zona?.nombre || grupoYaTieneOtraZona.zonaId}" en este inventario y no puede tener otra distinta.`
      });
    }

    // 4) Regla de negocio:
    // una zona no puede quedar asociada a distintos grupos dentro del mismo inventario
    const zonaYaTieneOtroGrupo = await AsignacionConteo.findOne({
      where: {
        inventarioId,
        zonaId
      },
      include: [
        {
          model: Grupo,
          as: 'grupo',
          attributes: ['id', 'nombre']
        }
      ]
    });

    if (zonaYaTieneOtroGrupo && Number(zonaYaTieneOtroGrupo.grupoId) !== grupoId) {
      return res.status(400).json({
        ok: false,
        message: `La zona ya está vinculada al grupo "${zonaYaTieneOtroGrupo.grupo?.nombre || zonaYaTieneOtroGrupo.grupoId}" en este inventario y no puede asignarse a otro grupo.`
      });
    }

    const asignacion = await AsignacionConteo.create({
      inventarioId,
      conteoTipo,
      grupoId,
      zonaId
    });

    const asignacionCreada = await AsignacionConteo.findByPk(asignacion.id, {
      include: [
        { model: Grupo, as: 'grupo', attributes: ['id', 'nombre', 'inventarioId'] },
        { model: Zona, as: 'zona', attributes: ['id', 'nombre', 'codigo'] }
      ]
    });

    return res.status(201).json({
      ok: true,
      data: asignacionCreada
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      return res.status(400).json({
        ok: false,
        message: 'Ya existe una asignación con esos datos. Verifica que el grupo y la zona no estén repetidos.'
      });
    }

    next(error);
  }
}

async function getAsignaciones(req, res, next) {
  try {
    const { inventarioId, conteoTipo } = req.query;

    const where = {};

    if (inventarioId) where.inventarioId = Number(inventarioId);
    if (conteoTipo) where.conteoTipo = Number(conteoTipo);

    const asignaciones = await AsignacionConteo.findAll({
      where,
      include: [
        { model: Grupo, as: 'grupo', attributes: ['id', 'nombre', 'inventarioId', 'liderId', 'color', 'estado'] },
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