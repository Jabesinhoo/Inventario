const { QueryTypes } = require('sequelize');
const { sequelize, Inventario, Zona, Grupo, Lectura, RondaConteo, DiscrepanciaConteo } = require('../models');

// ==================== HELPERS ====================

function formatSegundos(segundos) {
  if (!segundos) return null;
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  const segs = segundos % 60;
  
  if (horas > 0) return `${horas}h ${minutos}m ${segs}s`;
  if (minutos > 0) return `${minutos}m ${segs}s`;
  return `${segs}s`;
}

// ==================== DASHBOARD PRINCIPAL ====================

async function getDashboard(req, res, next) {
  try {
    const { inventarioId, fecha, grupoId } = req.query;
    
    // 🔒 AISLAMIENTO: si no es admin, solo ve su grupo
    let grupoFiltro = grupoId;
    if (!req.canViewAllGroups && req.grupoId) {
      grupoFiltro = req.grupoId;
    }

    const fechaFilter = fecha ? `AND DATE(l."fechaHora") = :fecha` : '';
    const grupoFilter = grupoFiltro ? `AND l."grupoId" = :grupoId` : '';
    const grupoWhere = grupoFiltro ? { grupoId: grupoFiltro } : {};
    
    const replacements = { 
      inventarioId: inventarioId || null,
      fecha: fecha || null,
      grupoId: grupoFiltro || null
    };

    // ==================== 1. RESUMEN GENERAL ====================
    
    const resumenGeneral = await sequelize.query(
      `
      SELECT
        (SELECT COUNT(*)::int FROM zonas z WHERE z.activa = true) AS "totalZonas",
        (SELECT COUNT(*)::int FROM grupos g 
          ${inventarioId ? 'WHERE g."inventarioId" = :inventarioId' : ''}
        ) AS "totalGrupos",
        (SELECT COUNT(*)::int FROM asignaciones_ronda ar 
          JOIN rondas_conteo rc ON rc.id = ar."rondaId"
          ${inventarioId ? 'WHERE rc."inventarioId" = :inventarioId' : ''}
        ) AS "totalAsignaciones",
        (
          SELECT COALESCE(SUM(l.cantidad), 0)::int
          FROM lecturas l
          WHERE l.estado = 'valida'
          ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
          ${fechaFilter}
          ${grupoFilter}
        ) AS "totalEscaneos",
        (
          SELECT COUNT(DISTINCT l.sku)::int
          FROM lecturas l
          WHERE l.estado = 'valida' AND l.sku IS NOT NULL
          ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
          ${fechaFilter}
          ${grupoFilter}
        ) AS "productosDistintos"
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    // ==================== 2. CONTEOS ====================
    
    const conteos = await sequelize.query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 1 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo1",
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 2 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo2",
        COALESCE(SUM(CASE WHEN l."conteoTipo" > 2 THEN l.cantidad ELSE 0 END), 0)::int AS "reconteos"
      FROM lecturas l
      WHERE l.estado = 'valida'
      ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
      ${fechaFilter}
      ${grupoFilter}
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    const conteoBase = conteos[0] || { conteo1: 0, conteo2: 0, reconteos: 0 };
    const diferenciaGlobal = Math.abs(Number(conteoBase.conteo1) - Number(conteoBase.conteo2));
    const precision = Number(conteoBase.conteo1) > 0
      ? Number((1 - diferenciaGlobal / Number(conteoBase.conteo1)) * 100).toFixed(2)
      : 0;

    // ==================== 3. POR ZONA ====================
    
    const porZona = await sequelize.query(
      `
      SELECT
        z.id,
        z.nombre,
        z.codigo,
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 1 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo1",
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 2 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo2",
        COALESCE(SUM(l.cantidad), 0)::int AS "totalUnidades",
        COUNT(DISTINCT l.sku)::int AS "productosDistintos",
        COUNT(DISTINCT l."usuarioId")::int AS "personasQueContaron",
        COUNT(DISTINCT l."grupoId")::int AS "gruposQueContaron"
      FROM zonas z
      LEFT JOIN lecturas l
        ON l."zonaId" = z.id
        AND l.estado = 'valida'
        ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
        ${fechaFilter}
        ${grupoFilter}
      GROUP BY z.id, z.nombre, z.codigo
      ORDER BY "totalUnidades" DESC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    // Calcular diferencia y estado por zona
    const zonasProcesadas = porZona.map((z) => {
      const diferencia = Math.abs(Number(z.conteo1) - Number(z.conteo2));
      let estado = 'coincide';
      if (diferencia > 0 && diferencia <= 5) estado = 'diferencia menor';
      if (diferencia > 5) estado = 'requiere reconteo';
      
      return {
        ...z,
        diferencia,
        estado
      };
    });

    // ==================== 4. POR GRUPO ====================
    
    const gruposQuery = await sequelize.query(
      `
      WITH grupo_stats AS (
        SELECT
          g.id,
          g.nombre,
          COALESCE(SUM(l.cantidad), 0)::int AS "totalUnidades",
          COUNT(DISTINCT l.sku)::int AS "productosDistintos",
          COUNT(DISTINCT l."usuarioId")::int AS "personasEnGrupo",
          COALESCE(SUM(CASE WHEN l."conteoTipo" = 1 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo1",
          COALESCE(SUM(CASE WHEN l."conteoTipo" = 2 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo2",
          MIN(l."fechaHora") AS "primeraLectura",
          MAX(l."fechaHora") AS "ultimaLectura",
          COUNT(DISTINCT l."rondaId")::int AS "rondasRealizadas"
        FROM grupos g
        LEFT JOIN lecturas l
          ON l."grupoId" = g.id
          AND l.estado = 'valida'
          ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
          ${fechaFilter}
        ${inventarioId ? 'WHERE g."inventarioId" = :inventarioId' : ''}
        GROUP BY g.id, g.nombre
      ),
      discrepancias_grupo AS (
        SELECT
          dc."grupoId",
          SUM(dc.diferencia)::int AS "diferenciaTotal"
        FROM discrepancias_conteo dc
        WHERE 1=1
        ${inventarioId ? 'AND dc."inventarioId" = :inventarioId' : ''}
        GROUP BY dc."grupoId"
      )
      SELECT
        gs.*,
        COALESCE(dg."diferenciaTotal", 0) AS "diferenciaTotal",
        CASE
          WHEN gs."primeraLectura" IS NULL THEN NULL
          ELSE EXTRACT(EPOCH FROM (gs."ultimaLectura" - gs."primeraLectura"))
        END AS "tiempoSegundos"
      FROM grupo_stats gs
      LEFT JOIN discrepancias_grupo dg ON dg."grupoId" = gs.id
      ORDER BY gs."totalUnidades" DESC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    // Calcular métricas adicionales por grupo
    const gruposProcesados = gruposQuery.map((g) => ({
      ...g,
      tiempoFormateado: formatSegundos(g.tiempoSegundos),
      rendimientoPorHora: g.tiempoSegundos > 0 
        ? ((g.totalUnidades / g.tiempoSegundos) * 3600).toFixed(2)
        : null
    }));

    // Rankings
    const grupoMasProductivo = [...gruposProcesados].sort((a, b) => b.totalUnidades - a.totalUnidades)[0] || null;
    const grupoMenorDiferencia = [...gruposProcesados].sort((a, b) => a.diferenciaTotal - b.diferenciaTotal)[0] || null;
    const grupoMasRapido = [...gruposProcesados]
      .filter(g => g.tiempoSegundos > 0 && g.totalUnidades > 0)
      .sort((a, b) => (a.tiempoSegundos / a.totalUnidades) - (b.tiempoSegundos / b.totalUnidades))[0] || null;
    const grupoTerminoPrimero = [...gruposProcesados]
      .filter(g => g.ultimaLectura)
      .sort((a, b) => new Date(a.ultimaLectura) - new Date(b.ultimaLectura))[0] || null;

    // ==================== 5. USUARIOS ====================
    
    const usuariosStats = await sequelize.query(
      `
      SELECT
        u.id,
        u.nombre,
        COUNT(l.id)::int AS "totalEscaneos",
        COUNT(DISTINCT l.sku)::int AS "productosDistintos",
        MIN(l."fechaHora") AS "primerEscaneo",
        MAX(l."fechaHora") AS "ultimoEscaneo"
      FROM usuarios u
      JOIN lecturas l ON l."usuarioId" = u.id
      WHERE l.estado = 'valida'
        ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
        ${fechaFilter}
        ${grupoFilter}
      GROUP BY u.id, u.nombre
      ORDER BY "totalEscaneos" DESC
      LIMIT 10
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    const usuarioMasEscaneos = usuariosStats[0] || null;

    // ==================== 6. PRODUCTOS ====================
    
    const productosStats = await sequelize.query(
      `
      SELECT
        l.sku,
        l."descripcionSnapshot" AS descripcion,
        COALESCE(SUM(l.cantidad), 0)::int AS "totalEscaneos",
        COUNT(DISTINCT l."zonaId")::int AS "zonasDondeAparece",
        COUNT(DISTINCT l."grupoId")::int AS "gruposQueEscaniaron",
        MAX(l."fechaHora") AS "ultimoEscaneo"
      FROM lecturas l
      WHERE l.estado = 'valida'
        AND l.sku IS NOT NULL
        ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
        ${fechaFilter}
        ${grupoFilter}
      GROUP BY l.sku, l."descripcionSnapshot"
      ORDER BY "totalEscaneos" DESC
      LIMIT 20
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    const productoMasEscaneado = productosStats[0] || null;

    // Productos con existencia 0 según SQL Server (simulado, se puede integrar después)
    const productosConExistenciaCero = [];

    // ==================== 7. TIEMPOS ====================
    
    const tiempos = await sequelize.query(
      `
      SELECT
        MIN(l."fechaHora") AS "inicioGeneral",
        MAX(l."fechaHora") AS "finGeneral",
        EXTRACT(EPOCH FROM (MAX(l."fechaHora") - MIN(l."fechaHora"))) AS "tiempoTotalSegundos"
      FROM lecturas l
      WHERE l.estado = 'valida'
        ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
        ${fechaFilter}
        ${grupoFilter}
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    const tiempoEntreEscaneos = await sequelize.query(
      `
      SELECT
        AVG(EXTRACT(EPOCH FROM (l2."fechaHora" - l1."fechaHora")))::int AS "promedioSegundos"
      FROM lecturas l1
      JOIN lecturas l2 ON l2.id = (
        SELECT id FROM lecturas l3 
        WHERE l3."rondaId" = l1."rondaId" 
          AND l3."fechaHora" > l1."fechaHora"
          AND l3.estado = 'valida'
        ORDER BY l3."fechaHora" ASC 
        LIMIT 1
      )
      WHERE l1.estado = 'valida' AND l2.estado = 'valida'
        ${inventarioId ? 'AND l1."inventarioId" = :inventarioId' : ''}
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    // ==================== 8. RECONTEOS ====================
    
    const reconteosStats = await sequelize.query(
      `
      SELECT
        COUNT(DISTINCT dc.id)::int AS "totalDiscrepancias",
        COUNT(DISTINCT dc."zonaId")::int AS "zonasConReconteo",
        COUNT(DISTINCT dc."grupoId")::int AS "gruposConReconteo",
        AVG(dc.diferencia)::int AS "diferenciaPromedio"
      FROM discrepancias_conteo dc
      WHERE 1=1
        ${inventarioId ? 'AND dc."inventarioId" = :inventarioId' : ''}
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    // ==================== 9. GRÁFICOS ====================
    
    const evolucionPorDia = await sequelize.query(
      `
      SELECT
        DATE(l."fechaHora") AS fecha,
        COALESCE(SUM(l.cantidad), 0)::int AS total,
        COUNT(DISTINCT l."grupoId")::int AS gruposActivos
      FROM lecturas l
      WHERE l.estado = 'valida'
        ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
        ${grupoFilter}
      GROUP BY DATE(l."fechaHora")
      ORDER BY fecha ASC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    const evolucionPorHora = await sequelize.query(
      `
      SELECT
        EXTRACT(HOUR FROM l."fechaHora")::int AS hora,
        COALESCE(SUM(l.cantidad), 0)::int AS total
      FROM lecturas l
      WHERE l.estado = 'valida'
        ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
        ${fechaFilter}
        ${grupoFilter}
      GROUP BY EXTRACT(HOUR FROM l."fechaHora")
      ORDER BY hora ASC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    const distribucionPorZona = zonasProcesadas.map(z => ({
      zona: z.nombre,
      total: z.totalUnidades
    }));

    const comparacionPorZona = zonasProcesadas.map(z => ({
      zona: z.nombre,
      conteo1: z.conteo1,
      conteo2: z.conteo2
    }));

    // ==================== 10. ALERTAS ====================
    
    const zonasRequierenReconteo = zonasProcesadas.filter(z => z.estado === 'requiere reconteo');
    const gruposSinActividad = gruposProcesados.filter(g => g.totalUnidades === 0);
    
    const fechasSinConteo2 = await sequelize.query(
      `
      SELECT DISTINCT i."fecha"
      FROM inventarios i
      WHERE NOT EXISTS (
        SELECT 1 FROM lecturas l 
        WHERE l."inventarioId" = i.id 
          AND l."conteoTipo" = 2 
          AND l.estado = 'valida'
      )
      ${inventarioId ? 'AND i.id = :inventarioId' : ''}
      ORDER BY i."fecha" DESC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    // ==================== RESPUESTA FINAL ====================

    res.json({
      ok: true,
      data: {
        // Filtros aplicados
        filtros: {
          inventarioId: inventarioId || null,
          fecha: fecha || null,
          grupoId: grupoFiltro || null,
          esAdmin: req.canViewAllGroups || false
        },
        
        // 1. Resumen General
        resumenGeneral: resumenGeneral[0],
        
        // 2. Conteos
        conteos: {
          conteo1: Number(conteoBase.conteo1),
          conteo2: Number(conteoBase.conteo2),
          reconteos: Number(conteoBase.reconteos),
          diferenciaGlobal,
          precisionPorcentaje: Number(precision)
        },
        
        // 3. Por Zona
        porZona: zonasProcesadas,
        
        // 4. Por Grupo
        porGrupo: {
          ranking: gruposProcesados,
          grupoMasProductivo,
          grupoMenorDiferencia,
          grupoMasRapido,
          grupoTerminoPrimero
        },
        
        // 5. Usuarios
        usuarios: {
          topUsuarios: usuariosStats,
          usuarioMasEscaneos
        },
        
        // 6. Productos
        productos: {
          topProductos: productosStats,
          productoMasEscaneado,
          productosConExistenciaCero
        },
        
        // 7. Tiempos
        tiempos: {
          inicioGeneral: tiempos[0]?.inicioGeneral,
          finGeneral: tiempos[0]?.finGeneral,
          tiempoTotalFormateado: formatSegundos(tiempos[0]?.tiempoTotalSegundos),
          tiempoPromedioEntreEscaneos: tiempoEntreEscaneos[0]?.promedioSegundos 
            ? `${tiempoEntreEscaneos[0].promedioSegundos} segundos`
            : null
        },
        
        // 8. Reconteos
        reconteos: reconteosStats[0],
        
        // 9. Gráficos
        graficos: {
          evolucionPorDia,
          evolucionPorHora,
          distribucionPorZona,
          comparacionPorZona
        },
        
        // 10. Alertas
        alertas: {
          zonasRequierenReconteo,
          gruposSinActividad: gruposSinActividad.map(g => ({ id: g.id, nombre: g.nombre })),
          fechasSinConteo2: fechasSinConteo2.map(f => f.fecha)
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

// ==================== EXPORTACIÓN SIMPLIFICADA (para vistas rápidas) ====================

async function getDashboardResumen(req, res, next) {
  try {
    const { inventarioId } = req.query;
    
    let grupoFiltro = null;
    if (!req.canViewAllGroups && req.grupoId) {
      grupoFiltro = req.grupoId;
    }

    const replacements = { inventarioId: inventarioId || null, grupoId: grupoFiltro || null };
    const grupoFilter = grupoFiltro ? `AND l."grupoId" = :grupoId` : '';

    const [totalEscaneos, totalGrupos, totalZonas, promedioPorHora] = await Promise.all([
      sequelize.query(
        `SELECT COALESCE(SUM(l.cantidad), 0)::int AS total FROM lecturas l 
         WHERE l.estado = 'valida' ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''} ${grupoFilter}`,
        { replacements, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COUNT(*)::int AS total FROM grupos ${inventarioId ? 'WHERE "inventarioId" = :inventarioId' : ''}`,
        { replacements, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COUNT(*)::int AS total FROM zonas WHERE activa = true`,
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT 
           COALESCE(SUM(l.cantidad), 0)::int AS total,
           EXTRACT(EPOCH FROM (NOW() - MIN(l."fechaHora"))) / 3600 AS horas
         FROM lecturas l
         WHERE l.estado = 'valida' ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''} ${grupoFilter}`,
        { replacements, type: QueryTypes.SELECT }
      )
    ]);

    const horas = promedioPorHora[0]?.horas || 1;
    const rendimientoPorHora = Math.round((totalEscaneos[0]?.total || 0) / horas);

    res.json({
      ok: true,
      data: {
        totalEscaneos: totalEscaneos[0]?.total || 0,
        totalGrupos: totalGrupos[0]?.total || 0,
        totalZonas: totalZonas[0]?.total || 0,
        rendimientoPorHora
      }
    });
  } catch (error) {
    next(error);
  }
}

// ==================== EXPORTACIÓN A EXCEL ====================

async function exportarDashboardExcel(req, res, next) {
  try {
    const { inventarioId } = req.query;
    const ExcelJS = require('exceljs');
    
    // Obtener datos
    const dashboardData = await getDashboardDataInternal(inventarioId, req);
    
    const workbook = new ExcelJS.Workbook();
    
    // Hoja 1: Resumen General
    const sheet1 = workbook.addWorksheet('Resumen General');
    sheet1.addRow(['Métrica', 'Valor']);
    sheet1.addRow(['Total Escaneos', dashboardData.resumenGeneral?.totalEscaneos || 0]);
    sheet1.addRow(['Total Grupos', dashboardData.resumenGeneral?.totalGrupos || 0]);
    sheet1.addRow(['Total Zonas', dashboardData.resumenGeneral?.totalZonas || 0]);
    sheet1.addRow(['Productos Distintos', dashboardData.resumenGeneral?.productosDistintos || 0]);
    sheet1.addRow(['Conteo 1', dashboardData.conteos?.conteo1 || 0]);
    sheet1.addRow(['Conteo 2', dashboardData.conteos?.conteo2 || 0]);
    sheet1.addRow(['Diferencia Global', dashboardData.conteos?.diferenciaGlobal || 0]);
    sheet1.addRow(['Precisión', `${dashboardData.conteos?.precisionPorcentaje || 0}%`]);
    
    // Hoja 2: Por Zona
    const sheet2 = workbook.addWorksheet('Por Zona');
    sheet2.addRow(['Zona', 'Código', 'Conteo 1', 'Conteo 2', 'Total Unidades', 'Productos Distintos', 'Diferencia', 'Estado']);
    dashboardData.porZona?.forEach(z => {
      sheet2.addRow([z.nombre, z.codigo, z.conteo1, z.conteo2, z.totalUnidades, z.productosDistintos, z.diferencia, z.estado]);
    });
    
    // Hoja 3: Por Grupo
    const sheet3 = workbook.addWorksheet('Por Grupo');
    sheet3.addRow(['Grupo', 'Total Unidades', 'Productos Distintos', 'Diferencia Total', 'Tiempo', 'Rendimiento x Hora']);
    dashboardData.porGrupo?.ranking?.forEach(g => {
      sheet3.addRow([g.nombre, g.totalUnidades, g.productosDistintos, g.diferenciaTotal, g.tiempoFormateado, g.rendimientoPorHora]);
    });
    
    // Hoja 4: Top Productos
    const sheet4 = workbook.addWorksheet('Top Productos');
    sheet4.addRow(['SKU', 'Descripción', 'Total Escaneos', 'Zonas', 'Grupos']);
    dashboardData.productos?.topProductos?.forEach(p => {
      sheet4.addRow([p.sku, p.descripcion, p.totalEscaneos, p.zonasDondeAparece, p.gruposQueEscaniaron]);
    });
    
    // Configurar respuesta
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=dashboard_${inventarioId || 'general'}_${new Date().toISOString().slice(0,19)}.xlsx`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
}

// Función interna para obtener datos
async function getDashboardDataInternal(inventarioId, req) {
  const replacements = { inventarioId: inventarioId || null };
  
  const [resumenGeneral, conteos, porZona, gruposRanking, topProductos] = await Promise.all([
    sequelize.query(
      `SELECT
        (SELECT COUNT(*)::int FROM zonas WHERE activa = true) AS "totalZonas",
        (SELECT COUNT(*)::int FROM grupos ${inventarioId ? 'WHERE "inventarioId" = :inventarioId' : ''}) AS "totalGrupos",
        (SELECT COALESCE(SUM(l.cantidad), 0)::int FROM lecturas l WHERE l.estado = 'valida' ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}) AS "totalEscaneos",
        (SELECT COUNT(DISTINCT l.sku)::int FROM lecturas l WHERE l.estado = 'valida' AND l.sku IS NOT NULL ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}) AS "productosDistintos"
      `,
      { replacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 1 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo1",
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 2 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo2"
      FROM lecturas l WHERE l.estado = 'valida' ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}`,
      { replacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT z.nombre, z.codigo,
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 1 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo1",
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 2 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo2",
        COALESCE(SUM(l.cantidad), 0)::int AS "totalUnidades"
      FROM zonas z
      LEFT JOIN lecturas l ON l."zonaId" = z.id AND l.estado = 'valida' ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
      GROUP BY z.id, z.nombre, z.codigo`,
      { replacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT g.nombre, COALESCE(SUM(l.cantidad), 0)::int AS "totalUnidades"
      FROM grupos g
      LEFT JOIN lecturas l ON l."grupoId" = g.id AND l.estado = 'valida' ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
      ${inventarioId ? 'WHERE g."inventarioId" = :inventarioId' : ''}
      GROUP BY g.id, g.nombre
      ORDER BY "totalUnidades" DESC`,
      { replacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT l.sku, l."descripcionSnapshot" AS descripcion, COALESCE(SUM(l.cantidad), 0)::int AS "totalEscaneos"
      FROM lecturas l
      WHERE l.estado = 'valida' AND l.sku IS NOT NULL ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
      GROUP BY l.sku, l."descripcionSnapshot"
      ORDER BY "totalEscaneos" DESC
      LIMIT 10`,
      { replacements, type: QueryTypes.SELECT }
    )
  ]);
  
  const conteoBase = conteos[0] || { conteo1: 0, conteo2: 0 };
  const diferenciaGlobal = Math.abs(Number(conteoBase.conteo1) - Number(conteoBase.conteo2));
  const precision = Number(conteoBase.conteo1) > 0
    ? Number((1 - diferenciaGlobal / Number(conteoBase.conteo1)) * 100).toFixed(2)
    : 0;
  
  return {
    resumenGeneral: resumenGeneral[0],
    conteos: { ...conteoBase, diferenciaGlobal, precisionPorcentaje: Number(precision) },
    porZona,
    porGrupo: { ranking: gruposRanking },
    productos: { topProductos }
  };
}

module.exports = {
  getDashboard,
  getDashboardResumen,
  exportarDashboardExcel
};