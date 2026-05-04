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

  const baseRows = await sequelize.query(
    `
    WITH ultima_ronda_por_sku AS (
      SELECT DISTINCT ON (l.sku)
        l.sku,
        l."rondaId"
      FROM lecturas l
      LEFT JOIN rondas_conteo r ON r.id = l."rondaId"
      WHERE l."inventarioId" = :inventarioBaseId
        AND l.estado = 'valida'
        AND l.sku IS NOT NULL
        ${zonaBaseId ? 'AND l."zonaId" = :zonaBaseId' : ''}
        ${filterBase}
      ORDER BY l.sku, r."createdAt" DESC NULLS LAST
    )
    SELECT
      ur.sku,
      MAX(l."descripcionSnapshot") AS descripcion,
      COALESCE(SUM(l.cantidad), 0)::int AS cantidad
    FROM ultima_ronda_por_sku ur
    JOIN lecturas l ON l."rondaId" = ur."rondaId" AND l.sku = ur.sku
    WHERE l.estado = 'valida'
    GROUP BY ur.sku
    ORDER BY ur.sku ASC
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

  const comparadoRows = await sequelize.query(
    `
    WITH ultima_ronda_por_sku AS (
      SELECT DISTINCT ON (l.sku)
        l.sku,
        l."rondaId"
      FROM lecturas l
      LEFT JOIN rondas_conteo r ON r.id = l."rondaId"
      WHERE l."inventarioId" = :inventarioComparadoId
        AND l.estado = 'valida'
        AND l.sku IS NOT NULL
        ${zonaComparadaId ? 'AND l."zonaId" = :zonaComparadaId' : ''}
        ${filterComparado}
      ORDER BY l.sku, r."createdAt" DESC NULLS LAST
    )
    SELECT
      ur.sku,
      MAX(l."descripcionSnapshot") AS descripcion,
      COALESCE(SUM(l.cantidad), 0)::int AS cantidad
    FROM ultima_ronda_por_sku ur
    JOIN lecturas l ON l."rondaId" = ur."rondaId" AND l.sku = ur.sku
    WHERE l.estado = 'valida'
    GROUP BY ur.sku
    ORDER BY ur.sku ASC
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

    // Obtener cantidades aceptadas (del body si es POST, o del query si es GET)
    let cantidadesAceptadas = {};
    
    if (req.method === 'POST') {
      // Para POST, obtener del body
      cantidadesAceptadas = req.body.cantidadesAceptadas || {};
      console.log('📦 Obteniendo cantidades del BODY (POST)');
    } else {
      // Para GET, obtener del query
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

    // Si cantidadesAceptadas viene como string, parsearlo
    if (typeof cantidadesAceptadas === 'string') {
      try {
        cantidadesAceptadas = JSON.parse(cantidadesAceptadas);
      } catch (e) {
        console.error('Error parsing cantidadesAceptadas string:', e.message);
        cantidadesAceptadas = {};
      }
    }

    console.log(`📦 Cantidades aceptadas: ${Object.keys(cantidadesAceptadas).length} SKUs`);
    if (Object.keys(cantidadesAceptadas).length > 0) {
      console.log('📦 Ejemplo de cantidades:', Object.entries(cantidadesAceptadas).slice(0, 5));
    }

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

    // ==================== HOJA 1: INVENTARIO ====================
    const inventarioSheet = workbook.addWorksheet('INVENTARIO');

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

    const fechaActual = new Date();
    const fechaStr = fechaActual.toISOString().slice(0, 10);
    const mesActual = fechaActual.toLocaleString('es', { month: 'long' });
    const nombreEmpresa = 'TECNOCOMPUTER MELISSA SANDOVAL';
    let totalRegistros = 0;
    let totalUnidades = 0;
    let valorTotalInventario = 0;

    const todosProductos = data.comparacion || [];

    console.log(`📊 Procesando ${todosProductos.length} productos con cantidades aceptadas`);

    for (const producto of todosProductos) {
      let cantidadAceptada;
      
      if (cantidadesAceptadas[producto.sku] !== undefined && cantidadesAceptadas[producto.sku] !== null) {
        cantidadAceptada = Number(cantidadesAceptadas[producto.sku]);
      } else {
        cantidadAceptada = producto.cantidadComparada || 0;
      }

      const datosBD = datosProductosMap.get(producto.sku) || {};

      const descripcion = datosBD.descripcion || producto.descripcion || 'Sin descripción';
      const unidadMedida = datosBD.unidadMedida || 'Und.';
      const destino = datosBD.grupoNombre || 'SIN GRUPO';
      const precioCoste = datosBD.precioCoste || 0;

      totalRegistros++;
      totalUnidades += cantidadAceptada;
      valorTotalInventario += cantidadAceptada * precioCoste;

      inventarioSheet.addRow({
        empresa: nombreEmpresa,
        tipoDocumento: 'AI',
        documentoNumero: '',
        fecha: fechaStr,
        elaborado: req.user?.nombre || 'Admin',
        destino: destino,
        nota: `Ajuste de inventario - ${mesActual}`,
        verificado: -1,
        anulado: 0,
        producto: producto.sku,
        descripcion: descripcion,
        unidadMedida: unidadMedida,
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

    // ==================== HOJA 2: RESUMEN GENERAL ====================
    const resumenSheet = workbook.addWorksheet('RESUMEN GENERAL');
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

    // ==================== HOJA 3: DETALLE DE DIFERENCIAS ====================
    const diferenciasSheet = workbook.addWorksheet('DETALLE DE DIFERENCIAS');
    diferenciasSheet.columns = [
      { header: 'SKU', key: 'sku', width: 20 },
      { header: 'Descripción', key: 'descripcion', width: 60 },
      { header: 'Cantidad Base', key: 'cantidadBase', width: 15 },
      { header: 'Cantidad Comparada', key: 'cantidadComparada', width: 15 },
      { header: 'Cantidad Aceptada', key: 'cantidadAceptada', width: 15 },
      { header: 'Diferencia', key: 'diferencia', width: 15 },
      { header: 'Valor Unitario', key: 'valorUnitario', width: 15 },
      { header: 'Subtotal', key: 'subtotal', width: 15 },
      { header: 'Grupo', key: 'grupo', width: 25 }
    ];

    diferenciasSheet.getRow(1).font = { bold: true };
    diferenciasSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563eb' }
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
        cantidadBase: diff.cantidadBase,
        cantidadComparada: diff.cantidadComparada,
        cantidadAceptada: cantidadAceptada,
        diferencia: cantidadAceptada - diff.cantidadBase,
        valorUnitario: precioCoste,
        subtotal: cantidadAceptada * precioCoste,
        grupo: datosBD.grupoNombre || 'SIN GRUPO'
      });
    }

    // ==================== HOJA 4: RESULTADOS POR GRUPO ====================
    const gruposSheet = workbook.addWorksheet('RESULTADOS POR GRUPO');
    gruposSheet.columns = [
      { header: 'Grupo', key: 'grupo', width: 25 },
      { header: 'Inventario', key: 'inventario', width: 20 },
      { header: 'Zona', key: 'zona', width: 25 },
      { header: 'Total Escaneos', key: 'totalEscaneos', width: 15 },
      { header: 'Productos Únicos', key: 'productosUnicos', width: 15 }
    ];

    gruposSheet.getRow(1).font = { bold: true };
    gruposSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563eb' }
    };
    gruposSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

    for (const grupo of data.totales.base.grupos) {
      gruposSheet.addRow({
        grupo: grupo.nombre,
        inventario: 'BASE',
        zona: grupo.zona || 'N/A',
        totalEscaneos: grupo.totalEscaneos,
        productosUnicos: grupo.productosUnicos
      });
    }

    gruposSheet.addRow({ grupo: '', inventario: '', zona: '', totalEscaneos: '', productosUnicos: '' });

    for (const grupo of data.totales.comparado.grupos) {
      gruposSheet.addRow({
        grupo: grupo.nombre,
        inventario: 'COMPARADO',
        zona: grupo.zona || 'N/A',
        totalEscaneos: grupo.totalEscaneos,
        productosUnicos: grupo.productosUnicos
      });
    }

    workbook.eachSheet((sheet) => {
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    });

    const filename = `inventario_diferencias_${value.inventarioBaseId}_vs_${value.inventarioComparadoId}_${fechaStr}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    await workbook.xlsx.write(res);
    res.end();

    console.log(`✅ Excel generado: ${totalRegistros} registros, ${totalUnidades} unidades, $${valorTotalInventario.toLocaleString()}`);

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
  console.log('🔥 FUNCIÓN LLAMADA: generarReconteoDesdeComparacion 🔥');
  console.log('Body recibido:', JSON.stringify(req.body, null, 2));

  try {
    const { inventarioBaseId, inventarioComparadoId, zonaId } = req.body;
    console.log('📦 Parámetros:', { inventarioBaseId, inventarioComparadoId, zonaId });

    if (!inventarioBaseId || !inventarioComparadoId) {
      return res.status(400).json({
        ok: false,
        message: 'Se requiere inventarioBaseId y inventarioComparadoId'
      });
    }

    const [inventarioBase, inventarioComparado] = await Promise.all([
      Inventario.findByPk(inventarioBaseId),
      Inventario.findByPk(inventarioComparadoId)
    ]);

    if (!inventarioBase || !inventarioComparado) {
      return res.status(404).json({
        ok: false,
        message: 'Uno de los inventarios no existe'
      });
    }

    const allowedGroupIds = await getAllowedGroupIds(req);

    const comparisonRows = await getSkuComparisonRows(
      inventarioBaseId,
      inventarioComparadoId,
      allowedGroupIds,
      zonaId || null,
      zonaId || null
    );

    const diferencias = comparisonRows.filter(row => row.estado === 'difiere');

    if (diferencias.length === 0) {
      return res.status(400).json({
        ok: false,
        message: 'No hay diferencias entre los inventarios para generar un reconteo'
      });
    }

    const zona = zonaId ? await Zona.findByPk(zonaId) : null;

    const lastRonda = await RondaConteo.findOne({
      where: {
        inventarioId: inventarioBaseId,
        zonaId: zonaId || null
      },
      order: [['numeroRonda', 'DESC']],
      attributes: ['numeroRonda', 'id']
    });

    const nextRondaNumero = (lastRonda?.numeroRonda || 0) + 1;

    const nuevaRonda = await RondaConteo.create({
      inventarioId: inventarioBaseId,
      zonaId: zonaId || null,
      numeroRonda: nextRondaNumero,
      tipoRonda: 'reconteo',
      estado: 'borrador'
    });

    for (const diferencia of diferencias) {
      await DiscrepanciaConteo.create({
        inventarioId: inventarioBaseId,
        sku: diferencia.sku,
        zonaId: zonaId || null,
        cantidadBase: diferencia.cantidadBase,
        cantidadUltima: diferencia.cantidadComparada,
        diferencia: diferencia.diferencia,
        estado: 'pendiente_reconteo',
        rondaReconteoId: nuevaRonda.id,
        rondaBaseId: lastRonda?.id || 1,
        reconteoCount: 0,
        descripcionSnapshot: diferencia.descripcion || 'Sin descripción'
      });
      console.log(`  ✓ Discrepancia para SKU: ${diferencia.sku}`);
    }

    const [pareja, created] = await ParejaInventario.findOrCreate({
      where: {
        inventarioBaseId: inventarioBaseId,
        inventarioComparadoId: inventarioComparadoId,
        zonaId: zonaId || null
      },
      defaults: {
        inventarioBaseId: inventarioBaseId,
        inventarioComparadoId: inventarioComparadoId,
        zonaId: zonaId || null,
        estado: 'en_reconteo',
        fechaComparacion: new Date(),
        rondasReconteoGeneradas: 1
      }
    });

    if (!created) {
      await pareja.update({
        estado: 'en_reconteo',
        rondasReconteoGeneradas: (pareja.rondasReconteoGeneradas || 0) + 1,
        fechaComparacion: new Date(),
        fechaCompletada: null
      });
    }

    res.json({
      ok: true,
      message: `Ronda de reconteo generada exitosamente con ${diferencias.length} SKUs para corregir`,
      data: {
        ronda: nuevaRonda,
        inventarioObjetivoId: inventarioBaseId,
        totalDiferencias: diferencias.length,
        pareja: {
          id: pareja.id,
          estado: pareja.estado,
          rondasGeneradas: pareja.rondasReconteoGeneradas
        }
      }
    });
  } catch (error) {
    console.error('Error en generarReconteoDesdeComparacion:', error);
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