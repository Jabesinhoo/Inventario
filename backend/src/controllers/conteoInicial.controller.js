const Joi = require('joi');
const {
  sequelize,
  Inventario,
  Zona,
  ConteoInicialDetalle,
  Op
} = require('../models');
const { parseConteoInicialExcel } = require('../utils/conteoInicialExcel');

const querySchema = Joi.object({
  inventarioId: Joi.number().integer().required()
});

function normalizarZonaEntrada(zonaTexto) {
  const valor = String(zonaTexto || '').trim().toUpperCase();

  if (valor === 'BODEGA' || valor === 'BOD' || valor === 'BODEGA PRINCIPAL') {
    return {
      nombre: 'Bodega Principal',
      codigo: 'BOD'
    };
  }

  if (
    valor === 'EXHIBICION' ||
    valor === 'EXHIBICIÓN' ||
    valor === 'EXH' ||
    valor === 'EXHIBICION PRINCIPAL'
  ) {
    return {
      nombre: 'Exhibición',
      codigo: 'EXH'
    };
  }

  return {
    nombre: zonaTexto,
    codigo: valor.slice(0, 10) || 'GEN'
  };
}

async function importConteoInicialExcel(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const { error, value } = querySchema.validate(req.body);

    if (error) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    if (!req.file) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'Debes subir un archivo Excel .xlsx'
      });
    }

    const inventario = await Inventario.findByPk(value.inventarioId, { transaction });
    if (!inventario) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Inventario no encontrado'
      });
    }

    const { rows, errors } = await parseConteoInicialExcel(req.file.buffer);

    console.log('[IMPORT] Filas procesadas:', rows.length);
    console.log('[IMPORT] Errores:', errors.length);

    let insertados = 0;
    let actualizados = 0;
    const noResueltos = [];

    // En la función importConteoInicialExcel, reemplaza el bucle for:

    // En la función importConteoInicialExcel, reemplaza el bucle:

    for (const item of rows) {
      try {
        // Buscar o crear la zona BODEGA y EXHIBICION
        let zonaBodega = await Zona.findOne({ where: { codigo: 'BOD' }, transaction });
        if (!zonaBodega) {
          zonaBodega = await Zona.create({ nombre: 'Bodega Principal', codigo: 'BOD', activa: true }, { transaction });
        }

        let zonaExhibicion = await Zona.findOne({ where: { codigo: 'EXH' }, transaction });
        if (!zonaExhibicion) {
          zonaExhibicion = await Zona.create({ nombre: 'Exhibición', codigo: 'EXH', activa: true }, { transaction });
        }

        let descripcionCorta = item.descripcion || 'Sin descripción';
        if (descripcionCorta.length > 250) {
          descripcionCorta = descripcionCorta.substring(0, 247) + '...';
        }

        const sku = String(item.sku).trim();

        // Guardar en BODEGA
        if (item.cantidadBodega > 0) {
          await ConteoInicialDetalle.upsert({
            inventarioId: value.inventarioId,
            zonaId: zonaBodega.id,
            sku,
            descripcionSnapshot: descripcionCorta,
            cantidadBodega: item.cantidadBodega,
            cantidadExhibicion: 0,
            cantidadTotal: item.cantidadBodega,
            origenArchivo: req.file.originalname
          }, { transaction });
        }

        // Guardar en EXHIBICION
        if (item.cantidadExhibicion > 0) {
          await ConteoInicialDetalle.upsert({
            inventarioId: value.inventarioId,
            zonaId: zonaExhibicion.id,
            sku,
            descripcionSnapshot: descripcionCorta,
            cantidadBodega: 0,
            cantidadExhibicion: item.cantidadExhibicion,
            cantidadTotal: item.cantidadExhibicion,
            origenArchivo: req.file.originalname
          }, { transaction });
        }

        insertados++;
      } catch (err) {
        console.error(`[IMPORT] Error con SKU ${item.sku}:`, err.message);
        noResueltos.push({ sku: item.sku, message: err.message });
      }
    }
    await transaction.commit();

    res.json({
      ok: true,
      message: 'Conteo inicial importado correctamente',
      data: {
        totalLeidos: rows.length,
        insertados,
        actualizados,
        erroresFilas: errors,
        noResueltos
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('[IMPORT] Error:', error);
    next(error);
  }
}

async function getConteoInicialResumen(req, res, next) {
  try {
    const { inventarioId } = req.query;

    if (!inventarioId) {
      return res.status(400).json({
        ok: false,
        message: 'inventarioId es requerido'
      });
    }

    const data = await ConteoInicialDetalle.findAll({
      where: { inventarioId },
      include: [{ model: Zona, as: 'zona', attributes: ['id', 'nombre', 'codigo'] }],
      order: [['zonaId', 'ASC'], ['sku', 'ASC']]
    });

    const productosMap = new Map();

    for (const item of data) {
      const key = item.sku;

      if (!productosMap.has(key)) {
        productosMap.set(key, {
          sku: item.sku,
          descripcion: item.descripcionSnapshot,
          cantidadBodega: 0,
          cantidadExhibicion: 0,
          total: 0,
          zona: item.zona?.nombre || 'N/A',
          origen: item.origenArchivo || 'Manual'
        });
      }

      const producto = productosMap.get(key);
      const zonaCodigo = item.zona?.codigo;

      if (zonaCodigo === 'BOD') {
        producto.cantidadBodega = item.cantidadTotal;
      } else if (zonaCodigo === 'EXH') {
        producto.cantidadExhibicion = item.cantidadTotal;
      }

      if (
        (!producto.descripcion || producto.descripcion === 'Sin descripción') &&
        item.descripcionSnapshot &&
        item.descripcionSnapshot !== 'Sin descripción'
      ) {
        producto.descripcion = item.descripcionSnapshot;
      }

      producto.total += Number(item.cantidadTotal || 0);
    }

    const resumen = Array.from(productosMap.values());

    res.json({
      ok: true,
      data: resumen
    });
  } catch (error) {
    console.error('[RESUMEN] Error:', error);
    next(error);
  }
}

async function getSqlServerStatus(req, res, next) {
  try {
    const { getSqlServerPool } = require('../config/sqlserver');
    if (process.env.SQLSERVER_ENABLED !== 'true') {
      return res.json({
        ok: true,
        data: {
          connected: false,
          database: null,
          error: 'SQL Server deshabilitado',
          host: null,
          instance: null
        }
      });
    }
    let connected = false;
    let error = null;
    let database = null;

    try {
      const pool = await getSqlServerPool();
      const result = await pool.request().query('SELECT DB_NAME() as dbName');
      connected = true;
      database = result.recordset[0]?.dbName || 'Desconocida';
    } catch (err) {
      error = err.message;
      connected = false;
    }

    res.json({
      ok: true,
      data: {
        connected,
        database,
        error,
        host: process.env.SQLSERVER_HOST,
        instance: process.env.SQLSERVER_INSTANCE
      }
    });
  } catch (error) {
    next(error);
  }
}

async function syncFromSqlServer(req, res, next) {
  try {
    const { inventarioId } = req.body;

    console.log('[SYNC] Iniciando sincronización desde SQL Server...');
    if (process.env.SQLSERVER_ENABLED !== 'true') {
      return res.status(503).json({
        ok: false,
        message: 'La sincronización con SQL Server está deshabilitada'
      });
    }
    if (!inventarioId) {
      return res.status(400).json({
        ok: false,
        message: 'inventarioId es requerido'
      });
    }

    const inventario = await Inventario.findByPk(inventarioId);
    if (!inventario) {
      return res.status(404).json({
        ok: false,
        message: 'Inventario no encontrado'
      });
    }

    const { getSqlServerPool } = require('../config/sqlserver');

    async function executeWithRetry(query, maxRetries = 3) {
      let lastError = null;

      for (let i = 0; i < maxRetries; i++) {
        try {
          const pool = await getSqlServerPool();
          const result = await pool.request().query(query);
          return result;
        } catch (err) {
          lastError = err;
          console.log(`[SYNC] Intento ${i + 1}/${maxRetries} falló: ${err.message}`);
          if (i < maxRetries - 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      }

      throw lastError;
    }

    console.log('[SYNC] Obteniendo productos de Bodega Principal y Exhibición...');

    const productosResult = await executeWithRetry(`
      SELECT 
        i.[CódigoInventario] as sku,
        i.[CodigoBarras] as codigoBarra,
        i.[Descripción] as descripcion,
        i.[Nombre_Generico] as categoria,
        SUM(CASE WHEN c.IdBodegaInventario = 'BOD' THEN c.Cantidad ELSE 0 END) as cantidadBodega,
        SUM(CASE WHEN c.IdBodegaInventario = 'EXH' THEN c.Cantidad ELSE 0 END) as cantidadExhibicion
      FROM [dbo].[Inventarios] i
      INNER JOIN [dbo].[CCA_M_Inventarios] c ON c.IdInventario = i.IdInventario
      WHERE i.[Activo] = -1
        AND c.Cantidad >= 0
        AND c.IdBodegaInventario IN ('BOD', 'EXH')
      GROUP BY 
        i.[CódigoInventario],
        i.[CodigoBarras],
        i.[Descripción],
        i.[Nombre_Generico]
      ORDER BY i.[CódigoInventario]
    `);

    console.log('[SYNC] Productos encontrados:', productosResult.recordset.length);

    const [zonaBodega] = await Zona.findOrCreate({
      where: { codigo: 'BOD' },
      defaults: {
        nombre: 'Bodega Principal',
        codigo: 'BOD',
        activa: true
      }
    });

    const [zonaExhibicion] = await Zona.findOrCreate({
      where: { codigo: 'EXH' },
      defaults: {
        nombre: 'Exhibición',
        codigo: 'EXH',
        activa: true
      }
    });

    let procesados = 0;
    let errores = 0;
    let totalBodega = 0;
    let totalExhibicion = 0;

    await ConteoInicialDetalle.destroy({
      where: {
        inventarioId,
        zonaId: [zonaBodega.id, zonaExhibicion.id]
      }
    });

    for (const row of productosResult.recordset) {
      try {
        const sku = String(row.sku || '').trim();
        const codigoLeido = String(row.codigoBarra || row.sku || '').trim();
        const descripcion = String(row.descripcion || 'Sin descripción').trim();

        const cantidadBodega = Math.round(Number(row.cantidadBodega) || 0);
        const cantidadExhibicion = Math.round(Number(row.cantidadExhibicion) || 0);

        totalBodega += cantidadBodega;
        totalExhibicion += cantidadExhibicion;

        if (cantidadBodega > 0) {
          await ConteoInicialDetalle.create({
            inventarioId,
            zonaId: zonaBodega.id,
            productoId: null,
            sku,
            codigoLeido,
            descripcionSnapshot: descripcion,
            cantidadBodega,
            cantidadExhibicion: 0,
            cantidadTotal: cantidadBodega,
            origenArchivo: 'sqlserver_sync'
          });
        }

        if (cantidadExhibicion > 0) {
          await ConteoInicialDetalle.create({
            inventarioId,
            zonaId: zonaExhibicion.id,
            productoId: null,
            sku,
            codigoLeido,
            descripcionSnapshot: descripcion,
            cantidadBodega: 0,
            cantidadExhibicion,
            cantidadTotal: cantidadExhibicion,
            origenArchivo: 'sqlserver_sync'
          });
        }

        procesados++;

        if (procesados % 100 === 0) {
          console.log(`[SYNC] Procesados ${procesados}/${productosResult.recordset.length} productos...`);
        }
      } catch (err) {
        errores++;
        console.error(`[SYNC] Error con SKU ${row.sku}:`, err.message);
      }
    }

    console.log('[SYNC] Completado:', { procesados, errores });

    res.json({
      ok: true,
      message: 'Sincronización completada',
      data: {
        totalProductos: productosResult.recordset.length,
        procesados,
        errores,
        totalBodega,
        totalExhibicion,
        totalUnidades: totalBodega + totalExhibicion
      }
    });
  } catch (error) {
    console.error('[SYNC] Error:', error);
    next(error);
  }
}

async function exportConteoInicial(req, res, next) {
  try {
    const { inventarioId } = req.query;

    if (!inventarioId) {
      return res.status(400).json({
        ok: false,
        message: 'inventarioId es requerido'
      });
    }

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Conteo Inicial');

    sheet.columns = [
      { header: 'Zona', key: 'zona', width: 30 },
      { header: 'SKU', key: 'sku', width: 20 },
      { header: 'Descripción', key: 'descripcion', width: 50 },
      { header: 'Cantidad', key: 'cantidad', width: 15 },
      { header: 'Origen', key: 'origen', width: 20 }
    ];

    const data = await ConteoInicialDetalle.findAll({
      where: { inventarioId },
      include: [{ model: Zona, as: 'zona', attributes: ['nombre'] }],
      order: [['zonaId', 'ASC'], ['sku', 'ASC']]
    });

    for (const item of data) {
      sheet.addRow({
        zona: item.zona?.nombre || 'N/A',
        sku: item.sku,
        descripcion: item.descripcionSnapshot || '',
        cantidad: item.cantidadTotal || 0,
        origen: item.origenArchivo || 'Manual'
      });
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=conteo_inicial_${inventarioId}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  importConteoInicialExcel,
  getConteoInicialResumen,
  getSqlServerStatus,
  syncFromSqlServer,
  exportConteoInicial
};