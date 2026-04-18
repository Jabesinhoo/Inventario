const ExcelJS = require('exceljs');
const { sequelize, QueryTypes } = require('sequelize');
const { Lectura, Grupo, Zona, Inventario, RondaConteo, DiscrepanciaConteo } = require('../models');

// ==================== EXPORTAR RESULTADOS FINALES ====================

async function exportarResultadosFinales(req, res, next) {
  try {
    const { inventarioId, grupoId } = req.query;

    if (!inventarioId) {
      return res.status(400).json({ ok: false, message: 'inventarioId es requerido' });
    }

    // 🔒 AISLAMIENTO
    let grupoFiltro = grupoId;
    if (!req.canViewAllGroups && req.grupoId) {
      grupoFiltro = req.grupoId;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sistema de Inventario';
    workbook.created = new Date();

    // ==================== HOJA 1: RESULTADOS FINALES ====================
    const sheetFinal = workbook.addWorksheet('Resultados Finales');
    sheetFinal.columns = [
      { header: 'Zona', key: 'zona', width: 25 },
      { header: 'Grupo', key: 'grupo', width: 20 },
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Descripción', key: 'descripcion', width: 40 },
      { header: 'Conteo Final', key: 'cantidadFinal', width: 15 },
      { header: 'Estado', key: 'estado', width: 20 },
      { header: 'Criterio', key: 'criterio', width: 25 }
    ];

    // Obtener resultados finales (de discrepancias conciliadas)
    const resultadosFinales = await DiscrepanciaConteo.findAll({
      where: {
        inventarioId,
        ...(grupoFiltro ? { grupoId: grupoFiltro } : {}),
        estado: { [Op.in]: ['conciliado', 'conciliado_manual'] }
      },
      include: [
        { model: Zona, as: 'zona', attributes: ['nombre'] },
        { model: Grupo, as: 'grupo', attributes: ['nombre'] }
      ]
    });

    for (const item of resultadosFinales) {
      sheetFinal.addRow({
        zona: item.zona?.nombre || 'N/A',
        grupo: item.grupo?.nombre || 'N/A',
        sku: item.sku,
        descripcion: item.descripcionSnapshot || '',
        cantidadFinal: item.cantidadFinal || item.cantidadBase,
        estado: item.estado === 'conciliado' ? '✅ Conciliado' : '✏️ Ajuste manual',
        criterio: item.criterioCierre || 'Automático'
      });
    }

    // ==================== HOJA 2: CONTEOS DETALLADOS ====================
    const sheetDetalle = workbook.addWorksheet('Conteos Detallados');
    sheetDetalle.columns = [
      { header: 'Zona', key: 'zona', width: 25 },
      { header: 'Grupo', key: 'grupo', width: 20 },
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Descripción', key: 'descripcion', width: 40 },
      { header: 'Conteo Inicial', key: 'inicial', width: 15 },
      { header: 'Conteo 1', key: 'conteo1', width: 15 },
      { header: 'Conteo 2', key: 'conteo2', width: 15 },
      { header: 'Conteo 3+', key: 'conteoN', width: 15 },
      { header: 'Diferencia', key: 'diferencia', width: 15 },
      { header: 'Estado', key: 'estado', width: 20 }
    ];

    // Query para obtener todos los conteos por SKU
    const conteosDetalle = await sequelize.query(
      `
      SELECT 
        z.nombre AS zona,
        g.nombre AS grupo,
        l.sku,
        MAX(l."descripcionSnapshot") AS descripcion,
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 0 THEN l.cantidad ELSE 0 END), 0) AS inicial,
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 1 THEN l.cantidad ELSE 0 END), 0) AS conteo1,
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 2 THEN l.cantidad ELSE 0 END), 0) AS conteo2,
        COALESCE(SUM(CASE WHEN l."conteoTipo" > 2 THEN l.cantidad ELSE 0 END), 0) AS conteoN
      FROM lecturas l
      JOIN zonas z ON z.id = l."zonaId"
      JOIN grupos g ON g.id = l."grupoId"
      WHERE l."inventarioId" = :inventarioId
        AND l.estado = 'valida'
        ${grupoFiltro ? 'AND l."grupoId" = :grupoId' : ''}
      GROUP BY z.nombre, g.nombre, l.sku
      ORDER BY z.nombre, g.nombre, l.sku
      `,
      {
        replacements: { inventarioId, grupoId: grupoFiltro },
        type: QueryTypes.SELECT
      }
    );

    for (const item of conteosDetalle) {
      const diferencia = Math.abs((item.conteo1 || 0) - (item.conteo2 || 0));
      sheetDetalle.addRow({
        zona: item.zona,
        grupo: item.grupo,
        sku: item.sku,
        descripcion: item.descripcion,
        inicial: item.inicial,
        conteo1: item.conteo1,
        conteo2: item.conteo2,
        conteoN: item.conteoN,
        diferencia,
        estado: diferencia === 0 ? '✅ Coincide' : '⚠️ Diferencia'
      });
    }

    // ==================== HOJA 3: ESTADÍSTICAS ====================
    const sheetStats = workbook.addWorksheet('Estadísticas');
    sheetStats.columns = [
      { header: 'Métrica', key: 'metrica', width: 35 },
      { header: 'Valor', key: 'valor', width: 30 }
    ];

    // Calcular estadísticas
    const totalEscaneos = await Lectura.sum('cantidad', {
      where: { inventarioId, estado: 'valida', ...(grupoFiltro ? { grupoId: grupoFiltro } : {}) }
    });

    const totalDiscrepancias = await DiscrepanciaConteo.count({
      where: { inventarioId, ...(grupoFiltro ? { grupoId: grupoFiltro } : {}) }
    });

    const zonasConDiferencias = await DiscrepanciaConteo.findAll({
      where: { inventarioId, ...(grupoFiltro ? { grupoId: grupoFiltro } : {}) },
      attributes: ['zonaId'],
      group: ['zonaId'],
      include: [{ model: Zona, as: 'zona', attributes: ['nombre'] }]
    });

    const gruposConDiferencias = await DiscrepanciaConteo.findAll({
      where: { inventarioId, ...(grupoFiltro ? { grupoId: grupoFiltro } : {}) },
      attributes: ['grupoId'],
      group: ['grupoId'],
      include: [{ model: Grupo, as: 'grupo', attributes: ['nombre'] }]
    });

    const productosConMasDiferencias = await DiscrepanciaConteo.findAll({
      where: { inventarioId, ...(grupoFiltro ? { grupoId: grupoFiltro } : {}) },
      attributes: ['sku', 'descripcionSnapshot', 'diferencia'],
      order: [['diferencia', 'DESC']],
      limit: 10
    });

    sheetStats.addRow({ metrica: 'Total de escaneos', valor: totalEscaneos || 0 });
    sheetStats.addRow({ metrica: 'Total de discrepancias', valor: totalDiscrepancias });
    sheetStats.addRow({ metrica: 'Zonas con diferencias', valor: zonasConDiferencias.length });
    sheetStats.addRow({ metrica: 'Grupos con diferencias', valor: gruposConDiferencias.length });
    sheetStats.addRow({ metrica: '', valor: '' });
    sheetStats.addRow({ metrica: 'TOP 10 - Productos con más diferencias', valor: '' });

    for (const p of productosConMasDiferencias) {
      sheetStats.addRow({ metrica: `  ${p.sku}`, valor: `${p.diferencia} unidades` });
    }

    // ==================== HOJA 4: POR GRUPO ====================
    const sheetGrupos = workbook.addWorksheet('Resumen por Grupo');
    sheetGrupos.columns = [
      { header: 'Grupo', key: 'grupo', width: 25 },
      { header: 'Líder', key: 'lider', width: 25 },
      { header: 'Total Unidades', key: 'totalUnidades', width: 15 },
      { header: 'Productos Distintos', key: 'productosDistintos', width: 18 },
      { header: 'Diferencia Total', key: 'diferenciaTotal', width: 15 },
      { header: 'Tiempo (min)', key: 'tiempoMinutos', width: 15 },
      { header: 'Rendimiento (u/h)', key: 'rendimiento', width: 18 }
    ];

    const gruposStats = await sequelize.query(
      `
      SELECT 
        g.id,
        g.nombre,
        u.nombre AS lider,
        COALESCE(SUM(l.cantidad), 0)::int AS "totalUnidades",
        COUNT(DISTINCT l.sku)::int AS "productosDistintos",
        COALESCE(SUM(dc.diferencia), 0)::int AS "diferenciaTotal",
        EXTRACT(EPOCH FROM (MAX(l."fechaHora") - MIN(l."fechaHora"))) / 60 AS "tiempoMinutos"
      FROM grupos g
      LEFT JOIN usuarios u ON u.id = g."liderId"
      LEFT JOIN lecturas l ON l."grupoId" = g.id AND l.estado = 'valida' AND l."inventarioId" = :inventarioId
      LEFT JOIN discrepancias_conteo dc ON dc."grupoId" = g.id AND dc."inventarioId" = :inventarioId
      ${grupoFiltro ? 'WHERE g.id = :grupoId' : ''}
      GROUP BY g.id, g.nombre, u.nombre
      ORDER BY "totalUnidades" DESC
      `,
      { replacements: { inventarioId, grupoId: grupoFiltro }, type: QueryTypes.SELECT }
    );

    for (const g of gruposStats) {
      const rendimiento = g.tiempoMinutos > 0 ? Math.round((g.totalUnidades / g.tiempoMinutos) * 60) : 0;
      sheetGrupos.addRow({
        grupo: g.nombre,
        lider: g.lider || 'Sin líder',
        totalUnidades: g.totalUnidades,
        productosDistintos: g.productosDistintos,
        diferenciaTotal: g.diferenciaTotal,
        tiempoMinutos: Math.round(g.tiempoMinutos || 0),
        rendimiento
      });
    }

    // Configurar respuesta
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=resultados_inventario_${inventarioId}_${new Date().toISOString().slice(0,19)}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
}

// ==================== EXPORTAR ESCANEO DE UN GRUPO ====================

async function exportarEscaneoGrupo(req, res, next) {
  try {
    const { rondaId, grupoId } = req.query;

    if (!rondaId || !grupoId) {
      return res.status(400).json({ ok: false, message: 'rondaId y grupoId son requeridos' });
    }

    // 🔒 Verificar acceso
    if (!req.canViewAllGroups && parseInt(grupoId) !== req.grupoId) {
      return res.status(403).json({ ok: false, message: 'No puedes exportar datos de otro grupo' });
    }

    const lecturas = await Lectura.findAll({
      where: { rondaId, grupoId, estado: 'valida' },
      order: [['fechaHora', 'ASC']],
      include: [
        { model: Usuario, as: 'usuario', attributes: ['nombre'] },
        { model: Zona, as: 'zona', attributes: ['nombre'] }
      ]
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Escaneos');

    sheet.columns = [
      { header: 'Fecha/Hora', key: 'fecha', width: 20 },
      { header: 'Usuario', key: 'usuario', width: 20 },
      { header: 'Zona', key: 'zona', width: 25 },
      { header: 'Código', key: 'codigo', width: 15 },
      { header: 'SKU', key: 'sku', width: 15 },
      { header: 'Descripción', key: 'descripcion', width: 40 },
      { header: 'Estado', key: 'estado', width: 15 }
    ];

    for (const l of lecturas) {
      sheet.addRow({
        fecha: l.fechaHora.toLocaleString(),
        usuario: l.usuario?.nombre || 'N/A',
        zona: l.zona?.nombre || 'N/A',
        codigo: l.codigoLeido,
        sku: l.sku || 'No reconocido',
        descripcion: l.descripcionSnapshot || '',
        estado: l.estado === 'valida' ? '✅ Válido' : '⚠️ No reconocido'
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=escaneos_grupo_${grupoId}_ronda_${rondaId}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  exportarResultadosFinales,
  exportarEscaneoGrupo
};