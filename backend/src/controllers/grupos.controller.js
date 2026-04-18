const Joi = require('joi');
const { QueryTypes } = require('sequelize');
const { Grupo, Inventario, Usuario, sequelize } = require('../models');

const createGrupoSchema = Joi.object({
  inventarioId: Joi.number().integer().required(),
  nombre: Joi.string().max(120).required(),
  liderId: Joi.number().integer().allow(null),
  color: Joi.string().max(20).default('#3b82f6')
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
      include: [
        { model: Usuario, as: 'lider', attributes: ['id', 'nombre', 'email'], required: false },
        { model: Inventario, as: 'inventario', attributes: ['id', 'nombre', 'fecha'] }
      ],
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

async function getGrupo(req, res, next) {
  try {
    const { id } = req.params;

    const grupo = await Grupo.findByPk(id, {
      include: [
        { model: Usuario, as: 'lider', attributes: ['id', 'nombre', 'email'] },
        { model: Inventario, as: 'inventario', attributes: ['id', 'nombre', 'fecha'] }
      ]
    });

    if (!grupo) {
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado'
      });
    }

    res.json({
      ok: true,
      data: grupo
    });
  } catch (error) {
    next(error);
  }
}

async function updateGrupo(req, res, next) {
  try {
    const { id } = req.params;
    const { error, value } = createGrupoSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const grupo = await Grupo.findByPk(id);

    if (!grupo) {
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado'
      });
    }

    await grupo.update(value);

    res.json({
      ok: true,
      data: grupo
    });
  } catch (error) {
    next(error);
  }
}

async function deleteGrupo(req, res, next) {
  try {
    const { id } = req.params;

    const grupo = await Grupo.findByPk(id);

    if (!grupo) {
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado'
      });
    }

    await grupo.destroy();

    res.json({
      ok: true,
      message: 'Grupo eliminado correctamente'
    });
  } catch (error) {
    next(error);
  }
}

// 👇 AGREGAR ESTA FUNCIÓN 👇
async function getGrupoEstadisticas(req, res, next) {
  try {
    const { id } = req.params;
    
    const estadisticas = await sequelize.query(`
      SELECT 
        g.id,
        g.nombre,
        g.color,
        COUNT(DISTINCT l.id) as total_escaneos,
        COUNT(DISTINCT l.sku) as productos_distintos,
        COALESCE(SUM(l.cantidad), 0) as total_unidades,
        MIN(l."fechaHora") as inicio,
        MAX(l."fechaHora") as fin,
        COUNT(DISTINCT l."rondaId") as rondas_participadas,
        COALESCE(SUM(CASE WHEN l.estado = 'valida' THEN l.cantidad ELSE 0 END), 0) as total_validos,
        COALESCE(SUM(CASE WHEN l.estado = 'no_reconocida' THEN 1 ELSE 0 END), 0) as no_reconocidos,
        COUNT(DISTINCT l."usuarioId") as usuarios_activos
      FROM grupos g
      LEFT JOIN lecturas l ON l."grupoId" = g.id
      WHERE g.id = :id
      GROUP BY g.id, g.nombre, g.color
    `, {
      replacements: { id },
      type: QueryTypes.SELECT
    });
    
    const stats = estadisticas[0] || {};
    
    // Calcular tiempo de actividad
    let tiempoActivo = null;
    let rendimientoPorHora = 0;
    
    if (stats.inicio && stats.fin) {
      const horas = (new Date(stats.fin) - new Date(stats.inicio)) / (1000 * 60 * 60);
      tiempoActivo = horas.toFixed(1) + 'h';
      rendimientoPorHora = horas > 0 ? Math.round(stats.total_unidades / horas) : 0;
    }
    
    res.json({
      ok: true,
      data: {
        id: stats.id,
        nombre: stats.nombre,
        color: stats.color,
        total_escaneos: Number(stats.total_escaneos) || 0,
        productos_distintos: Number(stats.productos_distintos) || 0,
        total_unidades: Number(stats.total_unidades) || 0,
        rondas_participadas: Number(stats.rondas_participadas) || 0,
        total_validos: Number(stats.total_validos) || 0,
        no_reconocidos: Number(stats.no_reconocidos) || 0,
        usuarios_activos: Number(stats.usuarios_activos) || 0,
        tiempo_activo: tiempoActivo,
        rendimiento_por_hora: rendimientoPorHora
      }
    });
  } catch (error) {
    console.error('[GRUPO ESTADISTICAS] Error:', error);
    next(error);
  }
}

// 👇 AGREGAR ESTA FUNCIÓN PARA ASIGNAR USUARIO 👇
async function asignarUsuario(req, res, next) {
  try {
    const { usuarioId, grupoId } = req.body;
    
    const usuario = await Usuario.findByPk(usuarioId);
    if (!usuario) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado'
      });
    }
    
    await usuario.update({ grupoId: grupoId || null });
    
    res.json({
      ok: true,
      message: grupoId ? 'Usuario asignado al grupo' : 'Usuario removido del grupo'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createGrupo,
  getGrupos,
  getGrupo,
  updateGrupo,
  deleteGrupo,
  getGrupoEstadisticas,
  asignarUsuario
};