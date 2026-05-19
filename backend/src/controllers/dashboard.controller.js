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

function formatTiempo(segundos) {
  if (!segundos) return '0s';
  const minutos = Math.floor(segundos / 60);
  const segs = segundos % 60;
  if (minutos > 0) return `${minutos}m ${segs}s`;
  return `${segs}s`;
}

// ==================== DASHBOARD PRINCIPAL MEJORADO ====================

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
    
    const replacements = { 
      inventarioId: inventarioId || null,
      fecha: fecha || null,
      grupoId: grupoFiltro || null
    };

    // ==================== 1. RESUMEN GENERAL ====================
    const resumenGeneral = await sequelize.query(`
      SELECT
        (SELECT COUNT(*)::int FROM zonas WHERE activa = true) AS "totalZonas",
        (SELECT COUNT(*)::int FROM grupos ${inventarioId ? 'WHERE "inventarioId" = :inventarioId' : ''}) AS "totalGrupos",
        (SELECT COUNT(*)::int FROM asignaciones_ronda ar 
          JOIN rondas_conteo rc ON rc.id = ar."rondaId"
          ${inventarioId ? 'WHERE rc."inventarioId" = :inventarioId' : ''}) AS "totalAsignaciones",
        (SELECT COALESCE(SUM(l.cantidad), 0)::int FROM lecturas l
          WHERE l.estado = 'valida'
          ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
          ${fechaFilter} ${grupoFilter}) AS "totalEscaneos",
        (SELECT COUNT(DISTINCT l.sku)::int FROM lecturas l
          WHERE l.estado = 'valida' AND l.sku IS NOT NULL
          ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
          ${fechaFilter} ${grupoFilter}) AS "productosDistintos"
    `, { replacements, type: QueryTypes.SELECT });

    // ==================== 2. CONTEOS ====================
    const conteos = await sequelize.query(`
      SELECT
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 1 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo1",
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 2 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo2",
        COALESCE(SUM(CASE WHEN l."conteoTipo" > 2 THEN l.cantidad ELSE 0 END), 0)::int AS "reconteos"
      FROM lecturas l
      WHERE l.estado = 'valida'
      ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
      ${fechaFilter} ${grupoFilter}
    `, { replacements, type: QueryTypes.SELECT });

    const conteoBase = conteos[0] || { conteo1: 0, conteo2: 0, reconteos: 0 };
    const diferenciaGlobal = Math.abs(Number(conteoBase.conteo1) - Number(conteoBase.conteo2));
    const precision = Number(conteoBase.conteo1) > 0
      ? Number((1 - diferenciaGlobal / Number(conteoBase.conteo1)) * 100).toFixed(2)
      : 0;

    // ==================== 3. POR ZONA ====================
    const porZona = await sequelize.query(`
      SELECT
        z.id, z.nombre, z.codigo,
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 1 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo1",
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 2 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo2",
        COALESCE(SUM(l.cantidad), 0)::int AS "totalUnidades",
        COUNT(DISTINCT l.sku)::int AS "productosDistintos",
        COUNT(DISTINCT l."usuarioId")::int AS "personasQueContaron",
        COUNT(DISTINCT l."grupoId")::int AS "gruposQueContaron"
      FROM zonas z
      LEFT JOIN lecturas l ON l."zonaId" = z.id AND l.estado = 'valida'
        ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
        ${fechaFilter} ${grupoFilter}
      GROUP BY z.id, z.nombre, z.codigo
      ORDER BY "totalUnidades" DESC
    `, { replacements, type: QueryTypes.SELECT });

    const zonasProcesadas = porZona.map((z) => {
      const diferencia = Math.abs(Number(z.conteo1) - Number(z.conteo2));
      let estado = 'coincide';
      if (diferencia > 0 && diferencia <= 5) estado = 'diferencia menor';
      if (diferencia > 5) estado = 'requiere reconteo';
      return { ...z, diferencia, estado };
    });

    // ==================== 4. POR GRUPO - MEJORADO ====================
    const gruposQuery = await sequelize.query(`
      WITH grupo_stats AS (
        SELECT
          g.id, g.nombre, g.color,
          COALESCE(SUM(l.cantidad), 0)::int AS "totalUnidades",
          COUNT(DISTINCT l.sku)::int AS "productosDistintos",
          COUNT(DISTINCT l."usuarioId")::int AS "personasEnGrupo",
          COALESCE(SUM(CASE WHEN l."conteoTipo" = 1 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo1",
          COALESCE(SUM(CASE WHEN l."conteoTipo" = 2 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo2",
          MIN(l."fechaHora") AS "primeraLectura",
          MAX(l."fechaHora") AS "ultimaLectura",
          COUNT(DISTINCT l."rondaId")::int AS "rondasRealizadas",
          COUNT(CASE WHEN l.estado = 'no_reconocida' THEN 1 END)::int AS "codigosNoReconocidos"
        FROM grupos g
        LEFT JOIN lecturas l ON l."grupoId" = g.id AND l.estado = 'valida'
          ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
          ${fechaFilter}
        ${inventarioId ? 'WHERE g."inventarioId" = :inventarioId' : ''}
        GROUP BY g.id, g.nombre, g.color
      ),
      discrepancias_grupo AS (
        SELECT
          dc."grupoId",
          SUM(ABS(dc.diferencia))::int AS "diferenciaTotal",
          COUNT(*)::int AS "totalDiscrepancias",
          AVG(ABS(dc.diferencia))::int AS "diferenciaPromedio"
        FROM discrepancias_conteo dc
        WHERE 1=1 ${inventarioId ? 'AND dc."inventarioId" = :inventarioId' : ''}
        GROUP BY dc."grupoId"
      )
      SELECT
        gs.*,
        COALESCE(dg."diferenciaTotal", 0) AS "diferenciaTotal",
        COALESCE(dg."totalDiscrepancias", 0) AS "totalDiscrepancias",
        COALESCE(dg."diferenciaPromedio", 0) AS "diferenciaPromedio",
        CASE
          WHEN gs."primeraLectura" IS NULL THEN NULL
          ELSE EXTRACT(EPOCH FROM (gs."ultimaLectura" - gs."primeraLectura"))
        END AS "tiempoSegundos",
        CASE
          WHEN gs."conteo1" > 0 THEN ROUND((1 - ABS(gs."conteo1" - gs."conteo2")::numeric / gs."conteo1") * 100, 2)
          ELSE 0
        END AS "precisionPorcentaje"
      FROM grupo_stats gs
      LEFT JOIN discrepancias_grupo dg ON dg."grupoId" = gs.id
      ORDER BY gs."totalUnidades" DESC
    `, { replacements, type: QueryTypes.SELECT });

    const gruposProcesados = gruposQuery.map((g) => ({
      ...g,
      tiempoFormateado: formatTiempo(g.tiempoSegundos),
      rendimientoPorHora: g.tiempoSegundos > 0 ? ((g.totalUnidades / g.tiempoSegundos) * 3600).toFixed(2) : 0,
      tasaError: g.totalUnidades > 0 ? ((g.codigosNoReconocidos / g.totalUnidades) * 100).toFixed(2) : 0
    }));

    // ==================== RANKINGS MEJORADOS ====================
    
    // Grupo más productivo (más unidades escaneadas)
    const grupoMasProductivo = calcularGrupoMasProductivo(gruposProcesados);
    
    // Grupo con menos diferencias (menor diferencia absoluta entre conteos)
    const grupoMenosDiferencias = [...gruposProcesados]
      .filter(g => g.conteo1 > 0 || g.conteo2 > 0)
      .sort((a, b) => Math.abs(a.diferenciaTotal) - Math.abs(b.diferenciaTotal))[0] || null;
    
    // Grupo más preciso (mayor porcentaje de precisión)
    const grupoMasPreciso = [...gruposProcesados]
      .filter(g => g.precisionPorcentaje > 0)
      .sort((a, b) => b.precisionPorcentaje - a.precisionPorcentaje)[0] || null;
    
    // Grupo más rápido (mayor rendimiento por hora)
    const grupoMasRapido = [...gruposProcesados]
      .filter(g => g.rendimientoPorHora > 0)
      .sort((a, b) => b.rendimientoPorHora - a.rendimientoPorHora)[0] || null;
    
    // Grupo más consistente (menor tasa de error)
    const grupoMasConsistente = [...gruposProcesados]
      .filter(g => g.tasaError > 0)
      .sort((a, b) => a.tasaError - b.tasaError)[0] || null;
    
    // Grupo que terminó primero (más temprano)
    const grupoTerminoPrimero = [...gruposProcesados]
      .filter(g => g.ultimaLectura)
      .sort((a, b) => new Date(a.ultimaLectura) - new Date(b.ultimaLectura))[0] || null;

    // Grupo más activo (más rondas realizadas)
    const grupoMasActivo = [...gruposProcesados]
      .sort((a, b) => b.rondasRealizadas - a.rondasRealizadas)[0] || null;

    // Grupo con más productos distintos
    const grupoMasVariado = [...gruposProcesados]
      .sort((a, b) => b.productosDistintos - a.productosDistintos)[0] || null;

    // ==================== 5. USUARIOS ====================
    const usuariosStats = await sequelize.query(`
      SELECT
        u.id, u.nombre,
        COUNT(l.id)::int AS "totalEscaneos",
        COUNT(DISTINCT l.sku)::int AS "productosDistintos",
        MIN(l."fechaHora") AS "primerEscaneo",
        MAX(l."fechaHora") AS "ultimoEscaneo"
      FROM usuarios u
      JOIN lecturas l ON l."usuarioId" = u.id
      WHERE l.estado = 'valida'
        ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
        ${fechaFilter} ${grupoFilter}
      GROUP BY u.id, u.nombre
      ORDER BY "totalEscaneos" DESC
      LIMIT 10
    `, { replacements, type: QueryTypes.SELECT });

    // ==================== 6. PRODUCTOS ====================
    const productosStats = await sequelize.query(`
      SELECT
        l.sku,
        l."descripcionSnapshot" AS descripcion,
        COALESCE(SUM(l.cantidad), 0)::int AS "totalEscaneos",
        COUNT(DISTINCT l."zonaId")::int AS "zonasDondeAparece",
        COUNT(DISTINCT l."grupoId")::int AS "gruposQueEscaniaron",
        MAX(l."fechaHora") AS "ultimoEscaneo"
      FROM lecturas l
      WHERE l.estado = 'valida' AND l.sku IS NOT NULL
        ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
        ${fechaFilter} ${grupoFilter}
      GROUP BY l.sku, l."descripcionSnapshot"
      ORDER BY "totalEscaneos" DESC
      LIMIT 20
    `, { replacements, type: QueryTypes.SELECT });

    // ==================== 7. TIEMPOS ====================
    const tiempos = await sequelize.query(`
      SELECT
        MIN(l."fechaHora") AS "inicioGeneral",
        MAX(l."fechaHora") AS "finGeneral",
        EXTRACT(EPOCH FROM (MAX(l."fechaHora") - MIN(l."fechaHora"))) AS "tiempoTotalSegundos"
      FROM lecturas l
      WHERE l.estado = 'valida'
        ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
        ${fechaFilter} ${grupoFilter}
    `, { replacements, type: QueryTypes.SELECT });

    const tiempoEntreEscaneos = await sequelize.query(`
      SELECT
        AVG(EXTRACT(EPOCH FROM (l2."fechaHora" - l1."fechaHora")))::int AS "promedioSegundos"
      FROM lecturas l1
      JOIN lecturas l2 ON l2.id = (
        SELECT id FROM lecturas l3 
        WHERE l3."rondaId" = l1."rondaId" 
          AND l3."fechaHora" > l1."fechaHora"
          AND l3.estado = 'valida'
        ORDER BY l3."fechaHora" ASC LIMIT 1
      )
      WHERE l1.estado = 'valida' AND l2.estado = 'valida'
        ${inventarioId ? 'AND l1."inventarioId" = :inventarioId' : ''}
    `, { replacements, type: QueryTypes.SELECT });

    // ==================== 8. RECONTEOS ====================
    const reconteosStats = await sequelize.query(`
      SELECT
        COUNT(DISTINCT dc.id)::int AS "totalDiscrepancias",
        COUNT(DISTINCT dc."zonaId")::int AS "zonasConReconteo",
        COUNT(DISTINCT dc."grupoId")::int AS "gruposConReconteo",
        AVG(ABS(dc.diferencia))::int AS "diferenciaPromedio",
        MAX(ABS(dc.diferencia))::int AS "diferenciaMaxima"
      FROM discrepancias_conteo dc
      WHERE 1=1 ${inventarioId ? 'AND dc."inventarioId" = :inventarioId' : ''}
    `, { replacements, type: QueryTypes.SELECT });

    // ==================== 9. GRÁFICOS ====================
    const evolucionPorDia = await sequelize.query(`
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
    `, { replacements, type: QueryTypes.SELECT });

    const distribucionPorZona = zonasProcesadas.map(z => ({ zona: z.nombre, total: z.totalUnidades }));
    const comparacionPorZona = zonasProcesadas.map(z => ({ zona: z.nombre, conteo1: z.conteo1, conteo2: z.conteo2 }));

    // ==================== 10. ALERTAS ====================
    const zonasRequierenReconteo = zonasProcesadas.filter(z => z.estado === 'requiere reconteo');
    const gruposSinActividad = gruposProcesados.filter(g => g.totalUnidades === 0);
    
    const fechasSinConteo2 = await sequelize.query(`
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
    `, { replacements, type: QueryTypes.SELECT });

    // ==================== RESPUESTA FINAL ====================
    res.json({
      ok: true,
      data: {
        filtros: {
          inventarioId: inventarioId || null,
          fecha: fecha || null,
          grupoId: grupoFiltro || null,
          esAdmin: req.canViewAllGroups || false
        },
        resumenGeneral: resumenGeneral[0],
        conteos: {
          conteo1: Number(conteoBase.conteo1),
          conteo2: Number(conteoBase.conteo2),
          reconteos: Number(conteoBase.reconteos),
          diferenciaGlobal,
          precisionPorcentaje: Number(precision)
        },
        porZona: zonasProcesadas,
        porGrupo: {
          ranking: gruposProcesados,
          // NUEVOS RANKINGS MEJORADOS
          grupoMasProductivo,
          grupoMenosDiferencias,      // ← NUEVO (antes grupoMenorDiferencia)
          grupoMasPreciso,            // ← NUEVO
          grupoMasRapido,
          grupoMasConsistente,        // ← NUEVO
          grupoMasActivo,             // ← NUEVO
          grupoMasVariado,            // ← NUEVO
          grupoTerminoPrimero
        },
        usuarios: {
          topUsuarios: usuariosStats,
          usuarioMasEscaneos: usuariosStats[0] || null
        },
        productos: {
          topProductos: productosStats,
          productoMasEscaneado: productosStats[0] || null,
          productosConExistenciaCero: []
        },
        tiempos: {
          inicioGeneral: tiempos[0]?.inicioGeneral,
          finGeneral: tiempos[0]?.finGeneral,
          tiempoTotalFormateado: formatTiempo(tiempos[0]?.tiempoTotalSegundos),
          tiempoPromedioEntreEscaneos: tiempoEntreEscaneos[0]?.promedioSegundos 
            ? `${tiempoEntreEscaneos[0].promedioSegundos} segundos`
            : null
        },
        reconteos: reconteosStats[0],
        graficos: {
          evolucionPorDia,
          distribucionPorZona,
          comparacionPorZona
        },
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

// ==================== RESTO DEL CÓDIGO (getDashboardResumen, exportarDashboardExcel, etc.) ====================

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

async function exportarDashboardExcel(req, res, next) {
  try {
    const { inventarioId } = req.query;
    const ExcelJS = require('exceljs');
    
    const dashboardData = await getDashboardDataInternal(inventarioId, req);
    
    const workbook = new ExcelJS.Workbook();
    
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
    
    const sheet2 = workbook.addWorksheet('Por Zona');
    sheet2.addRow(['Zona', 'Código', 'Conteo 1', 'Conteo 2', 'Total Unidades', 'Productos Distintos', 'Diferencia', 'Estado']);
    dashboardData.porZona?.forEach(z => {
      sheet2.addRow([z.nombre, z.codigo, z.conteo1, z.conteo2, z.totalUnidades, z.productosDistintos, z.diferencia, z.estado]);
    });
    
    const sheet3 = workbook.addWorksheet('Por Grupo');
    sheet3.addRow(['Grupo', 'Total Unidades', 'Productos Distintos', 'Diferencia Total', 'Precisión', 'Tasa Error', 'Tiempo', 'Rendimiento x Hora']);
    dashboardData.porGrupo?.ranking?.forEach(g => {
      sheet3.addRow([g.nombre, g.totalUnidades, g.productosDistintos, g.diferenciaTotal, `${g.precisionPorcentaje || 0}%`, `${g.tasaError || 0}%`, g.tiempoFormateado, g.rendimientoPorHora]);
    });
    
    const sheet4 = workbook.addWorksheet('Top Productos');
    sheet4.addRow(['SKU', 'Descripción', 'Total Escaneos', 'Zonas', 'Grupos']);
    dashboardData.productos?.topProductos?.forEach(p => {
      sheet4.addRow([p.sku, p.descripcion, p.totalEscaneos, p.zonasDondeAparece, p.gruposQueEscaniaron]);
    });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=dashboard_${inventarioId || 'general'}_${new Date().toISOString().slice(0,19)}.xlsx`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
}

async function getDashboardDataInternal(inventarioId, req) {
  const replacements = { inventarioId: inventarioId || null };
  
  const [resumenGeneral, conteos, porZona, gruposRanking, topProductos] = await Promise.all([
    sequelize.query(`
      SELECT
        (SELECT COUNT(*)::int FROM zonas WHERE activa = true) AS "totalZonas",
        (SELECT COUNT(*)::int FROM grupos ${inventarioId ? 'WHERE "inventarioId" = :inventarioId' : ''}) AS "totalGrupos",
        (SELECT COALESCE(SUM(l.cantidad), 0)::int FROM lecturas l WHERE l.estado = 'valida' ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}) AS "totalEscaneos",
        (SELECT COUNT(DISTINCT l.sku)::int FROM lecturas l WHERE l.estado = 'valida' AND l.sku IS NOT NULL ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}) AS "productosDistintos"
    `, { replacements, type: QueryTypes.SELECT }),
    sequelize.query(`
      SELECT
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 1 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo1",
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 2 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo2"
      FROM lecturas l WHERE l.estado = 'valida' ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
    `, { replacements, type: QueryTypes.SELECT }),
    sequelize.query(`
      SELECT z.nombre, z.codigo,
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 1 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo1",
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 2 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo2",
        COALESCE(SUM(l.cantidad), 0)::int AS "totalUnidades"
      FROM zonas z
      LEFT JOIN lecturas l ON l."zonaId" = z.id AND l.estado = 'valida' ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
      GROUP BY z.id, z.nombre, z.codigo
    `, { replacements, type: QueryTypes.SELECT }),
    sequelize.query(`
      SELECT g.nombre, COALESCE(SUM(l.cantidad), 0)::int AS "totalUnidades"
      FROM grupos g
      LEFT JOIN lecturas l ON l."grupoId" = g.id AND l.estado = 'valida' ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
      ${inventarioId ? 'WHERE g."inventarioId" = :inventarioId' : ''}
      GROUP BY g.id, g.nombre
      ORDER BY "totalUnidades" DESC
    `, { replacements, type: QueryTypes.SELECT }),
    sequelize.query(`
      SELECT l.sku, l."descripcionSnapshot" AS descripcion, COALESCE(SUM(l.cantidad), 0)::int AS "totalEscaneos"
      FROM lecturas l
      WHERE l.estado = 'valida' AND l.sku IS NOT NULL ${inventarioId ? 'AND l."inventarioId" = :inventarioId' : ''}
      GROUP BY l.sku, l."descripcionSnapshot"
      ORDER BY "totalEscaneos" DESC
      LIMIT 10
    `, { replacements, type: QueryTypes.SELECT })
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
// ==================== CÁLCULO DE GRUPO MÁS PRODUCTIVO (PONDERADO) ====================

function calcularGrupoMasProductivo(grupos) {
  if (!grupos || grupos.length === 0) return null;
  
  // Encontrar máximos para normalizar
  const maxUnidades = Math.max(...grupos.map(g => g.totalUnidades || 0));
  const maxPrecision = Math.max(...grupos.map(g => g.precisionPorcentaje || 0));
  
  // Calcular puntaje ponderado para cada grupo
  const gruposConPuntaje = grupos.map(g => {
    // Normalizar unidades (0-1)
    const unidadesScore = maxUnidades > 0 ? (g.totalUnidades / maxUnidades) : 0;
    
    // Normalizar precisión (0-1)
    const precisionScore = maxPrecision > 0 ? (g.precisionPorcentaje / maxPrecision) : 0;
    
    // Tasa de error inversa (menos error = mejor)
    const errorRate = g.tasaError || 0;
    const errorScore = Math.max(0, 1 - (errorRate / 100));
    
    // Puntaje ponderado: 50% precisión, 30% unidades, 20% tasa error
    const puntaje = (precisionScore * 0.5) + (unidadesScore * 0.3) + (errorScore * 0.2);
    
    return {
      ...g,
      puntajeProductividad: Number(puntaje.toFixed(4)),
      unidadesScore: Number(unidadesScore.toFixed(4)),
      precisionScore: Number(precisionScore.toFixed(4)),
      errorScore: Number(errorScore.toFixed(4))
    };
  });
  
  // Ordenar por puntaje descendente
  gruposConPuntaje.sort((a, b) => b.puntajeProductividad - a.puntajeProductividad);
  
  return gruposConPuntaje[0];
}
module.exports = {
  getDashboard,
  getDashboardResumen,
  exportarDashboardExcel,
  calcularGrupoMasProductivo
};