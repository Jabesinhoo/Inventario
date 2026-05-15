// backend/src/controllers/supervisor.controller.js
const { QueryTypes, Op } = require('sequelize');
const { sequelize, Lectura, Grupo, Zona, RondaConteo, Usuario } = require('../models');

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
    const resumen = await sequelize.query(`
      SELECT
        COUNT(DISTINCT g.id) as total_grupos,
        COUNT(DISTINCT l."usuarioId") as usuarios_activos,
        COALESCE(SUM(l.cantidad), 0) as total_escaneos,
        COUNT(DISTINCT l.sku) as productos_distintos
      FROM grupos g
      LEFT JOIN lecturas l ON l."grupoId" = g.id AND l."inventarioId" = :inventarioId AND l.estado = 'valida'
      WHERE g."inventarioId" = :inventarioId
    `, {
      replacements: { inventarioId },
      type: QueryTypes.SELECT
    });

    // 2. Estado de cada grupo
    const grupos = await sequelize.query(`
      SELECT
        g.id,
        g.nombre,
        g.color,
        u.nombre as lider,
        z.nombre as zona,
        z.codigo as zona_codigo,
        COALESCE(SUM(l.cantidad), 0) as total_escaneos,
        COUNT(DISTINCT l.sku) as productos_distintos,
        MAX(l."fechaHora") as ultima_actividad,
        CASE 
          WHEN MAX(l."fechaHora") > NOW() - INTERVAL '5 minutes' THEN 'activo'
          WHEN MAX(l."fechaHora") > NOW() - INTERVAL '15 minutes' THEN 'inactivo'
          ELSE 'desconectado'
        END as estado_actividad,
        r.estado as ronda_estado,
        r."numeroRonda"
      FROM grupos g
      LEFT JOIN usuarios u ON u.id = g."liderId"
      LEFT JOIN asignaciones_conteo ac ON ac."grupoId" = g.id AND ac."inventarioId" = :inventarioId
      LEFT JOIN zonas z ON z.id = ac."zonaId"
      LEFT JOIN lecturas l ON l."grupoId" = g.id AND l."inventarioId" = :inventarioId AND l.estado = 'valida'
      LEFT JOIN rondas_conteo r ON r.id = (
        SELECT ar."rondaId" FROM asignaciones_ronda ar WHERE ar."grupoId" = g.id ORDER BY ar.id DESC LIMIT 1
      )
      WHERE g."inventarioId" = :inventarioId
      GROUP BY g.id, g.nombre, g.color, u.nombre, z.nombre, z.codigo, r.estado, r."numeroRonda"
      ORDER BY total_escaneos DESC
    `, {
      replacements: { inventarioId },
      type: QueryTypes.SELECT
    });

    // 3. Alertas
    let alertas = [];
    try {
      alertas = await sequelize.query(`
        SELECT 
          wl.id,
          wl.sku,
          wl.zona_otra_nombre as zona_destino,
          wl.grupo_otro_nombre as grupo_destino,
          wl.cantidad_otra_zona as cantidad,
          wl.zona_actual_nombre as zona_origen,
          wl.grupo_actual_nombre as grupo_origen,
          wl.usuario_nombre as usuario,
          wl.creado_en as fecha
        FROM warning_logs wl
        ORDER BY wl.creado_en DESC
        LIMIT 50
      `, {
        type: QueryTypes.SELECT
      });
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
    const topProductos = await sequelize.query(`
      SELECT 
        l.sku,
        MAX(l."descripcionSnapshot") as descripcion,
        SUM(l.cantidad) as total
      FROM lecturas l
      WHERE l."inventarioId" = :inventarioId AND l.estado = 'valida' AND l.sku IS NOT NULL
      GROUP BY l.sku
      ORDER BY total DESC
      LIMIT 10
    `, {
      replacements: { inventarioId },
      type: QueryTypes.SELECT
    });

    res.json({
      ok: true,
      data: {
        resumen: resumen[0] || {},
        grupos,
        alertas,
        escaneosRecientes,
        topProductos,
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
    const { inventarioId, desde } = req.query;
    const desdeFecha = desde ? new Date(desde) : new Date(Date.now() - 24 * 60 * 60 * 1000);

    let alertas = [];
    try {
      alertas = await sequelize.query(`
        SELECT 
          wl.id,
          wl.sku,
          wl.zona_otra_nombre as zona_destino,
          wl.grupo_otro_nombre as grupo_destino,
          wl.cantidad_otra_zona as cantidad,
          wl.zona_actual_nombre as zona_origen,
          wl.grupo_actual_nombre as grupo_origen,
          wl.usuario_nombre as usuario,
          wl.creado_en as fecha
        FROM warning_logs wl
        WHERE wl.creado_en > :desde
        ORDER BY wl.creado_en DESC
      `, {
        replacements: { desde: desdeFecha },
        type: QueryTypes.SELECT
      });
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

    const grupo = await sequelize.query(`
      SELECT
        g.id,
        g.nombre,
        g.color,
        u.nombre as lider,
        z.nombre as zona,
        z.codigo as zona_codigo,
        COALESCE(SUM(l.cantidad), 0) as total_escaneos,
        COUNT(DISTINCT l.sku) as productos_distintos,
        MIN(l."fechaHora") as primera_actividad,
        MAX(l."fechaHora") as ultima_actividad,
        COUNT(DISTINCT l."usuarioId") as integrantes_activos
      FROM grupos g
      LEFT JOIN usuarios u ON u.id = g."liderId"
      LEFT JOIN asignaciones_conteo ac ON ac."grupoId" = g.id AND ac."inventarioId" = :inventarioId
      LEFT JOIN zonas z ON z.id = ac."zonaId"
      LEFT JOIN lecturas l ON l."grupoId" = g.id AND l."inventarioId" = :inventarioId AND l.estado = 'valida'
      WHERE g.id = :grupoId
      GROUP BY g.id, g.nombre, g.color, u.nombre, z.nombre, z.codigo
    `, {
      replacements: { grupoId, inventarioId },
      type: QueryTypes.SELECT
    });

    const productos = await sequelize.query(`
      SELECT 
        l.sku,
        MAX(l."descripcionSnapshot") as descripcion,
        SUM(l.cantidad) as total
      FROM lecturas l
      WHERE l."grupoId" = :grupoId AND l."inventarioId" = :inventarioId AND l.estado = 'valida'
      GROUP BY l.sku
      ORDER BY total DESC
      LIMIT 20
    `, {
      replacements: { grupoId, inventarioId },
      type: QueryTypes.SELECT
    });

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