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
// Agregar estadísticas del grupo
async function getRondaActivaDelGrupo(req, res, next) {
  try {
    const { grupoId } = req.query;
    
    if (!grupoId) {
      return res.status(400).json({
        ok: false,
        message: 'grupoId es requerido'
      });
    }
    
    const ronda = await RondaConteo.findOne({
      include: [{
        model: AsignacionRonda,
        as: 'asignacion',
        where: { grupoId },
        required: true
      }],
      where: { estado: 'activa' },
      include: [{ model: Zona, as: 'zona', attributes: ['id', 'nombre', 'codigo'] }]
    });
    
    res.json({
      ok: true,
      data: ronda || null
    });
  } catch (error) {
    next(error);
  }
}

// Asignar usuario a grupo
async function asignarUsuario(req, res, next) {
  try {
    const { grupoId, usuarioId } = req.body;
    
    const usuario = await Usuario.findByPk(usuarioId);
    if (!usuario) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
    }
    
    await usuario.update({ grupoId });
    
    res.json({ ok: true, message: 'Usuario asignado correctamente' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createGrupo,
  getGrupos,
  asignarUsuario,
  getGrupoEstadisticas
};