const Joi = require('joi');
const { Op, QueryTypes } = require('sequelize');
const {
  sequelize,
  Grupo,
  Inventario,
  Usuario,
  Rol,
  Zona,
  AsignacionConteo,
  Lectura
} = require('../models');

const createGrupoSchema = Joi.object({
  inventarioId: Joi.number().integer().required(),
  nombre: Joi.string().trim().max(120).required(),
  liderId: Joi.number().integer().allow(null, ''),
  color: Joi.string().trim().max(20).default('#3b82f6'),
  zonaId: Joi.number().integer().allow(null, '')
});

function normalizarNullableNumero(value) {
  if (value === '' || value === null || typeof value === 'undefined') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

async function getMiembrosGrupo(grupoId, transaction = null) {
  return sequelize.query(
    `
    SELECT
      u.id,
      u.nombre,
      u.email,
      u."rolId",
      r.nombre as rol,
      ug."esLider",
      ug."fechaAsignacion"
    FROM usuario_grupo ug
    JOIN usuarios u ON u.id = ug."usuarioId"
    LEFT JOIN roles r ON r.id = u."rolId"
    WHERE ug."grupoId" = :grupoId
    ORDER BY ug."esLider" DESC, u.nombre ASC
    `,
    {
      replacements: { grupoId },
      type: QueryTypes.SELECT,
      transaction
    }
  );
}

async function getZonaAsignadaGrupo(grupoId, transaction = null) {
  const asignacion = await AsignacionConteo.findOne({
    where: { grupoId },
    order: [['conteoTipo', 'ASC'], ['id', 'ASC']],
    transaction
  });

  if (!asignacion?.zonaId) return null;

  const zona = await Zona.findByPk(asignacion.zonaId, {
    attributes: ['id', 'nombre', 'codigo'],
    transaction
  });

  if (!zona) return null;

  return {
    id: zona.id,
    nombre: zona.nombre,
    codigo: zona.codigo
  };
}

async function enrichGrupo(grupo, transaction = null) {
  const [miembros, zonaAsignada] = await Promise.all([
    getMiembrosGrupo(grupo.id, transaction),
    getZonaAsignadaGrupo(grupo.id, transaction)
  ]);

  return {
    ...grupo.toJSON(),
    miembros,
    totalMiembros: miembros.length,
    zonaAsignada
  };
}

async function validarInventario(inventarioId) {
  const inventario = await Inventario.findByPk(inventarioId);
  return inventario;
}

async function validarLiderDisponible({ inventarioId, liderId, grupoIdExcluir = null }) {
  if (!liderId) return null;

  const where = {
    inventarioId,
    liderId
  };

  if (grupoIdExcluir) {
    where.id = { [Op.ne]: grupoIdExcluir };
  }

  const grupoExistente = await Grupo.findOne({ where });

  if (grupoExistente) {
    return 'Este usuario ya es líder de otro grupo en este inventario.';
  }

  return null;
}

async function validarZonaDisponible({ inventarioId, zonaId, grupoIdExcluir = null }) {
  if (!zonaId) return null;

  const zona = await Zona.findByPk(zonaId);
  if (!zona) {
    return 'La zona seleccionada no existe.';
  }

  const asignaciones = await AsignacionConteo.findAll({
    where: { zonaId }
  });

  if (!asignaciones.length) return null;

  const grupoIds = asignaciones.map((a) => Number(a.grupoId));

  const grupos = await Grupo.findAll({
    where: {
      id: { [Op.in]: grupoIds },
      inventarioId,
      ...(grupoIdExcluir ? { id: { [Op.in]: grupoIds.filter((id) => id !== Number(grupoIdExcluir)) } } : {})
    }
  });

  if (grupos.length > 0) {
    return 'Esa zona ya está asignada a otro grupo de este inventario.';
  }

  return null;
}

async function upsertRelacionLider(grupoId, liderId, transaction) {
  await sequelize.query(
    `
    UPDATE usuario_grupo
    SET "esLider" = false,
        "updatedAt" = NOW()
    WHERE "grupoId" = :grupoId
    `,
    {
      replacements: { grupoId },
      type: QueryTypes.UPDATE,
      transaction
    }
  );

  if (!liderId) return;

  const existe = await sequelize.query(
    `
    SELECT 1
    FROM usuario_grupo
    WHERE "usuarioId" = :usuarioId
      AND "grupoId" = :grupoId
    `,
    {
      replacements: { usuarioId: liderId, grupoId },
      type: QueryTypes.SELECT,
      transaction
    }
  );

  if (existe.length > 0) {
    await sequelize.query(
      `
      UPDATE usuario_grupo
      SET "esLider" = true,
          "updatedAt" = NOW()
      WHERE "usuarioId" = :usuarioId
        AND "grupoId" = :grupoId
      `,
      {
        replacements: { usuarioId: liderId, grupoId },
        type: QueryTypes.UPDATE,
        transaction
      }
    );
  } else {
    await sequelize.query(
      `
      INSERT INTO usuario_grupo ("usuarioId", "grupoId", "esLider", "fechaAsignacion", "createdAt", "updatedAt")
      VALUES (:usuarioId, :grupoId, true, NOW(), NOW(), NOW())
      `,
      {
        replacements: { usuarioId: liderId, grupoId },
        type: QueryTypes.INSERT,
        transaction
      }
    );
  }
}

async function syncZonaGrupo({ inventarioId, grupoId, zonaId, transaction }) {
  const actual = await AsignacionConteo.findOne({
    where: { grupoId },
    order: [['conteoTipo', 'ASC'], ['id', 'ASC']],
    transaction
  });

  if (!zonaId) {
    if (actual) {
      await AsignacionConteo.destroy({
        where: { grupoId },
        transaction
      });
    }
    return;
  }

  if (actual) {
    await actual.update(
      {
        inventarioId,
        conteoTipo: actual.conteoTipo || 1,
        zonaId
      },
      { transaction }
    );

    await AsignacionConteo.update(
      { inventarioId, zonaId },
      {
        where: {
          grupoId,
          id: { [Op.ne]: actual.id }
        },
        transaction
      }
    );

    return;
  }

  await AsignacionConteo.create(
    {
      inventarioId,
      conteoTipo: 1,
      grupoId,
      zonaId
    },
    { transaction }
  );
}

// ==================== CRUD ====================

async function createGrupo(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const { error, value } = createGrupoSchema.validate(req.body);

    if (error) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const payload = {
      inventarioId: Number(value.inventarioId),
      nombre: value.nombre.trim(),
      liderId: normalizarNullableNumero(value.liderId),
      color: value.color || '#3b82f6',
      zonaId: normalizarNullableNumero(value.zonaId)
    };

    const inventario = await validarInventario(payload.inventarioId);
    if (!inventario) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Inventario no encontrado'
      });
    }

    const errorLider = await validarLiderDisponible({
      inventarioId: payload.inventarioId,
      liderId: payload.liderId
    });

    if (errorLider) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: errorLider
      });
    }

    const errorZona = await validarZonaDisponible({
      inventarioId: payload.inventarioId,
      zonaId: payload.zonaId
    });

    if (errorZona) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: errorZona
      });
    }

    const grupo = await Grupo.create(
      {
        inventarioId: payload.inventarioId,
        nombre: payload.nombre,
        liderId: payload.liderId,
        color: payload.color
      },
      { transaction }
    );

    await upsertRelacionLider(grupo.id, payload.liderId, transaction);
    await syncZonaGrupo({
      inventarioId: payload.inventarioId,
      grupoId: grupo.id,
      zonaId: payload.zonaId,
      transaction
    });

    const grupoCreado = await Grupo.findByPk(grupo.id, {
      include: [
        { model: Usuario, as: 'lider', attributes: ['id', 'nombre', 'email'], required: false },
        { model: Inventario, as: 'inventario', attributes: ['id', 'nombre', 'fecha'] }
      ],
      transaction
    });

    const data = await enrichGrupo(grupoCreado, transaction);

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      data
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

async function getGrupos(req, res, next) {
  try {
    const { inventarioId } = req.query;

    const where = {};
    if (inventarioId) where.inventarioId = Number(inventarioId);

    const grupos = await Grupo.findAll({
      where,
      include: [
        { model: Usuario, as: 'lider', attributes: ['id', 'nombre', 'email'], required: false },
        { model: Inventario, as: 'inventario', attributes: ['id', 'nombre', 'fecha'] }
      ],
      order: [['nombre', 'ASC']]
    });

    const data = await Promise.all(grupos.map((grupo) => enrichGrupo(grupo)));

    return res.json({
      ok: true,
      data
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
        { model: Usuario, as: 'lider', attributes: ['id', 'nombre', 'email'], required: false },
        { model: Inventario, as: 'inventario', attributes: ['id', 'nombre', 'fecha'] }
      ]
    });

    if (!grupo) {
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado'
      });
    }

    const data = await enrichGrupo(grupo);

    return res.json({
      ok: true,
      data
    });
  } catch (error) {
    next(error);
  }
}

async function updateGrupo(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { error, value } = createGrupoSchema.validate(req.body);

    if (error) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const grupo = await Grupo.findByPk(id, { transaction });

    if (!grupo) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado'
      });
    }

    const payload = {
      inventarioId: Number(value.inventarioId),
      nombre: value.nombre.trim(),
      liderId: normalizarNullableNumero(value.liderId),
      color: value.color || '#3b82f6',
      zonaId: normalizarNullableNumero(value.zonaId)
    };

    const inventario = await validarInventario(payload.inventarioId);
    if (!inventario) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Inventario no encontrado'
      });
    }

    const errorLider = await validarLiderDisponible({
      inventarioId: payload.inventarioId,
      liderId: payload.liderId,
      grupoIdExcluir: id
    });

    if (errorLider) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: errorLider
      });
    }

    const errorZona = await validarZonaDisponible({
      inventarioId: payload.inventarioId,
      zonaId: payload.zonaId,
      grupoIdExcluir: id
    });

    if (errorZona) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: errorZona
      });
    }

    await grupo.update(
      {
        inventarioId: payload.inventarioId,
        nombre: payload.nombre,
        liderId: payload.liderId,
        color: payload.color
      },
      { transaction }
    );

    await upsertRelacionLider(grupo.id, payload.liderId, transaction);
    await syncZonaGrupo({
      inventarioId: payload.inventarioId,
      grupoId: grupo.id,
      zonaId: payload.zonaId,
      transaction
    });

    const grupoActualizado = await Grupo.findByPk(grupo.id, {
      include: [
        { model: Usuario, as: 'lider', attributes: ['id', 'nombre', 'email'], required: false },
        { model: Inventario, as: 'inventario', attributes: ['id', 'nombre', 'fecha'] }
      ],
      transaction
    });

    const data = await enrichGrupo(grupoActualizado, transaction);

    await transaction.commit();

    return res.json({
      ok: true,
      data
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

async function deleteGrupo(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    const grupo = await Grupo.findByPk(id, { transaction });

    if (!grupo) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado'
      });
    }

    const totalLecturas = await Lectura.count({
      where: { grupoId: id },
      transaction
    });

    if (totalLecturas > 0) {
      await transaction.rollback();
      return res.status(409).json({
        ok: false,
        message: 'No puedes eliminar este grupo porque ya tiene lecturas registradas.'
      });
    }

    await sequelize.query(
      `
      DELETE FROM usuario_grupo
      WHERE "grupoId" = :grupoId
      `,
      {
        replacements: { grupoId: id },
        type: QueryTypes.DELETE,
        transaction
      }
    );

    await AsignacionConteo.destroy({
      where: { grupoId: id },
      transaction
    });

    await grupo.destroy({ transaction });

    await transaction.commit();

    return res.json({
      ok: true,
      message: 'Grupo eliminado correctamente'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

// ==================== ESTADÍSTICAS ====================

async function getGrupoEstadisticas(req, res, next) {
  try {
    const { id } = req.params;

    const estadisticas = await sequelize.query(
      `
      SELECT
        g.id,
        g.nombre,
        g.color,
        COUNT(DISTINCT l.id) AS total_escaneos,
        COUNT(DISTINCT l.sku) AS productos_distintos,
        COALESCE(SUM(l.cantidad), 0) AS total_unidades,
        MIN(l."fechaHora") AS inicio,
        MAX(l."fechaHora") AS fin,
        COUNT(DISTINCT l."rondaId") AS rondas_participadas,
        COALESCE(SUM(CASE WHEN l.estado = 'valida' THEN l.cantidad ELSE 0 END), 0) AS total_validos,
        COALESCE(SUM(CASE WHEN l.estado = 'no_reconocida' THEN 1 ELSE 0 END), 0) AS no_reconocidos
      FROM grupos g
      LEFT JOIN lecturas l ON l."grupoId" = g.id
      WHERE g.id = :id
      GROUP BY g.id, g.nombre, g.color
      `,
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );

    const stats = estadisticas[0] || {};

    let tiempoActivo = null;
    let rendimientoPorHora = 0;

    if (stats.inicio && stats.fin) {
      const horas = (new Date(stats.fin) - new Date(stats.inicio)) / (1000 * 60 * 60);
      tiempoActivo = `${horas.toFixed(1)}h`;
      rendimientoPorHora = horas > 0 ? Math.round(Number(stats.total_unidades || 0) / horas) : 0;
    }

    const miembros = await getMiembrosGrupo(id);
    const grupo = await Grupo.findByPk(id);

    return res.json({
      ok: true,
      data: {
        id: stats.id || Number(id),
        nombre: stats.nombre || grupo?.nombre || '',
        color: stats.color || grupo?.color || '#3b82f6',
        miembros,
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
    next(error);
  }
}

// ==================== MIEMBROS ====================

async function getMiembrosDelGrupo(req, res, next) {
  try {
    const { grupoId } = req.params;
    const miembros = await getMiembrosGrupo(grupoId);

    return res.json({
      ok: true,
      data: miembros
    });
  } catch (error) {
    next(error);
  }
}

async function asignarUsuarioAGrupo(req, res, next) {
  try {
    const usuarioId = Number(req.body.usuarioId);
    const grupoId = Number(req.body.grupoId);
    const esLider = Boolean(req.body.esLider);

    if (!usuarioId || !grupoId) {
      return res.status(400).json({
        ok: false,
        message: 'usuarioId y grupoId son requeridos'
      });
    }

    const grupo = await Grupo.findByPk(grupoId);
    if (!grupo) {
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado'
      });
    }

    const usuario = await Usuario.findByPk(usuarioId, {
      include: [{ model: Rol, as: 'rol', attributes: ['id', 'nombre'] }]
    });

    if (!usuario || !usuario.activo) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado o inactivo'
      });
    }

    const existe = await sequelize.query(
      `
      SELECT 1
      FROM usuario_grupo
      WHERE "usuarioId" = :usuarioId
        AND "grupoId" = :grupoId
      `,
      {
        replacements: { usuarioId, grupoId },
        type: QueryTypes.SELECT
      }
    );

    if (existe.length > 0) {
      return res.status(400).json({
        ok: false,
        message: 'El usuario ya pertenece a este grupo'
      });
    }

    const mismoInventario = await sequelize.query(
      `
      SELECT 1
      FROM usuario_grupo ug
      JOIN grupos g ON g.id = ug."grupoId"
      WHERE ug."usuarioId" = :usuarioId
        AND g."inventarioId" = (
          SELECT "inventarioId" FROM grupos WHERE id = :grupoId
        )
      `,
      {
        replacements: { usuarioId, grupoId },
        type: QueryTypes.SELECT
      }
    );

    if (mismoInventario.length > 0) {
      return res.status(400).json({
        ok: false,
        message: 'El usuario ya pertenece a otro grupo en este inventario'
      });
    }

    await sequelize.query(
      `
      INSERT INTO usuario_grupo ("usuarioId", "grupoId", "esLider", "fechaAsignacion", "createdAt", "updatedAt")
      VALUES (:usuarioId, :grupoId, :esLider, NOW(), NOW(), NOW())
      `,
      {
        replacements: { usuarioId, grupoId, esLider },
        type: QueryTypes.INSERT
      }
    );

    if (esLider) {
      const errorLider = await validarLiderDisponible({
        inventarioId: grupo.inventarioId,
        liderId: usuarioId,
        grupoIdExcluir: grupoId
      });

      if (errorLider) {
        await sequelize.query(
          `
          DELETE FROM usuario_grupo
          WHERE "usuarioId" = :usuarioId
            AND "grupoId" = :grupoId
          `,
          {
            replacements: { usuarioId, grupoId },
            type: QueryTypes.DELETE
          }
        );

        return res.status(400).json({
          ok: false,
          message: errorLider
        });
      }

      await Grupo.update({ liderId: usuarioId }, { where: { id: grupoId } });
      await sequelize.query(
        `
        UPDATE usuario_grupo
        SET "esLider" = CASE WHEN "usuarioId" = :usuarioId THEN true ELSE false END,
            "updatedAt" = NOW()
        WHERE "grupoId" = :grupoId
        `,
        {
          replacements: { usuarioId, grupoId },
          type: QueryTypes.UPDATE
        }
      );
    }

    return res.json({
      ok: true,
      message: 'Usuario asignado al grupo correctamente'
    });
  } catch (error) {
    next(error);
  }
}

async function removerUsuarioDeGrupo(req, res, next) {
  try {
    const usuarioId = Number(req.body.usuarioId);
    const grupoId = Number(req.body.grupoId);

    if (!usuarioId || !grupoId) {
      return res.status(400).json({
        ok: false,
        message: 'usuarioId y grupoId son requeridos'
      });
    }

    const grupo = await Grupo.findByPk(grupoId);
    if (!grupo) {
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado'
      });
    }

    const relacion = await sequelize.query(
      `
      SELECT "esLider"
      FROM usuario_grupo
      WHERE "usuarioId" = :usuarioId
        AND "grupoId" = :grupoId
      `,
      {
        replacements: { usuarioId, grupoId },
        type: QueryTypes.SELECT
      }
    );

    if (!relacion.length) {
      return res.status(404).json({
        ok: false,
        message: 'El usuario no pertenece a este grupo'
      });
    }

    await sequelize.query(
      `
      DELETE FROM usuario_grupo
      WHERE "usuarioId" = :usuarioId
        AND "grupoId" = :grupoId
      `,
      {
        replacements: { usuarioId, grupoId },
        type: QueryTypes.DELETE
      }
    );

    if (relacion[0].esLider) {
      await Grupo.update({ liderId: null }, { where: { id: grupoId } });
    }

    return res.json({
      ok: true,
      message: 'Usuario removido del grupo correctamente'
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
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado'
      });
    }

    const disponibles = await sequelize.query(
      `
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
      `,
      {
        replacements: { inventarioId: grupo.inventarioId },
        type: QueryTypes.SELECT
      }
    );

    return res.json({
      ok: true,
      data: disponibles
    });
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

    const disponibles = await sequelize.query(
      `
      SELECT
        u.id,
        u.nombre,
        u.email,
        u."rolId",
        r.nombre as rol
      FROM usuarios u
      LEFT JOIN roles r ON r.id = u."rolId"
      WHERE u.activo = true
        AND u.id NOT IN (
          SELECT DISTINCT "liderId"
          FROM grupos
          WHERE "inventarioId" = :inventarioId
            AND "liderId" IS NOT NULL
            AND id != :grupoId
        )
      ORDER BY u.nombre
      `,
      {
        replacements: {
          inventarioId: grupo.inventarioId,
          grupoId: Number(grupoId)
        },
        type: QueryTypes.SELECT
      }
    );

    return res.json({
      ok: true,
      data: disponibles
    });
  } catch (error) {
    next(error);
  }
}

// ==================== TEST ====================

async function testUsuarios(req, res, next) {
  try {
    const usuarios = await sequelize.query(
      `
      SELECT id, nombre, email, activo
      FROM usuarios
      WHERE activo = true
      ORDER BY id
      `,
      { type: QueryTypes.SELECT }
    );

    return res.json({
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

    return res.json({
      ok: true,
      message: `Grupo ${id} encontrado: ${grupo?.nombre || 'no existe'}`,
      data: grupo
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
  getMiembrosDelGrupo,
  asignarUsuarioAGrupo,
  removerUsuarioDeGrupo,
  getUsuariosDisponiblesParaGrupo,
  getLideresDisponiblesParaGrupo,
  testUsuarios,
  testGrupo
};