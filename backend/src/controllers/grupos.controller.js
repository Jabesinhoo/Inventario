const { Op } = require('sequelize');
const Joi = require('joi');
const { QueryTypes } = require('sequelize');
const { Grupo, Inventario, Usuario, Rol, Zona, AsignacionConteo, sequelize } = require('../models');

const createGrupoSchema = Joi.object({
  inventarioId: Joi.number().integer().required(),
  nombre: Joi.string().max(120).required(),
  liderId: Joi.number().integer().allow(null),
  color: Joi.string().max(20).default('#3b82f6'),
  zonaId: Joi.number().integer().allow(null)
});

// ==================== CRUD BÁSICO ====================

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

    // 🔒 Validar que no exista un grupo con el mismo nombre en este inventario
    const grupoExistente = await Grupo.findOne({
      where: {
        inventarioId: value.inventarioId,
        nombre: value.nombre
      }
    });

    if (grupoExistente) {
      return res.status(400).json({
        ok: false,
        message: `Ya existe un grupo con el nombre "${value.nombre}" en este inventario.`
      });
    }

    // Validar que el líder no sea líder de otro grupo en este inventario
    if (value.liderId) {
      const liderExistente = await Grupo.findOne({
        where: {
          inventarioId: value.inventarioId,
          liderId: value.liderId
        }
      });

      if (liderExistente) {
        return res.status(400).json({
          ok: false,
          message: 'Este usuario ya es líder de otro grupo en este inventario.'
        });
      }

      // Validar que el líder no sea miembro de otro grupo en este inventario
      const esMiembro = await sequelize.query(`
        SELECT 1 FROM usuario_grupo ug
        JOIN grupos g ON g.id = ug."grupoId"
        WHERE ug."usuarioId" = :usuarioId
          AND g."inventarioId" = :inventarioId
          AND ug."esLider" = false
      `, {
        replacements: { usuarioId: value.liderId, inventarioId: value.inventarioId },
        type: QueryTypes.SELECT
      });

      if (esMiembro.length > 0) {
        return res.status(400).json({
          ok: false,
          message: 'Este usuario es miembro de otro grupo en este inventario. No puede ser líder.'
        });
      }
    }

    // Crear el grupo
    const grupo = await Grupo.create(value);

    // Si tiene líder, crear relación en tabla intermedia
    if (value.liderId) {
      await sequelize.query(`
        INSERT INTO usuario_grupo ("usuarioId", "grupoId", "esLider", "fechaAsignacion", "createdAt", "updatedAt")
        VALUES (:usuarioId, :grupoId, true, NOW(), NOW(), NOW())
      `, {
        replacements: { usuarioId: value.liderId, grupoId: grupo.id },
        type: QueryTypes.INSERT
      });
    }

    // Si se asignó una zona, crear la asignación automáticamente
    if (value.zonaId) {
      await AsignacionConteo.create({
        inventarioId: value.inventarioId,
        conteoTipo: 1,
        grupoId: grupo.id,
        zonaId: value.zonaId
      });
    }

    res.status(201).json({
      ok: true,
      data: grupo
    });
  } catch (error) {
    console.error('[CREATE GRUPO] Error:', error);
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

    // Para cada grupo, contar sus miembros y obtener zona asignada
    const gruposConMiembros = await Promise.all(grupos.map(async (grupo) => {
      const miembros = await sequelize.query(`
        SELECT u.id, u.nombre, u.email, u."rolId"
        FROM usuario_grupo ug
        JOIN usuarios u ON u.id = ug."usuarioId"
        WHERE ug."grupoId" = :grupoId
      `, {
        replacements: { grupoId: grupo.id },
        type: QueryTypes.SELECT
      });

      // Obtener zona asignada
      const asignacion = await AsignacionConteo.findOne({
        where: {
          inventarioId: grupo.inventarioId,
          grupoId: grupo.id,
          conteoTipo: 1
        },
        include: [{ model: Zona, as: 'zona', attributes: ['id', 'nombre', 'codigo'] }]
      });

      return {
        ...grupo.toJSON(),
        miembros: miembros,
        totalMiembros: miembros.length,
        zonaAsignada: asignacion?.zona || null
      };
    }));

    res.json({
      ok: true,
      data: gruposConMiembros
    });
  } catch (error) {
    console.error('[GET GRUPOS] Error:', error);
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

    // Obtener la zona asignada
    const asignacion = await AsignacionConteo.findOne({
      where: {
        inventarioId: grupo.inventarioId,
        grupoId: grupo.id,
        conteoTipo: 1
      },
      include: [{ model: Zona, as: 'zona', attributes: ['id', 'nombre', 'codigo'] }]
    });

    const miembros = await sequelize.query(`
      SELECT u.id, u.nombre, u.email, u."rolId"
      FROM usuario_grupo ug
      JOIN usuarios u ON u.id = ug."usuarioId"
      WHERE ug."grupoId" = :grupoId
    `, {
      replacements: { grupoId: grupo.id },
      type: QueryTypes.SELECT
    });

    res.json({
      ok: true,
      data: {
        ...grupo.toJSON(),
        miembros: miembros,
        totalMiembros: miembros.length,
        zonaAsignada: asignacion?.zona || null
      }
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

    // Validar que no exista otro grupo con el mismo nombre en este inventario
    if (value.nombre !== grupo.nombre) {
      const grupoExistente = await Grupo.findOne({
        where: {
          inventarioId: grupo.inventarioId,
          nombre: value.nombre,
          id: { [Op.ne]: id }
        }
      });

      if (grupoExistente) {
        return res.status(400).json({
          ok: false,
          message: `Ya existe un grupo con el nombre "${value.nombre}" en este inventario.`
        });
      }
    }

    // Validar que el líder no sea líder de otro grupo en este inventario
    if (value.liderId && value.liderId !== grupo.liderId) {
      const liderExistente = await Grupo.findOne({
        where: {
          inventarioId: grupo.inventarioId,
          liderId: value.liderId,
          id: { [Op.ne]: id }
        }
      });

      if (liderExistente) {
        return res.status(400).json({
          ok: false,
          message: 'Este usuario ya es líder de otro grupo en este inventario.'
        });
      }

      // Validar que el líder no sea miembro de otro grupo en este inventario
      const esMiembro = await sequelize.query(`
        SELECT 1 FROM usuario_grupo ug
        JOIN grupos g ON g.id = ug."grupoId"
        WHERE ug."usuarioId" = :usuarioId
          AND g."inventarioId" = :inventarioId
          AND ug."esLider" = false
          AND g.id != :grupoId
      `, {
        replacements: { usuarioId: value.liderId, inventarioId: grupo.inventarioId, grupoId: id },
        type: QueryTypes.SELECT
      });

      if (esMiembro.length > 0) {
        return res.status(400).json({
          ok: false,
          message: 'Este usuario es miembro de otro grupo en este inventario. No puede ser líder.'
        });
      }
    }

    // Actualizar líder en tabla intermedia si cambió
    if (value.liderId !== grupo.liderId) {
      // Remover líder anterior
      await sequelize.query(`
        DELETE FROM usuario_grupo WHERE "grupoId" = :grupoId AND "esLider" = true
      `, {
        replacements: { grupoId: id },
        type: QueryTypes.DELETE
      });

      // Agregar nuevo líder
      if (value.liderId) {
        await sequelize.query(`
          INSERT INTO usuario_grupo ("usuarioId", "grupoId", "esLider", "fechaAsignacion", "createdAt", "updatedAt")
          VALUES (:usuarioId, :grupoId, true, NOW(), NOW(), NOW())
        `, {
          replacements: { usuarioId: value.liderId, grupoId: id },
          type: QueryTypes.INSERT
        });
      }
    }

    await grupo.update(value);

    // Actualizar zona asignada si cambió
    if (value.zonaId) {
      await AsignacionConteo.upsert({
        inventarioId: grupo.inventarioId,
        conteoTipo: 1,
        grupoId: grupo.id,
        zonaId: value.zonaId
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

    const lecturas = await sequelize.query(
      `
      SELECT COUNT(*)::int AS total
      FROM lecturas
      WHERE "grupoId" = :grupoId
      `,
      {
        replacements: { grupoId: id },
        type: QueryTypes.SELECT
      }
    );

    const totalLecturas = Number(lecturas?.[0]?.total || 0);

    if (totalLecturas > 0) {
      return res.status(409).json({
        ok: false,
        message: 'No puedes eliminar este grupo porque ya tiene lecturas registradas. Crea otro grupo o déjalo sin uso.'
      });
    }

    await sequelize.query(
      `
      DELETE FROM usuario_grupo WHERE "grupoId" = :grupoId
      `,
      {
        replacements: { grupoId: id },
        type: QueryTypes.DELETE
      }
    );

    await AsignacionConteo.destroy({
      where: { grupoId: id }
    });

    await grupo.destroy();

    res.json({
      ok: true,
      message: 'Grupo eliminado correctamente'
    });
  } catch (error) {
    next(error);
  }
}
// ==================== ESTADÍSTICAS ====================

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
        COALESCE(SUM(CASE WHEN l.estado = 'no_reconocida' THEN 1 ELSE 0 END), 0) as no_reconocidos
      FROM grupos g
      LEFT JOIN lecturas l ON l."grupoId" = g.id
      WHERE g.id = :id
      GROUP BY g.id, g.nombre, g.color
    `, {
      replacements: { id },
      type: QueryTypes.SELECT
    });

    const stats = estadisticas[0] || {};

    let tiempoActivo = null;
    let rendimientoPorHora = 0;

    if (stats.inicio && stats.fin) {
      const horas = (new Date(stats.fin) - new Date(stats.inicio)) / (1000 * 60 * 60);
      tiempoActivo = horas.toFixed(1) + 'h';
      rendimientoPorHora = horas > 0 ? Math.round(stats.total_unidades / horas) : 0;
    }

    const miembros = await sequelize.query(`
      SELECT u.id, u.nombre, u.email
      FROM usuario_grupo ug
      JOIN usuarios u ON u.id = ug."usuarioId"
      WHERE ug."grupoId" = :grupoId
    `, {
      replacements: { grupoId: id },
      type: QueryTypes.SELECT
    });

    res.json({
      ok: true,
      data: {
        id: stats.id,
        nombre: stats.nombre,
        color: stats.color,
        miembros: miembros,
        totalMiembros: miembros.length,
        total_escaneos: Number(stats.total_escaneos) || 0,
        productos_distintos: Number(stats.productos_distintos) || 0,
        total_unidades: Number(stats.total_unidades) || 0,
        rondas_participadas: Number(stats.rondas_participadas) || 0,
        total_validos: Number(stats.total_validos) || 0,
        no_reconocidos: Number(stats.no_reconocidos) || 0,
        tiempo_activo: tiempoActivo,
        rendimiento_por_hora: rendimientoPorHora
      }
    });
  } catch (error) {
    console.error('[GRUPO ESTADISTICAS] Error:', error);
    next(error);
  }
}

// ==================== MIEMBROS (TABLA INTERMEDIA) ====================

async function getMiembrosDelGrupo(req, res, next) {
  try {
    const { grupoId } = req.params;

    const miembros = await sequelize.query(`
      SELECT u.id, u.nombre, u.email, u."rolId", r.nombre as rol, ug."esLider", ug."fechaAsignacion"
      FROM usuario_grupo ug
      JOIN usuarios u ON u.id = ug."usuarioId"
      LEFT JOIN roles r ON r.id = u."rolId"
      WHERE ug."grupoId" = :grupoId
      ORDER BY ug."esLider" DESC, u.nombre
    `, {
      replacements: { grupoId },
      type: QueryTypes.SELECT
    });

    res.json({ ok: true, data: miembros });
  } catch (error) {
    next(error);
  }
}

async function asignarUsuarioAGrupo(req, res, next) {
  try {
    const { usuarioId, grupoId, esLider = false } = req.body;

    // Verificar si ya existe la relación
    const existe = await sequelize.query(`
      SELECT 1 FROM usuario_grupo WHERE "usuarioId" = :usuarioId AND "grupoId" = :grupoId
    `, {
      replacements: { usuarioId, grupoId },
      type: QueryTypes.SELECT
    });

    if (existe.length > 0) {
      return res.status(400).json({
        ok: false,
        message: 'El usuario ya pertenece a este grupo'
      });
    }

    // Obtener el grupo destino
    const grupoDestino = await Grupo.findByPk(grupoId);
    if (!grupoDestino) {
      return res.status(404).json({ ok: false, message: 'Grupo no encontrado' });
    }

    // 🔒 VALIDACIÓN: Si es líder, no puede ser miembro de otro grupo en el mismo inventario
    if (esLider) {
      const esMiembroEnInventario = await sequelize.query(`
        SELECT 1 FROM usuario_grupo ug
        JOIN grupos g ON g.id = ug."grupoId"
        WHERE ug."usuarioId" = :usuarioId
          AND g."inventarioId" = :inventarioId
          AND ug."esLider" = false
      `, {
        replacements: { usuarioId, inventarioId: grupoDestino.inventarioId },
        type: QueryTypes.SELECT
      });

      if (esMiembroEnInventario.length > 0) {
        return res.status(400).json({
          ok: false,
          message: 'Este usuario es miembro de otro grupo en este inventario. No puede ser líder.'
        });
      }
    }

    // 🔒 VALIDACIÓN: Si es miembro, no puede ser líder de otro grupo en el mismo inventario
    if (!esLider) {
      const esLiderEnInventario = await sequelize.query(`
        SELECT 1 FROM usuario_grupo ug
        JOIN grupos g ON g.id = ug."grupoId"
        WHERE ug."usuarioId" = :usuarioId
          AND g."inventarioId" = :inventarioId
          AND ug."esLider" = true
      `, {
        replacements: { usuarioId, inventarioId: grupoDestino.inventarioId },
        type: QueryTypes.SELECT
      });

      if (esLiderEnInventario.length > 0) {
        return res.status(400).json({
          ok: false,
          message: 'Este usuario es líder de otro grupo en este inventario. No puede ser miembro.'
        });
      }
    }

    // Verificar que no esté en otro grupo del mismo inventario (ya sea líder o miembro)
    const mismoInventario = await sequelize.query(`
      SELECT 1 FROM usuario_grupo ug
      JOIN grupos g ON g.id = ug."grupoId"
      WHERE ug."usuarioId" = :usuarioId
        AND g."inventarioId" = :inventarioId
    `, {
      replacements: { usuarioId, inventarioId: grupoDestino.inventarioId },
      type: QueryTypes.SELECT
    });

    if (mismoInventario.length > 0) {
      return res.status(400).json({
        ok: false,
        message: 'El usuario ya pertenece a otro grupo (como líder o miembro) en este inventario.'
      });
    }

    // Insertar la relación
    await sequelize.query(`
      INSERT INTO usuario_grupo ("usuarioId", "grupoId", "esLider", "fechaAsignacion", "createdAt", "updatedAt")
      VALUES (:usuarioId, :grupoId, :esLider, NOW(), NOW(), NOW())
    `, {
      replacements: { usuarioId, grupoId, esLider },
      type: QueryTypes.INSERT
    });

    // Si es líder, actualizar liderId en grupos
    if (esLider) {
      await Grupo.update({ liderId: usuarioId }, { where: { id: grupoId } });
    }

    res.json({ ok: true, message: 'Usuario asignado al grupo correctamente' });
  } catch (error) {
    console.error('[ASIGNAR USUARIO] Error:', error);
    next(error);
  }
}

async function removerUsuarioDeGrupo(req, res, next) {
  try {
    const { usuarioId, grupoId } = req.body;

    // Verificar si es líder
    const esLider = await sequelize.query(`
      SELECT "esLider" FROM usuario_grupo 
      WHERE "usuarioId" = :usuarioId AND "grupoId" = :grupoId
    `, {
      replacements: { usuarioId, grupoId },
      type: QueryTypes.SELECT
    });

    // Eliminar la relación
    await sequelize.query(`
      DELETE FROM usuario_grupo 
      WHERE "usuarioId" = :usuarioId AND "grupoId" = :grupoId
    `, {
      replacements: { usuarioId, grupoId },
      type: QueryTypes.DELETE
    });

    // Si era líder, limpiar liderId
    if (esLider.length > 0 && esLider[0].esLider) {
      const otroLider = await sequelize.query(`
        SELECT 1 FROM usuario_grupo 
        WHERE "grupoId" = :grupoId AND "esLider" = true AND "usuarioId" != :usuarioId
      `, {
        replacements: { grupoId, usuarioId },
        type: QueryTypes.SELECT
      });

      if (otroLider.length === 0) {
        await Grupo.update({ liderId: null }, { where: { id: grupoId } });
      }
    }

    res.json({ ok: true, message: 'Usuario removido del grupo correctamente' });
  } catch (error) {
    next(error);
  }
}
async function getLideresDisponiblesParaGrupo(req, res, next) {
  try {
    const { grupoId } = req.params;

    const grupo = await Grupo.findByPk(grupoId);
    if (!grupo) {
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado'
      });
    }

    const disponibles = await sequelize.query(`
      SELECT 
        u.id,
        u.nombre,
        u.email,
        u."rolId",
        r.nombre as rol
      FROM usuarios u
      LEFT JOIN roles r ON r.id = u."rolId"
      WHERE u.activo = true
        AND NOT EXISTS (
          SELECT 1
          FROM usuario_grupo ug
          JOIN grupos g ON g.id = ug."grupoId"
          WHERE ug."usuarioId" = u.id
            AND g."inventarioId" = :inventarioId
            AND g.id != :grupoId
        )
      ORDER BY u.nombre
    `, {
      replacements: {
        inventarioId: grupo.inventarioId,
        grupoId
      },
      type: QueryTypes.SELECT
    });

    res.json({
      ok: true,
      data: disponibles
    });
  } catch (error) {
    next(error);
  }
}

async function getUsuariosDisponiblesParaGrupo(req, res, next) {
  try {
    const { grupoId } = req.params;

    const grupo = await Grupo.findByPk(grupoId);
    if (!grupo) {
      return res.status(404).json({ ok: false, message: 'Grupo no encontrado' });
    }

    const disponibles = await sequelize.query(`
      SELECT u.id, u.nombre, u.email, u."rolId", r.nombre as rol
      FROM usuarios u
      LEFT JOIN roles r ON r.id = u."rolId"
      WHERE u.activo = true
        AND u.id NOT IN (
          SELECT ug."usuarioId"
          FROM usuario_grupo ug
          JOIN grupos g ON g.id = ug."grupoId"
          WHERE g."inventarioId" = :inventarioId
        )
        AND u.id NOT IN (
          SELECT DISTINCT liderId FROM grupos WHERE "inventarioId" = :inventarioId AND liderId IS NOT NULL
        )
      ORDER BY u.nombre
    `, {
      replacements: { inventarioId: grupo.inventarioId },
      type: QueryTypes.SELECT
    });

    res.json({ ok: true, data: disponibles });
  } catch (error) {
    next(error);
  }
}

async function getUsuariosDisponiblesParaGrupo(req, res, next) {
  try {
    const { grupoId } = req.params;

    const grupo = await Grupo.findByPk(grupoId);
    if (!grupo) {
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado'
      });
    }

    const disponibles = await sequelize.query(`
      SELECT 
        u.id,
        u.nombre,
        u.email,
        u."rolId",
        r.nombre as rol
      FROM usuarios u
      LEFT JOIN roles r ON r.id = u."rolId"
      WHERE u.activo = true
        AND NOT EXISTS (
          SELECT 1
          FROM usuario_grupo ug
          JOIN grupos g ON g.id = ug."grupoId"
          WHERE ug."usuarioId" = u.id
            AND g."inventarioId" = :inventarioId
        )
      ORDER BY u.nombre
    `, {
      replacements: { inventarioId: grupo.inventarioId },
      type: QueryTypes.SELECT
    });

    res.json({
      ok: true,
      data: disponibles
    });
  } catch (error) {
    console.error('[USUARIOS DISPONIBLES] Error:', error);
    next(error);
  }
}

// ==================== TEST (eliminar después) ====================

async function testUsuarios(req, res, next) {
  try {
    const usuarios = await sequelize.query(`
      SELECT id, nombre, email, activo
      FROM usuarios
      WHERE activo = true
      ORDER BY id
    `, {
      type: QueryTypes.SELECT
    });

    res.json({
      ok: true,
      data: usuarios
    });
  } catch (error) {
    next(error);
  }
}

async function testGrupo(req, res, next) {
  try {
    const { id } = req.params;
    const grupo = await Grupo.findByPk(id);

    res.json({
      ok: true,
      message: `Grupo ${id} encontrado: ${grupo?.nombre || 'no existe'}`,
      data: grupo
    });
  } catch (error) {
    next(error);
  }
}

// ==================== EXPORTS ====================

module.exports = {
  // CRUD
  createGrupo,
  getGrupos,
  getGrupo,
  updateGrupo,
  deleteGrupo,
  // Estadísticas
  getGrupoEstadisticas,
  // Miembros
  getMiembrosDelGrupo,
  asignarUsuarioAGrupo,
  removerUsuarioDeGrupo,
  getUsuariosDisponiblesParaGrupo,
  getLideresDisponiblesParaGrupo,
  // Tests
  testUsuarios,
  testGrupo
};