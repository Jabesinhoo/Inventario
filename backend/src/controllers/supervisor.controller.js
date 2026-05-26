// backend/src/controllers/supervisor.controller.js
const { QueryTypes } = require('sequelize');
const {
  sequelize,
  Lectura,
  Grupo,
  Zona,
  Usuario
} = require('../models');

async function getDashboardSupervisor(req, res, next) {
  try {
    const { inventarioId } = req.query;

    console.log('🔍 Dashboard Supervisor - inventarioId:', inventarioId);

    if (!inventarioId) {
      return res.status(400).json({
        ok: false,
        message: 'inventarioId es requerido'
      });
    }

    // 1. Resumen general
    const resumen = await sequelize.query(
      `
      SELECT
        COUNT(DISTINCT g.id)::int AS total_grupos,
        COUNT(DISTINCT l."usuarioId")::int AS usuarios_activos,
        COALESCE(SUM(l.cantidad), 0)::int AS total_escaneos,
        COUNT(DISTINCT l.sku)::int AS productos_distintos
      FROM grupos g
      LEFT JOIN lecturas l
        ON l."grupoId" = g.id
        AND l."inventarioId" = :inventarioId
        AND l.estado = 'valida'
      WHERE g."inventarioId" = :inventarioId
      `,
      {
        replacements: { inventarioId },
        type: QueryTypes.SELECT
      }
    );

    // 2. Estado de cada grupo
    // IMPORTANTE:
    // Se agregan aliases snake_case porque el JSX usa:
    // grupo.numero_ronda, grupo.ronda_estado, grupo.tipo_ronda, grupo.ronda_id.
    const grupos = await sequelize.query(
      `
      SELECT
        g.id,
        g.nombre,
        g.color,
        u.nombre AS lider,
        z.nombre AS zona,
        z.codigo AS zona_codigo,
        COALESCE(SUM(l.cantidad), 0)::int AS total_escaneos,
        COUNT(DISTINCT l.sku)::int AS productos_distintos,
        MAX(l."fechaHora") AS ultima_actividad,
        CASE
          WHEN MAX(l."fechaHora") > NOW() - INTERVAL '5 minutes' THEN 'activo'
          WHEN MAX(l."fechaHora") > NOW() - INTERVAL '15 minutes' THEN 'inactivo'
          WHEN MAX(l."fechaHora") IS NULL THEN 'desconectado'
          ELSE 'desconectado'
        END AS estado_actividad,
        r.id AS ronda_id,
        r.estado AS ronda_estado,
        r."numeroRonda" AS numero_ronda,
        r."tipoRonda" AS tipo_ronda,
        r."tiempoInicio" AS tiempo_inicio,
        r."tiempoFin" AS tiempo_fin
      FROM grupos g
      LEFT JOIN usuarios u
        ON u.id = g."liderId"
      LEFT JOIN asignaciones_conteo ac
        ON ac."grupoId" = g.id
        AND ac."inventarioId" = :inventarioId
      LEFT JOIN zonas z
        ON z.id = ac."zonaId"
      LEFT JOIN lecturas l
        ON l."grupoId" = g.id
        AND l."inventarioId" = :inventarioId
        AND l.estado = 'valida'
      LEFT JOIN rondas_conteo r
        ON r.id = (
          SELECT ar."rondaId"
          FROM asignaciones_ronda ar
          INNER JOIN rondas_conteo r2
            ON r2.id = ar."rondaId"
          WHERE ar."grupoId" = g.id
            AND r2."inventarioId" = :inventarioId
          ORDER BY r2."numeroRonda" DESC, r2.id DESC
          LIMIT 1
        )
      WHERE g."inventarioId" = :inventarioId
      GROUP BY
        g.id,
        g.nombre,
        g.color,
        u.nombre,
        z.nombre,
        z.codigo,
        r.id,
        r.estado,
        r."numeroRonda",
        r."tipoRonda",
        r."tiempoInicio",
        r."tiempoFin"
      ORDER BY total_escaneos DESC
      `,
      {
        replacements: { inventarioId },
        type: QueryTypes.SELECT
      }
    );

    // 3. Alertas
    let alertas = [];
    try {
      alertas = await sequelize.query(
        `
        SELECT
          wl.id,
          wl.sku,
          wl.zona_otra_nombre AS zona_destino,
          wl.grupo_otro_nombre AS grupo_destino,
          wl.cantidad_otra_zona AS cantidad,
          wl.zona_actual_nombre AS zona_origen,
          wl.grupo_actual_nombre AS grupo_origen,
          wl.usuario_nombre AS usuario,
          wl.creado_en AS fecha
        FROM warning_logs wl
        ORDER BY wl.creado_en DESC
        LIMIT 50
        `,
        {
          type: QueryTypes.SELECT
        }
      );
    } catch (err) {
      console.log('⚠️ Tabla warning_logs no existe aún:', err.message);
    }

    // 4. Escaneos recientes
    const escaneosRecientes = await Lectura.findAll({
      where: {
        inventarioId,
        estado: 'valida'
      },
      include: [
        { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] },
        { model: Grupo, as: 'grupo', attributes: ['id', 'nombre'] },
        { model: Zona, as: 'zona', attributes: ['id', 'nombre'] }
      ],
      order: [['fechaHora', 'DESC']],
      limit: 20
    });

    // 5. Top productos
    const topProductos = await sequelize.query(
      `
      SELECT
        l.sku,
        MAX(l."descripcionSnapshot") AS descripcion,
        COALESCE(SUM(l.cantidad), 0)::int AS total
      FROM lecturas l
      WHERE l."inventarioId" = :inventarioId
        AND l.estado = 'valida'
        AND l.sku IS NOT NULL
      GROUP BY l.sku
      ORDER BY total DESC
      LIMIT 10
      `,
      {
        replacements: { inventarioId },
        type: QueryTypes.SELECT
      }
    );

    // 6. Rondas del inventario para la tabla del SupervisorDashboard.jsx
    // Se devuelven anidadas para que el JSX pueda usar:
    // ronda.zona?.nombre y ronda.asignacion?.grupo?.nombre.
    const rondasRaw = await sequelize.query(
      `
      SELECT
        r.id,
        r."inventarioId",
        r."zonaId",
        r."numeroRonda",
        r."tipoRonda",
        r.estado,
        r."tiempoInicio",
        r."tiempoFin",
        r."createdAt",
        r."updatedAt",
        z.id AS zona_id,
        z.nombre AS zona_nombre,
        z.codigo AS zona_codigo,
        ar.id AS asignacion_id,
        g.id AS grupo_id,
        g.nombre AS grupo_nombre,
        COALESCE(SUM(l.cantidad), 0)::int AS total_escaneos,
        COUNT(DISTINCT l.sku)::int AS productos_distintos
      FROM rondas_conteo r
      LEFT JOIN zonas z
        ON z.id = r."zonaId"
      LEFT JOIN asignaciones_ronda ar
        ON ar."rondaId" = r.id
      LEFT JOIN grupos g
        ON g.id = ar."grupoId"
      LEFT JOIN lecturas l
        ON l."rondaId" = r.id
        AND l.estado = 'valida'
      WHERE r."inventarioId" = :inventarioId
      GROUP BY
        r.id,
        r."inventarioId",
        r."zonaId",
        r."numeroRonda",
        r."tipoRonda",
        r.estado,
        r."tiempoInicio",
        r."tiempoFin",
        r."createdAt",
        r."updatedAt",
        z.id,
        z.nombre,
        z.codigo,
        ar.id,
        g.id,
        g.nombre
      ORDER BY r."numeroRonda" ASC, r.id ASC
      `,
      {
        replacements: { inventarioId },
        type: QueryTypes.SELECT
      }
    );

    const rondas = rondasRaw.map((r) => ({
      id: r.id,
      inventarioId: r.inventarioId,
      zonaId: r.zonaId,
      numeroRonda: r.numeroRonda,
      tipoRonda: r.tipoRonda,
      estado: r.estado,
      tiempoInicio: r.tiempoInicio,
      tiempoFin: r.tiempoFin,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      totalEscaneos: Number(r.total_escaneos || 0),
      productosDistintos: Number(r.productos_distintos || 0),
      zona: r.zona_id
        ? {
            id: r.zona_id,
            nombre: r.zona_nombre,
            codigo: r.zona_codigo
          }
        : null,
      asignacion: r.asignacion_id
        ? {
            id: r.asignacion_id,
            grupo: r.grupo_id
              ? {
                  id: r.grupo_id,
                  nombre: r.grupo_nombre
                }
              : null
          }
        : null
    }));

    res.json({
      ok: true,
      data: {
        resumen: resumen[0] || {},
        grupos,
        alertas,
        escaneosRecientes,
        topProductos,
        rondas,
        ultimaActualizacion: new Date()
      }
    });
  } catch (error) {
    console.error('Error en dashboard supervisor:', error);
    next(error);
  }
}

async function getAlertasRealtime(req, res, next) {
  try {
    const { desde } = req.query;
    const desdeFecha = desde
      ? new Date(desde)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    let alertas = [];
    try {
      alertas = await sequelize.query(
        `
        SELECT
          wl.id,
          wl.sku,
          wl.zona_otra_nombre AS zona_destino,
          wl.grupo_otro_nombre AS grupo_destino,
          wl.cantidad_otra_zona AS cantidad,
          wl.zona_actual_nombre AS zona_origen,
          wl.grupo_actual_nombre AS grupo_origen,
          wl.usuario_nombre AS usuario,
          wl.creado_en AS fecha
        FROM warning_logs wl
        WHERE wl.creado_en > :desde
        ORDER BY wl.creado_en DESC
        `,
        {
          replacements: { desde: desdeFecha },
          type: QueryTypes.SELECT
        }
      );
    } catch (err) {
      console.log('⚠️ Tabla warning_logs no existe:', err.message);
    }

    res.json({ ok: true, data: alertas });
  } catch (error) {
    next(error);
  }
}

async function getGrupoDetalle(req, res, next) {
  try {
    const { grupoId, inventarioId } = req.query;

    if (!grupoId || !inventarioId) {
      return res.status(400).json({
        ok: false,
        message: 'grupoId e inventarioId son requeridos'
      });
    }

    const grupo = await sequelize.query(
      `
      SELECT
        g.id,
        g.nombre,
        g.color,
        u.nombre AS lider,
        z.nombre AS zona,
        z.codigo AS zona_codigo,
        COALESCE(SUM(l.cantidad), 0)::int AS total_escaneos,
        COUNT(DISTINCT l.sku)::int AS productos_distintos,
        MIN(l."fechaHora") AS primera_actividad,
        MAX(l."fechaHora") AS ultima_actividad,
        COUNT(DISTINCT l."usuarioId")::int AS integrantes_activos
      FROM grupos g
      LEFT JOIN usuarios u
        ON u.id = g."liderId"
      LEFT JOIN asignaciones_conteo ac
        ON ac."grupoId" = g.id
        AND ac."inventarioId" = :inventarioId
      LEFT JOIN zonas z
        ON z.id = ac."zonaId"
      LEFT JOIN lecturas l
        ON l."grupoId" = g.id
        AND l."inventarioId" = :inventarioId
        AND l.estado = 'valida'
      WHERE g.id = :grupoId
      GROUP BY g.id, g.nombre, g.color, u.nombre, z.nombre, z.codigo
      `,
      {
        replacements: { grupoId, inventarioId },
        type: QueryTypes.SELECT
      }
    );

    const productos = await sequelize.query(
      `
      SELECT
        l.sku,
        MAX(l."descripcionSnapshot") AS descripcion,
        COALESCE(SUM(l.cantidad), 0)::int AS total
      FROM lecturas l
      WHERE l."grupoId" = :grupoId
        AND l."inventarioId" = :inventarioId
        AND l.estado = 'valida'
      GROUP BY l.sku
      ORDER BY total DESC
      LIMIT 20
      `,
      {
        replacements: { grupoId, inventarioId },
        type: QueryTypes.SELECT
      }
    );

    res.json({
      ok: true,
      data: {
        grupo: grupo[0] || null,
        productos
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDashboardSupervisor,
  getAlertasRealtime,
  getGrupoDetalle
};