const Joi = require('joi');
const ExcelJS = require('exceljs');
const { QueryTypes, Op } = require('sequelize');
const { sequelize, Zona, Inventario, RondaConteo, DiscrepanciaConteo, ParejaInventario } = require('../models');
const parejaService = require('../services/parejaInventario.service');

const compareSchema = Joi.object({
  inventarioBaseId: Joi.number().integer().required(),
  inventarioComparadoId: Joi.number().integer().required(),
  zonaBaseId: Joi.number().integer().allow(null, ''),
  zonaComparadaId: Joi.number().integer().allow(null, ''),
  zonaId: Joi.number().integer().allow(null, ''),
  cantidadesAceptadas: Joi.string().allow(null, '', '{}')
});

function isAdminOrSupervisor(req) {
  return ['admin', 'supervisor'].includes(String(req.user?.rol || '').toLowerCase());
}

function normalizeZoneText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function areEquivalentZones(zonaA, zonaB) {
  if (!zonaA || !zonaB) return false;

  const codigoA = normalizeZoneText(zonaA.codigo);
  const codigoB = normalizeZoneText(zonaB.codigo);

  if (codigoA && codigoB) {
    return codigoA === codigoB;
  }

  const nombreA = normalizeZoneText(zonaA.nombre);
  const nombreB = normalizeZoneText(zonaB.nombre);

  return nombreA === nombreB;
}

async function getAllowedGroupIds(req) {
  if (isAdminOrSupervisor(req)) return null;

  const rows = await sequelize.query(
    `
    SELECT DISTINCT ug."grupoId"
    FROM usuario_grupo ug
    WHERE ug."usuarioId" = :usuarioId
    `,
    {
      replacements: { usuarioId: req.user.id },
      type: QueryTypes.SELECT
    }
  );

  return rows.map((row) => Number(row.grupoId));
}

function buildLecturasFilterSql({
  groupIds,
  zonaId,
  alias = 'l',
  groupParam = 'groupIds',
  zonaParam = 'zonaId'
}) {
  let sql = '';

  if (groupIds !== null) {
    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      return ' AND 1 = 0 ';
    }
    sql += ` AND ${alias}."grupoId" IN (:${groupParam}) `;
  }

  if (zonaId) {
    sql += ` AND ${alias}."zonaId" = :${zonaParam} `;
  }

  return sql;
}

async function getSkuComparisonRows(
  inventarioBaseId,
  inventarioComparadoId,
  allowedGroupIds,
  zonaBaseId,
  zonaComparadaId
) {
  const filterBase = buildLecturasFilterSql({
    groupIds: allowedGroupIds,
    zonaId: zonaBaseId,
    alias: 'l',
    groupParam: 'allowedGroupIds',
    zonaParam: 'zonaBaseId'
  });

  const filterComparado = buildLecturasFilterSql({
    groupIds: allowedGroupIds,
    zonaId: zonaComparadaId,
    alias: 'l',
    groupParam: 'allowedGroupIds',
    zonaParam: 'zonaComparadaId'
  });

  // 🔥 CORREGIDO: usar la misma lógica para ambos inventarios
  const baseRows = await sequelize.query(
    `
    WITH ultima_ronda_base AS (
      SELECT id
      FROM rondas_conteo
      WHERE "inventarioId" = :inventarioBaseId
        AND "tipoRonda" = 'completa'
        AND estado = 'cerrada'
        ${zonaBaseId ? 'AND "zonaId" = :zonaBaseId' : ''}
      ORDER BY "numeroRonda" DESC
      LIMIT 1
    )
    SELECT 
      l.sku,
      MAX(l."descripcionSnapshot") AS descripcion,
      COALESCE(SUM(l.cantidad), 0)::int AS cantidad
    FROM lecturas l
    WHERE l."inventarioId" = :inventarioBaseId
      AND l.estado = 'valida'
      AND l.sku IS NOT NULL
      AND l."rondaId" IN (SELECT id FROM ultima_ronda_base)
      ${filterBase}
    GROUP BY l.sku
    ORDER BY l.sku ASC
    `,
    {
      replacements: {
        inventarioBaseId,
        allowedGroupIds,
        zonaBaseId: zonaBaseId || null
      },
      type: QueryTypes.SELECT
    }
  );

  // 🔥 CORREGIDO: misma lógica para el inventario comparado
  const comparadoRows = await sequelize.query(
    `
    WITH ultima_ronda_comparado AS (
      SELECT id
      FROM rondas_conteo
      WHERE "inventarioId" = :inventarioComparadoId
        AND "tipoRonda" = 'completa'
        AND estado = 'cerrada'
        ${zonaComparadaId ? 'AND "zonaId" = :zonaComparadaId' : ''}
      ORDER BY "numeroRonda" DESC
      LIMIT 1
    )
    SELECT 
      l.sku,
      MAX(l."descripcionSnapshot") AS descripcion,
      COALESCE(SUM(l.cantidad), 0)::int AS cantidad
    FROM lecturas l
    WHERE l."inventarioId" = :inventarioComparadoId
      AND l.estado = 'valida'
      AND l.sku IS NOT NULL
      AND l."rondaId" IN (SELECT id FROM ultima_ronda_comparado)
      ${filterComparado}
    GROUP BY l.sku
    ORDER BY l.sku ASC
    `,
    {
      replacements: {
        inventarioComparadoId,
        allowedGroupIds,
        zonaComparadaId: zonaComparadaId || null
      },
      type: QueryTypes.SELECT
    }
  );

  const baseMap = new Map();
  const comparadoMap = new Map();

  for (const row of baseRows) {
    baseMap.set(row.sku, {
      sku: row.sku,
      descripcion: row.descripcion || 'Sin descripción',
      cantidad: Number(row.cantidad || 0)
    });
  }

  for (const row of comparadoRows) {
    comparadoMap.set(row.sku, {
      sku: row.sku,
      descripcion: row.descripcion || 'Sin descripción',
      cantidad: Number(row.cantidad || 0)
    });
  }

  const allSkus = Array.from(new Set([...baseMap.keys(), ...comparadoMap.keys()])).sort();

  return allSkus.map((sku) => {
    const base = baseMap.get(sku);
    const comparado = comparadoMap.get(sku);

    const cantidadBase = Number(base?.cantidad || 0);
    const cantidadComparada = Number(comparado?.cantidad || 0);
    const diferencia = cantidadComparada - cantidadBase;

    return {
      sku,
      descripcion: base?.descripcion || comparado?.descripcion || 'Sin descripción',
      cantidadBase,
      cantidadComparada,
      diferencia,
      estado: diferencia === 0 ? 'coincide' : 'difiere'
    };
  });
}

async function getTotalesPorGrupo(inventarioId, allowedGroupIds, zonaId) {
  const filter = buildLecturasFilterSql({
    groupIds: allowedGroupIds,
    zonaId,
    alias: 'l',
    groupParam: 'allowedGroupIds',
    zonaParam: 'zonaId'
  });

  return sequelize.query(
    `
    WITH ultima_ronda AS (
      SELECT id
      FROM rondas_conteo
      WHERE "inventarioId" = :inventarioId
        AND "tipoRonda" = 'completa'
        ${zonaId ? 'AND "zonaId" = :zonaId' : ''}
      ORDER BY "numeroRonda" DESC
      LIMIT 1
    )
    SELECT
      g.id AS "id",
      g.nombre AS "nombre",
      MAX(z.nombre) AS "zona",
      COALESCE(SUM(l.cantidad), 0)::int AS "totalEscaneos",
      COUNT(DISTINCT l.sku)::int AS "productosUnicos"
    FROM lecturas l
    INNER JOIN ultima_ronda ur ON ur.id = l."rondaId"
    LEFT JOIN grupos g ON g.id = l."grupoId"
    LEFT JOIN zonas z ON z.id = l."zonaId"
    WHERE l."inventarioId" = :inventarioId
      AND l.estado = 'valida'
      ${filter}
    GROUP BY g.id, g.nombre
    ORDER BY g.nombre ASC
    `,
    {
      replacements: {
        inventarioId,
        allowedGroupIds,
        zonaId: zonaId || null
      },
      type: QueryTypes.SELECT
    }
  );
}

async function getTotalesPorZona(inventarioId, allowedGroupIds, zonaId) {
  const filter = buildLecturasFilterSql({
    groupIds: allowedGroupIds,
    zonaId,
    alias: 'l',
    groupParam: 'allowedGroupIds',
    zonaParam: 'zonaId'
  });

  return sequelize.query(
    `
    WITH ultima_ronda AS (
      SELECT id
      FROM rondas_conteo
      WHERE "inventarioId" = :inventarioId
        AND "tipoRonda" = 'completa'
        ${zonaId ? 'AND "zonaId" = :zonaId' : ''}
      ORDER BY "numeroRonda" DESC
      LIMIT 1
    )
    SELECT
      z.id AS "id",
      z.nombre AS "nombre",
      z.codigo AS "codigo",
      COALESCE(SUM(l.cantidad), 0)::int AS "totalEscaneos",
      COUNT(DISTINCT l.sku)::int AS "productosUnicos"
    FROM lecturas l
    INNER JOIN ultima_ronda ur ON ur.id = l."rondaId"
    LEFT JOIN zonas z ON z.id = l."zonaId"
    WHERE l."inventarioId" = :inventarioId
      AND l.estado = 'valida'
      ${filter}
    GROUP BY z.id, z.nombre, z.codigo
    ORDER BY z.nombre ASC
    `,
    {
      replacements: {
        inventarioId,
        allowedGroupIds,
        zonaId: zonaId || null
      },
      type: QueryTypes.SELECT
    }
  );
}

async function getTotalesPorMiembro(inventarioId, allowedGroupIds, zonaId) {
  const filter = buildLecturasFilterSql({
    groupIds: allowedGroupIds,
    zonaId,
    alias: 'l',
    groupParam: 'allowedGroupIds',
    zonaParam: 'zonaId'
  });

  return sequelize.query(
    `
    WITH ultima_ronda AS (
      SELECT id
      FROM rondas_conteo
      WHERE "inventarioId" = :inventarioId
        AND "tipoRonda" = 'completa'
        ${zonaId ? 'AND "zonaId" = :zonaId' : ''}
      ORDER BY "numeroRonda" DESC
      LIMIT 1
    )
    SELECT
      u.id AS "id",
      u.nombre AS "nombre",
      u.email AS "email",
      MAX(g.nombre) AS "grupo",
      MAX(z.nombre) AS "zona",
      COALESCE(SUM(l.cantidad), 0)::int AS "totalEscaneos",
      COUNT(DISTINCT l.sku)::int AS "productosUnicos"
    FROM lecturas l
    INNER JOIN ultima_ronda ur ON ur.id = l."rondaId"
    LEFT JOIN usuarios u ON u.id = l."usuarioId"
    LEFT JOIN grupos g ON g.id = l."grupoId"
    LEFT JOIN zonas z ON z.id = l."zonaId"
    WHERE l."inventarioId" = :inventarioId
      AND l.estado = 'valida'
      ${filter}
    GROUP BY u.id, u.nombre, u.email
    ORDER BY u.nombre ASC
    `,
    {
      replacements: {
        inventarioId,
        allowedGroupIds,
        zonaId: zonaId || null
      },
      type: QueryTypes.SELECT
    }
  );
}

async function buildComparisonData(
  req,
  inventarioBaseId,
  inventarioComparadoId,
  zonaBaseId,
  zonaComparadaId
) {
  const allowedGroupIds = await getAllowedGroupIds(req);

  let zonaBase = null;
  let zonaComparada = null;

  if ((zonaBaseId && !zonaComparadaId) || (!zonaBaseId && zonaComparadaId)) {
    const error = new Error(
      'Si vas a comparar por zona, debes seleccionar zona base y zona comparada.'
    );
    error.status = 400;
    throw error;
  }

  if (zonaBaseId && zonaComparadaId) {
    const zonas = await Promise.all([
      Zona.findByPk(Number(zonaBaseId), { attributes: ['id', 'nombre', 'codigo'] }),
      Zona.findByPk(Number(zonaComparadaId), { attributes: ['id', 'nombre', 'codigo'] })
    ]);

    zonaBase = zonas[0];
    zonaComparada = zonas[1];

    if (!zonaBase || !zonaComparada) {
      const error = new Error('Una de las zonas seleccionadas no existe');
      error.status = 404;
      throw error;
    }

    if (!areEquivalentZones(zonaBase, zonaComparada)) {
      const error = new Error(
        `No se puede comparar la zona "${zonaBase.nombre}" con "${zonaComparada.nombre}" porque no son equivalentes.`
      );
      error.status = 400;
      throw error;
    }
  }

  const comparisonRows = await getSkuComparisonRows(
    inventarioBaseId,
    inventarioComparadoId,
    allowedGroupIds,
    zonaBaseId,
    zonaComparadaId
  );

  const coinciden = comparisonRows.filter((row) => row.estado === 'coincide');
  const diferencias = comparisonRows.filter((row) => row.estado === 'difiere');

  const [
    gruposBase,
    gruposComparado,
    zonasBase,
    zonasComparado,
    miembrosBase,
    miembrosComparado
  ] = await Promise.all([
    getTotalesPorGrupo(inventarioBaseId, allowedGroupIds, zonaBaseId),
    getTotalesPorGrupo(inventarioComparadoId, allowedGroupIds, zonaComparadaId),
    getTotalesPorZona(inventarioBaseId, allowedGroupIds, zonaBaseId),
    getTotalesPorZona(inventarioComparadoId, allowedGroupIds, zonaComparadaId),
    getTotalesPorMiembro(inventarioBaseId, allowedGroupIds, zonaBaseId),
    getTotalesPorMiembro(inventarioComparadoId, allowedGroupIds, zonaComparadaId)
  ]);

  return {
    filtros: {
      inventarioBaseId,
      inventarioComparadoId,
      zonaBase: zonaBase ? zonaBase.toJSON() : null,
      zonaComparada: zonaComparada ? zonaComparada.toJSON() : null
    },
    resumen: {
      inventarioBaseId,
      inventarioComparadoId,
      totalItemsComparados: comparisonRows.length,
      totalDiferencias: diferencias.length,
      totalDiferenciaUnidades: diferencias.reduce((sum, row) => sum + Math.abs(row.diferencia), 0)
    },
    comparacion: comparisonRows,
    coinciden,
    diferencias,
    totales: {
      base: {
        grupos: gruposBase,
        zonas: zonasBase,
        miembros: miembrosBase
      },
      comparado: {
        grupos: gruposComparado,
        zonas: zonasComparado,
        miembros: miembrosComparado
      }
    }
  };
}

async function compareInventarios(req, res, next) {
  try {
    const { error, value } = compareSchema.validate(req.query);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const data = await buildComparisonData(
      req,
      Number(value.inventarioBaseId),
      Number(value.inventarioComparadoId),
      value.zonaBaseId ? Number(value.zonaBaseId) : null,
      value.zonaComparadaId ? Number(value.zonaComparadaId) : null
    );

    const pareja = await parejaService.crearOPareja(
      Number(value.inventarioBaseId),
      Number(value.inventarioComparadoId),
      value.zonaBaseId ? Number(value.zonaBaseId) : null
    );

    if (data.diferencias.length > 0 && pareja.estado === 'completada') {
      await parejaService.actualizarEstadoPareja(pareja.id, 'pendiente');
    }

    res.json({
      ok: true,
      data: {
        ...data,
        pareja: {
          id: pareja.id,
          estado: pareja.estado,
          fechaComparacion: pareja.fechaComparacion
        }
      }
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        ok: false,
        message: error.message
      });
    }
    next(error);
  }
}

async function exportarComparacionExcel(req, res, next) {
  try {
    console.log('📥 Exportando diferencias a Excel...');
    console.log('📋 Método:', req.method);
    console.log('📋 Query recibido:', req.query);
    console.log('📋 Body recibido:', req.body);

    const { error, value } = compareSchema.validate(req.query);

    if (error) {
      console.log('❌ Error de validación:', error.details[0].message);
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    console.log('✅ Validación exitosa. Value:', value);

    // Obtener cantidades aceptadas
    let cantidadesAceptadas = {};

    if (req.method === 'POST') {
      cantidadesAceptadas = req.body.cantidadesAceptadas || {};
      console.log('📦 Obteniendo cantidades del BODY (POST)');
    } else {
      const rawCantidades = req.query.cantidadesAceptadas;
      if (rawCantidades) {
        try {
          cantidadesAceptadas = JSON.parse(rawCantidades);
          console.log('📦 Obteniendo cantidades del QUERY (GET)');
        } catch (e) {
          console.error('Error parsing cantidadesAceptadas:', e.message);
        }
      }
    }

    if (typeof cantidadesAceptadas === 'string') {
      try {
        cantidadesAceptadas = JSON.parse(cantidadesAceptadas);
      } catch (e) {
        console.error('Error parsing cantidadesAceptadas string:', e.message);
        cantidadesAceptadas = {};
      }
    }

    console.log(`📦 Cantidades aceptadas: ${Object.keys(cantidadesAceptadas).length} SKUs`);

    // Obtener datos de comparación
    const data = await buildComparisonData(
      req,
      Number(value.inventarioBaseId),
      Number(value.inventarioComparadoId),
      value.zonaBaseId ? Number(value.zonaBaseId) : null,
      value.zonaComparadaId ? Number(value.zonaComparadaId) : null
    );

    // Obtener datos de productos desde la BD
    const { ConteoInicialDetalle } = require('../models');

    const skusUnicos = [...new Set(data.comparacion.map(p => p.sku))];

    const productosInfo = await ConteoInicialDetalle.findAll({
      where: {
        inventarioId: value.inventarioBaseId,
        sku: { [Op.in]: skusUnicos }
      },
      include: [{ model: Zona, as: 'zona', attributes: ['nombre', 'codigo'] }],
      attributes: ['sku', 'descripcionSnapshot', 'unidadMedida', 'grupoNombre', 'precioCoste']
    });

    const datosProductosMap = new Map();
    for (const prod of productosInfo) {
      if (!datosProductosMap.has(prod.sku)) {
        datosProductosMap.set(prod.sku, {
          descripcion: prod.descripcionSnapshot || 'Sin descripción',
          unidadMedida: prod.unidadMedida || 'Und.',
          grupoNombre: prod.grupoNombre || 'SIN GRUPO',
          precioCoste: prod.precioCoste || 0
        });
      }
    }

    console.log(`✅ Datos encontrados en BD: ${datosProductosMap.size} productos`);

    const workbook = new ExcelJS.Workbook();

    // ==================== HOJA 1: RESUMEN GENERAL ====================
    const resumenSheet = workbook.addWorksheet('📊 RESUMEN GENERAL');
    resumenSheet.columns = [
      { header: 'Concepto', key: 'concepto', width: 35 },
      { header: 'Valor', key: 'valor', width: 25 }
    ];

    resumenSheet.getRow(1).font = { bold: true };
    resumenSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563eb' }
    };
    resumenSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

    const fechaActual = new Date();
    const fechaStr = fechaActual.toISOString().slice(0, 10);
    const mesActual = fechaActual.toLocaleString('es', { month: 'long' });
    const nombreEmpresa = 'TECNOCOMPUTER MELISSA SANDOVAL';
    let totalRegistros = 0;
    let totalUnidades = 0;
    let valorTotalInventario = 0;

    const todosProductos = data.comparacion || [];

    // Calcular totales generales
    for (const producto of todosProductos) {
      let cantidadAceptada = cantidadesAceptadas[producto.sku] !== undefined
        ? Number(cantidadesAceptadas[producto.sku])
        : producto.cantidadComparada || 0;

      const datosBD = datosProductosMap.get(producto.sku) || {};
      const precioCoste = datosBD.precioCoste || 0;

      totalRegistros++;
      totalUnidades += cantidadAceptada;
      valorTotalInventario += cantidadAceptada * precioCoste;
    }

    resumenSheet.addRows([
      { concepto: '📊 INFORMACIÓN GENERAL', valor: '' },
      { concepto: 'Fecha Exportación', valor: fechaActual.toLocaleString() },
      { concepto: 'Empresa', valor: nombreEmpresa },
      { concepto: 'Elaborado Por', valor: req.user?.nombre || 'Admin' },
      { concepto: '', valor: '' },
      { concepto: '📦 INVENTARIOS COMPARADOS', valor: '' },
      { concepto: 'Inventario Base ID', valor: data.resumen.inventarioBaseId },
      { concepto: 'Inventario Comparado ID', valor: data.resumen.inventarioComparadoId },
      { concepto: 'Zona Base', valor: data.filtros.zonaBase?.nombre || 'Todas' },
      { concepto: 'Zona Comparada', valor: data.filtros.zonaComparada?.nombre || 'Todas' },
      { concepto: '', valor: '' },
      { concepto: '📈 ESTADÍSTICAS', valor: '' },
      { concepto: 'Total Productos', valor: todosProductos.length },
      { concepto: 'Total Coincidencias', valor: data.coinciden.length },
      { concepto: 'Total Diferencias', valor: data.diferencias.length },
      { concepto: 'Total SKU Ajustados', valor: Object.keys(cantidadesAceptadas).length },
      { concepto: '', valor: '' },
      { concepto: '💰 VALORES', valor: '' },
      { concepto: 'Total Unidades Aceptadas', valor: totalUnidades.toLocaleString() },
      { concepto: 'Valor Total Inventario', valor: `$${valorTotalInventario.toLocaleString()}` },
      { concepto: '', valor: '' },
      { concepto: '📋 CONFIGURACIÓN', valor: '' },
      { concepto: 'Tipo Documento', valor: 'AI' },
      { concepto: 'Verificado', valor: '-1 (SI)' },
      { concepto: 'Anulado', valor: '0 (NO)' },
      { concepto: 'IVA', valor: '0' }
    ]);

    // ==================== HOJA: INVENTARIO COMPLETO ====================
    const inventarioSheet = workbook.addWorksheet('📦 INVENTARIO COMPLETO');

    inventarioSheet.columns = [
      { header: 'Empresa', key: 'empresa', width: 30 },
      { header: 'Tipo Documento', key: 'tipoDocumento', width: 15 },
      { header: 'Documento Número', key: 'documentoNumero', width: 20 },
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Elaborado', key: 'elaborado', width: 20 },
      { header: 'Destino', key: 'destino', width: 25 },
      { header: 'Nota', key: 'nota', width: 35 },
      { header: 'Verificado', key: 'verificado', width: 12 },
      { header: 'Anulado', key: 'anulado', width: 10 },
      { header: 'Producto', key: 'producto', width: 20 },
      { header: 'Descripción', key: 'descripcion', width: 60 },
      { header: 'Unidad De Medida', key: 'unidadMedida', width: 15 },
      { header: 'Cantidad Físico', key: 'cantidadFisico', width: 18 },
      { header: 'Cantidad Sistema', key: 'cantidadSistema', width: 15 },
      { header: 'IVA', key: 'iva', width: 10 },
      { header: 'Valor Unitario', key: 'valorUnitario', width: 15 },
      { header: 'Descuento', key: 'descuento', width: 10 },
      { header: 'Vencimiento', key: 'vencimiento', width: 12 },
      { header: 'Lote', key: 'lote', width: 15 },
      { header: 'Talla', key: 'talla', width: 10 },
      { header: 'Color', key: 'color', width: 15 }
    ];

    inventarioSheet.getRow(1).font = { bold: true };
    inventarioSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563eb' }
    };
    inventarioSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

    // Agregar todos los productos al inventario completo
    for (const producto of todosProductos) {
      let cantidadAceptada = cantidadesAceptadas[producto.sku] !== undefined
        ? Number(cantidadesAceptadas[producto.sku])
        : producto.cantidadComparada || 0;

      const datosBD = datosProductosMap.get(producto.sku) || {};
      const precioCoste = datosBD.precioCoste || 0;

      inventarioSheet.addRow({
        empresa: nombreEmpresa,
        tipoDocumento: 'AI',
        documentoNumero: '',
        fecha: fechaStr,
        elaborado: req.user?.nombre || 'Admin',
        destino: datosBD.grupoNombre || 'SIN GRUPO',
        nota: `Ajuste de inventario - ${mesActual}`,
        verificado: -1,
        anulado: 0,
        producto: producto.sku,
        descripcion: datosBD.descripcion || producto.descripcion,
        unidadMedida: datosBD.unidadMedida || 'Und.',
        cantidadFisico: cantidadAceptada,
        cantidadSistema: 0,
        iva: 0,
        valorUnitario: precioCoste,
        descuento: 0,
        vencimiento: fechaStr,
        lote: '',
        talla: '',
        color: ''
      });
    }

    // ==================== HOJAS POR GRUPO ====================
    // Agrupar productos por grupo
    const productosPorGrupo = new Map();

    for (const producto of todosProductos) {
      const datosBD = datosProductosMap.get(producto.sku) || {};
      const grupoNombre = datosBD.grupoNombre || 'SIN GRUPO';

      if (!productosPorGrupo.has(grupoNombre)) {
        productosPorGrupo.set(grupoNombre, []);
      }

      productosPorGrupo.get(grupoNombre).push({
        ...producto,
        datosBD
      });
    }

    // Ordenar grupos alfabéticamente
    const gruposOrdenados = Array.from(productosPorGrupo.keys()).sort();

    console.log(`📊 Creando ${gruposOrdenados.length} hojas por grupo`);

    for (const grupoNombre of gruposOrdenados) {
      const productosGrupo = productosPorGrupo.get(grupoNombre);
      // Limpiar nombre de la hoja (máximo 31 caracteres para Excel)
      let sheetName = grupoNombre.substring(0, 31);
      // Reemplazar caracteres no permitidos
      sheetName = sheetName.replace(/[\\/*?:\[\]]/g, '');

      const grupoSheet = workbook.addWorksheet(`🏷️ ${sheetName}`);

      grupoSheet.columns = [
        { header: 'SKU', key: 'sku', width: 20 },
        { header: 'Descripción', key: 'descripcion', width: 60 },
        { header: 'Cantidad Base', key: 'cantidadBase', width: 15 },
        { header: 'Cantidad Comparada', key: 'cantidadComparada', width: 15 },
        { header: 'Cantidad Aceptada', key: 'cantidadAceptada', width: 15 },
        { header: 'Diferencia', key: 'diferencia', width: 15 },
        { header: 'Valor Unitario', key: 'valorUnitario', width: 15 },
        { header: 'Subtotal', key: 'subtotal', width: 15 },
        { header: 'Estado', key: 'estado', width: 15 }
      ];

      grupoSheet.getRow(1).font = { bold: true };
      grupoSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563eb' }
      };
      grupoSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

      let subtotalGrupo = 0;
      let unidadesGrupo = 0;

      for (const producto of productosGrupo) {
        const cantidadAceptada = cantidadesAceptadas[producto.sku] !== undefined
          ? Number(cantidadesAceptadas[producto.sku])
          : producto.cantidadComparada || 0;

        const diferencia = cantidadAceptada - producto.cantidadBase;
        const precioCoste = producto.datosBD.precioCoste || 0;
        const subtotal = cantidadAceptada * precioCoste;

        subtotalGrupo += subtotal;
        unidadesGrupo += cantidadAceptada;

        const estado = diferencia === 0 ? '✅ Coincide' : diferencia > 0 ? '➕ Exceso' : '➖ Falta';

        grupoSheet.addRow({
          sku: producto.sku,
          descripcion: producto.datosBD.descripcion || producto.descripcion,
          cantidadBase: producto.cantidadBase,
          cantidadComparada: producto.cantidadComparada,
          cantidadAceptada: cantidadAceptada,
          diferencia: diferencia,
          valorUnitario: precioCoste,
          subtotal: subtotal,
          estado: estado
        });
      }

      // Agregar fila de resumen
      grupoSheet.addRow({});
      grupoSheet.addRow({
        sku: '📊 RESUMEN DEL GRUPO',
        descripcion: '',
        cantidadBase: '',
        cantidadComparada: '',
        cantidadAceptada: unidadesGrupo,
        diferencia: '',
        valorUnitario: '',
        subtotal: subtotalGrupo,
        estado: ''
      });

      // Estilo para la fila de resumen
      const lastRow = grupoSheet.lastRow;
      lastRow.font = { bold: true };
      lastRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6F7FF' }
      };
    }

    // ==================== HOJA: DETALLE DE DIFERENCIAS ====================
    const diferenciasSheet = workbook.addWorksheet('⚠️ DETALLE DIFERENCIAS');
    diferenciasSheet.columns = [
      { header: 'SKU', key: 'sku', width: 20 },
      { header: 'Descripción', key: 'descripcion', width: 60 },
      { header: 'Grupo', key: 'grupo', width: 25 },
      { header: 'Cantidad Base', key: 'cantidadBase', width: 15 },
      { header: 'Cantidad Comparada', key: 'cantidadComparada', width: 15 },
      { header: 'Cantidad Aceptada', key: 'cantidadAceptada', width: 15 },
      { header: 'Diferencia', key: 'diferencia', width: 15 },
      { header: 'Valor Unitario', key: 'valorUnitario', width: 15 },
      { header: 'Subtotal', key: 'subtotal', width: 15 }
    ];

    diferenciasSheet.getRow(1).font = { bold: true };
    diferenciasSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDC2626' }
    };
    diferenciasSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

    for (const diff of data.diferencias) {
      const cantidadAceptada = cantidadesAceptadas[diff.sku] !== undefined
        ? Number(cantidadesAceptadas[diff.sku])
        : diff.cantidadComparada;
      const datosBD = datosProductosMap.get(diff.sku) || {};
      const precioCoste = datosBD.precioCoste || 0;

      diferenciasSheet.addRow({
        sku: diff.sku,
        descripcion: datosBD.descripcion || diff.descripcion,
        grupo: datosBD.grupoNombre || 'SIN GRUPO',
        cantidadBase: diff.cantidadBase,
        cantidadComparada: diff.cantidadComparada,
        cantidadAceptada: cantidadAceptada,
        diferencia: cantidadAceptada - diff.cantidadBase,
        valorUnitario: precioCoste,
        subtotal: cantidadAceptada * precioCoste
      });
    }

    // Congelar paneles en todas las hojas
    workbook.eachSheet((sheet) => {
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    });

    const filename = `inventario_diferencias_${value.inventarioBaseId}_vs_${value.inventarioComparadoId}_${fechaStr}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    await workbook.xlsx.write(res);
    res.end();

    console.log(`✅ Excel generado: ${gruposOrdenados.length} grupos, ${totalRegistros} productos, ${totalUnidades} unidades`);

  } catch (error) {
    console.error('❌ Error en exportarComparacionExcel:', error);
    if (error.status) {
      return res.status(error.status).json({
        ok: false,
        message: error.message
      });
    }
    next(error);
  }
}


async function generarReconteoDesdeComparacion(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    console.log('\n====== DEBUG generarReconteoDesdeComparacion BODY ======');
    console.log('Body recibido:', req.body);
    console.log('inventarioBaseId:', req.body.inventarioBaseId);
    console.log('inventarioComparadoId:', req.body.inventarioComparadoId);
    console.log('zonaBaseId:', req.body.zonaBaseId);
    console.log('zonaComparadaId:', req.body.zonaComparadaId);
    console.log('======================================================\n');
    console.log('🚨🚨🚨 ENDPOINT /diferencias/reconteo - FUNCIÓN COMPARADO ACTIVA 🚨🚨🚨');

    console.log('\n====== DEBUG generarReconteoDesdeComparacion BODY ======');
    console.log('Body recibido:', req.body);
    const {
      inventarioBaseId,
      inventarioComparadoId,
      zonaBaseId,
      zonaComparadaId
    } = req.body;

    const inventarioBaseIdNum = Number(inventarioBaseId);
    const inventarioComparadoIdNum = Number(inventarioComparadoId);
    const zonaBaseIdNum = zonaBaseId ? Number(zonaBaseId) : null;
    const zonaComparadaIdNum = zonaComparadaId ? Number(zonaComparadaId) : null;

    console.log('🔥 generarReconteoDesdeComparacion - Parámetros:', {
      inventarioBaseId: inventarioBaseIdNum,
      inventarioComparadoId: inventarioComparadoIdNum,
      zonaBaseId: zonaBaseIdNum,
      zonaComparadaId: zonaComparadaIdNum
    });

    if (!inventarioBaseIdNum || !inventarioComparadoIdNum) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'Se requiere inventarioBaseId y inventarioComparadoId'
      });
    }

    if (inventarioBaseIdNum === inventarioComparadoIdNum) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'El inventario base y el inventario comparado deben ser distintos'
      });
    }

    if (!zonaBaseIdNum || !zonaComparadaIdNum) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'Para generar reconteo debes enviar zonaBaseId y zonaComparadaId.'
      });
    }

    const [zonaBase, zonaComparada] = await Promise.all([
      Zona.findByPk(zonaBaseIdNum, {
        attributes: ['id', 'nombre', 'codigo'],
        transaction
      }),
      Zona.findByPk(zonaComparadaIdNum, {
        attributes: ['id', 'nombre', 'codigo'],
        transaction
      })
    ]);

    if (!zonaBase || !zonaComparada) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Una de las zonas seleccionadas no existe'
      });
    }

    if (!areEquivalentZones(zonaBase, zonaComparada)) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: `No se puede generar reconteo entre la zona "${zonaBase.nombre}" y "${zonaComparada.nombre}" porque no son equivalentes.`
      });
    }

    /*
      IMPORTANTE:
      - Inventario base = referencia.
      - Inventario comparado = inventario donde se debe hacer el reconteo.
      Por eso la ronda nueva y las discrepancias se crean en:
      inventarioComparadoId + zonaComparadaId.
    */
    const inventarioReferenciaId = inventarioBaseIdNum;
    const zonaReferenciaId = zonaBaseIdNum;

    const inventarioObjetivoId = inventarioComparadoIdNum;
    const zonaObjetivoId = zonaComparadaIdNum;

    const allowedGroupIds = await getAllowedGroupIds(req);

    const comparisonRows = await getSkuComparisonRows(
      inventarioReferenciaId,
      inventarioObjetivoId,
      allowedGroupIds,
      zonaReferenciaId,
      zonaObjetivoId
    );

    const diferencias = comparisonRows.filter((row) => Number(row.diferencia || 0) !== 0);

    console.log(`📊 Diferencias encontradas: ${diferencias.length}`);

    if (diferencias.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'No se generó reconteo porque la comparación no encontró diferencias para las zonas enviadas.',
        debug: {
          inventarioBaseId: inventarioReferenciaId,
          inventarioComparadoId: inventarioObjetivoId,
          zonaBaseId: zonaReferenciaId,
          zonaComparadaId: zonaObjetivoId,
          totalComparados: comparisonRows.length
        }
      });
    }

    // Última ronda completa del inventario BASE, usada como referencia.
    const ultimaRondaReferenciaCompleta = await RondaConteo.findOne({
      where: {
        inventarioId: inventarioReferenciaId,
        zonaId: zonaReferenciaId,
        tipoRonda: 'completa',
        estado: 'cerrada'
      },
      order: [['numeroRonda', 'DESC']],
      transaction
    });

    if (!ultimaRondaReferenciaCompleta) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: `No existe una ronda completa cerrada para el inventario base en la zona ${zonaBase.nombre}.`
      });
    }

    // Última ronda completa del inventario COMPARADO, desde donde nace el reconteo.
    const ultimaRondaObjetivoCompleta = await RondaConteo.findOne({
      where: {
        inventarioId: inventarioObjetivoId,
        zonaId: zonaObjetivoId,
        tipoRonda: 'completa',
        estado: 'cerrada'
      },
      order: [['numeroRonda', 'DESC']],
      transaction
    });

    if (!ultimaRondaObjetivoCompleta) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: `No existe una ronda completa cerrada para el inventario comparado en la zona ${zonaComparada.nombre}.`
      });
    }

    const ultimaRondaObjetivo = await RondaConteo.findOne({
      where: {
        inventarioId: inventarioObjetivoId,
        zonaId: zonaObjetivoId
      },
      order: [['numeroRonda', 'DESC']],
      transaction
    });

    const nuevoNumeroRonda = Number(ultimaRondaObjetivo?.numeroRonda || 0) + 1;

    const nuevaRonda = await RondaConteo.create(
      {
        inventarioId: inventarioObjetivoId,
        zonaId: zonaObjetivoId,
        numeroRonda: nuevoNumeroRonda,
        tipoRonda: 'reconteo',
        estado: 'activa',
        generadaDesdeRondaId: ultimaRondaObjetivoCompleta.id,
        observaciones: `Generada automáticamente desde comparación ${inventarioReferenciaId} vs ${inventarioObjetivoId}`
      },
      { transaction }
    );

    console.log(
      `✅ Ronda de reconteo creada: ID ${nuevaRonda.id}, Número ${nuevoNumeroRonda}, Inventario ${inventarioObjetivoId}, Zona ${zonaObjetivoId}`
    );

    /*
  Crear asignación de ronda para que EscaneoPage tenga grupo asignado.

  IMPORTANTE:
  La tabla/modelo Grupo no tiene zonaId.
  Por eso buscamos primero en AsignacionConteo por inventarioId + zonaId,
  y desde ahí obtenemos el grupoId.
*/
    const {
      Grupo,
      AsignacionRonda,
      AsignacionConteo
    } = require('../models');

    const asignacionConteoObjetivo = await AsignacionConteo.findOne({
      where: {
        inventarioId: inventarioObjetivoId,
        zonaId: zonaObjetivoId
      },
      order: [
        ['conteoTipo', 'ASC'],
        ['id', 'ASC']
      ],
      transaction
    });

    if (!asignacionConteoObjetivo?.grupoId) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: `No se encontró una asignación de conteo para el inventario comparado ${inventarioObjetivoId} en la zona ${zonaComparada.nombre}.`
      });
    }

    const grupoObjetivo = await Grupo.findByPk(asignacionConteoObjetivo.grupoId, {
      transaction
    });

    if (!grupoObjetivo) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: `La asignación de conteo apunta al grupo ${asignacionConteoObjetivo.grupoId}, pero ese grupo no existe.`
      });
    }

    await AsignacionRonda.findOrCreate({
      where: {
        rondaId: nuevaRonda.id
      },
      defaults: {
        rondaId: nuevaRonda.id,
        grupoId: grupoObjetivo.id,
        estado: 'asignada'
      },
      transaction
    });

    let creadas = 0;
    let actualizadas = 0;

    for (const diferencia of diferencias) {
      const payloadDiscrepancia = {
        productoId: diferencia.productoId || null,
        descripcionSnapshot: diferencia.descripcion || 'Sin descripción',

        // Referencia esperada desde inventario base.
        cantidadBase: Number(diferencia.cantidadBase || 0),

        // Cantidad previa en el inventario comparado.
        cantidadUltima: Number(diferencia.cantidadComparada || 0),

        // Diferencia original: comparado - base.
        diferencia: Number(diferencia.diferencia || 0),

        estado: 'pendiente_reconteo',

        // Ronda base/referencia y última ronda del inventario objetivo.
        rondaBaseId: ultimaRondaReferenciaCompleta.id,
        ultimaRondaId: ultimaRondaObjetivoCompleta.id,

        rondaReconteoId: nuevaRonda.id,
        proximaRondaNumero: nuevoNumeroRonda,

        cantidadFinal: null,
        criterioCierre: null,
        cerradoEn: null,
        cantidadRecontada: 0,
        reconteoCount: 0
      };

      const existente = await DiscrepanciaConteo.findOne({
        where: {
          inventarioId: inventarioObjetivoId,
          zonaId: zonaObjetivoId,
          sku: diferencia.sku
        },
        transaction
      });

      if (existente) {
        await existente.update(payloadDiscrepancia, { transaction });
        actualizadas += 1;
        console.log(`🔄 Actualizada discrepancia para SKU: ${diferencia.sku}`);
      } else {
        await DiscrepanciaConteo.create(
          {
            inventarioId: inventarioObjetivoId,
            zonaId: zonaObjetivoId,
            sku: diferencia.sku,
            ...payloadDiscrepancia
          },
          { transaction }
        );

        creadas += 1;
        console.log(`✅ Creada discrepancia para SKU: ${diferencia.sku}`);
      }
    }

    console.log(`📊 Resumen: ${creadas} creadas, ${actualizadas} actualizadas`);

    let pareja = null;

    try {
      pareja = await parejaService.crearOPareja(
        inventarioReferenciaId,
        inventarioObjetivoId,
        zonaReferenciaId
      );

      if (pareja) {
        await pareja.update(
          {
            estado: 'en_reconteo',
            rondasReconteoGeneradas: Number(pareja.rondasReconteoGeneradas || 0) + 1,
            fechaComparacion: new Date(),
            fechaCompletada: null
          },
          { transaction }
        );
      }
    } catch (parejaError) {
      console.error('⚠️ No se pudo actualizar la pareja, pero el reconteo continuará:', parejaError.message);
    }

    await transaction.commit();

    return res.json({
      ok: true,
      message: `Ronda de reconteo generada exitosamente en el inventario comparado con ${diferencias.length} SKUs pendientes`,
      data: {
        ronda: {
          id: nuevaRonda.id,
          numeroRonda: nuevaRonda.numeroRonda,
          tipoRonda: nuevaRonda.tipoRonda,
          estado: nuevaRonda.estado,
          inventarioId: nuevaRonda.inventarioId,
          zonaId: nuevaRonda.zonaId
        },
        inventarioObjetivoId,
        zonaObjetivoId,
        inventarioBaseId: inventarioReferenciaId,
        inventarioComparadoId: inventarioObjetivoId,
        zonaBaseId: zonaReferenciaId,
        zonaComparadaId: zonaObjetivoId,
        grupoId: grupoObjetivo.id,
        totalDiferencias: diferencias.length,
        discrepanciasCreadas: creadas,
        discrepanciasActualizadas: actualizadas,
        pareja: pareja
          ? {
            id: pareja.id,
            estado: pareja.estado,
            rondasGeneradas: pareja.rondasReconteoGeneradas
          }
          : null
      }
    });

    return res.json({
      ok: true,
      message: `Ronda de reconteo generada exitosamente en el inventario comparado con ${diferencias.length} SKUs pendientes`,
      data: {
        ronda: {
          id: nuevaRonda.id,
          numeroRonda: nuevaRonda.numeroRonda,
          tipoRonda: nuevaRonda.tipoRonda,
          estado: nuevaRonda.estado,
          inventarioId: nuevaRonda.inventarioId,
          zonaId: nuevaRonda.zonaId
        },
        inventarioObjetivoId,
        zonaObjetivoId,
        inventarioBaseId: inventarioReferenciaId,
        inventarioComparadoId: inventarioObjetivoId,
        zonaBaseId: zonaReferenciaId,
        zonaComparadaId: zonaObjetivoId,
        grupoId: grupoObjetivo.id,
        totalDiferencias: diferencias.length,
        discrepanciasCreadas: creadas,
        discrepanciasActualizadas: actualizadas,
        pareja: pareja
          ? {
            id: pareja.id,
            estado: pareja.estado,
            rondasGeneradas: pareja.rondasReconteoGeneradas
          }
          : null
      }
    });
  } catch (error) {
    try {
      if (!transaction.finished) {
        await transaction.rollback();
      }
    } catch (rollbackError) {
      console.error(
        '❌ Error haciendo rollback en generarReconteoDesdeComparacion:',
        rollbackError
      );
    }

    console.error('❌ Error en generarReconteoDesdeComparacion:', error);
    next(error);
  }
}

async function completarPareja(req, res, next) {
  try {
    const { parejaId } = req.params;

    const pareja = await ParejaInventario.findByPk(parejaId);

    if (!pareja) {
      return res.status(404).json({
        ok: false,
        message: 'Pareja de inventarios no encontrada'
      });
    }

    const discrepanciasPendientes = await DiscrepanciaConteo.count({
      where: {
        inventarioId: pareja.inventarioBaseId,
        zonaId: pareja.zonaId || null,
        estado: {
          [Op.in]: ['pendiente_reconteo', 'reconteo_en_proceso', 'pendiente']
        }
      }
    });

    if (discrepanciasPendientes > 0) {
      return res.status(400).json({
        ok: false,
        message: `No se puede completar la pareja. Aún hay ${discrepanciasPendientes} discrepancias pendientes.`
      });
    }

    await pareja.update({
      estado: 'completada',
      fechaCompletada: new Date()
    });

    res.json({
      ok: true,
      message: 'Pareja de inventarios marcada como completada',
      data: pareja
    });
  } catch (error) {
    next(error);
  }
}

async function obtenerDatosProductosDesdeSQLServer(skusUnicos) {
  if (!skusUnicos || skusUnicos.length === 0) return new Map();

  try {
    const { getSqlServerPool } = require('../config/sqlserver');

    if (process.env.SQLSERVER_ENABLED !== 'true') {
      console.log('⚠️ SQL Server deshabilitado, usando datos por defecto');
      return new Map();
    }

    const sqlPool = await getSqlServerPool();

    const skusList = skusUnicos.map(s => `'${s.replace(/'/g, "''")}'`).join(',');

    const query = `
      SELECT 
        i.[CódigoInventario] as sku,
        i.[Descripción] as descripcion,
        i.UnidadDeMedida,
        i.IdGrupoInventarioDos,
        g.Descripcion as grupoNombre,
        ISNULL((
          SELECT TOP 1 c.CostoPromedio 
          FROM CCA_M_Inventarios c 
          WHERE c.IdInventario = i.IdInventario 
            AND c.CostoPromedio > 0
          ORDER BY c.IdAsientoContable DESC
        ), 0) as valorUnitario,
        ISNULL((
          SELECT TOP 1 c.IdLote
          FROM CCA_M_Inventarios c 
          WHERE c.IdInventario = i.IdInventario 
          ORDER BY c.IdAsientoContable DESC
        ), '') as lote,
        ISNULL((
          SELECT TOP 1 c.Vencimiento
          FROM CCA_M_Inventarios c 
          WHERE c.IdInventario = i.IdInventario 
          ORDER BY c.IdAsientoContable DESC
        ), NULL) as vencimiento
      FROM Inventarios i
      LEFT JOIN [Inventarios - AgrupaciónDos] g ON g.IdGrupoInventarioDos = i.IdGrupoInventarioDos
      WHERE i.[CódigoInventario] IN (${skusList})
        AND i.Activo = -1
    `;

    console.log('📊 Consultando SQL Server para', skusUnicos.length, 'SKUs');
    const result = await sqlPool.request().query(query);

    const productosMap = new Map();
    for (const row of result.recordset) {
      productosMap.set(row.sku, {
        descripcion: row.descripcion || 'Sin descripción',
        unidadMedida: row.UnidadDeMedida || 'Und.',
        grupoNombre: row.grupoNombre || 'SIN GRUPO',
        valorUnitario: parseFloat(row.valorUnitario) || 0,
        lote: row.lote || '',
        vencimiento: row.vencimiento
      });
    }

    console.log(`✅ Datos SQL Server obtenidos: ${productosMap.size} productos`);
    return productosMap;

  } catch (error) {
    console.error('❌ Error consultando SQL Server:', error.message);
    return new Map();
  }
}

module.exports = {
  compareInventarios,
  exportarComparacionExcel,
  generarReconteoDesdeComparacion,
  completarPareja,
  obtenerDatosProductosDesdeSQLServer
};