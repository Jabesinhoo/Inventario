const Joi = require('joi');
const {
  sequelize,
  Inventario,
  Zona,
  Producto,
  ConteoInicialDetalle,
  Op
} = require('../models');
const { parseConteoInicialExcel } = require('../utils/conteoInicialExcel');

const querySchema = Joi.object({
  inventarioId: Joi.number().integer().required()
});

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

    const inventario = await Inventario.findByPk(value.inventarioId);
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

    // Procesar cada fila
    for (const item of rows) {
      try {
        // Buscar la zona por nombre o código
        let zonaNombre = item.zona;
        if (zonaNombre === 'BODEGA') zonaNombre = 'Bodega Principal';
        if (zonaNombre === 'EXHIBICION') zonaNombre = 'Exhibición';
        
        let zona = await Zona.findOne({
          where: {
            [Op.or]: [
              { nombre: zonaNombre },
              { codigo: item.zona }
            ]
          },
          transaction
        });

        // Si no existe la zona, crearla
        if (!zona) {
          zona = await Zona.create({
            nombre: zonaNombre,
            codigo: item.zona,
            activa: true
          }, { transaction });
          console.log(`[IMPORT] Zona creada: ${zona.nombre}`);
        }

        // Truncar descripción si es muy larga
        let descripcionCorta = item.descripcion || 'Sin descripción';
        if (descripcionCorta.length > 250) {
          descripcionCorta = descripcionCorta.substring(0, 247) + '...';
        }

        // Buscar el producto por SKU
        let producto = await Producto.findOne({
          where: { sku: item.sku },
          transaction
        });

        // Si no existe el producto, crearlo
        if (!producto) {
          producto = await Producto.create({
            sku: item.sku,
            codigoBarra: item.sku.substring(0, 120),
            descripcion: descripcionCorta,
            activo: true
          }, { transaction });
          console.log(`[IMPORT] Producto creado: ${producto.sku}`);
        }

        // Truncar también para el snapshot
        let snapshotDescripcion = descripcionCorta;

        // Buscar si ya existe el conteo
        const existing = await ConteoInicialDetalle.findOne({
          where: {
            inventarioId: value.inventarioId,
            zonaId: zona.id,
            sku: item.sku
          },
          transaction
        });

        if (!existing) {
          await ConteoInicialDetalle.create({
            inventarioId: value.inventarioId,
            zonaId: zona.id,
            productoId: producto.id,
            sku: item.sku,
            codigoLeido: item.sku,
            descripcionSnapshot: snapshotDescripcion,
            cantidadTotal: item.cantidad,
            origenArchivo: req.file.originalname
          }, { transaction });
          insertados++;
        } else {
          await existing.update({
            cantidadTotal: item.cantidad,
            descripcionSnapshot: snapshotDescripcion
          }, { transaction });
          actualizados++;
        }
        
      } catch (err) {
        console.error(`[IMPORT] Error con SKU ${item.sku}:`, err.message);
        noResueltos.push({
          sku: item.sku,
          message: err.message
        });
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
      include: [
        { model: Zona, as: 'zona', attributes: ['id', 'nombre', 'codigo'] }
      ],
      order: [['zonaId', 'ASC'], ['sku', 'ASC']]
    });
    
    // Transformar para mostrar por producto con cantidades por zona
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
      
      producto.total += item.cantidadTotal;
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


// Agregar al final del archivo, antes del module.exports

async function getSqlServerStatus(req, res, next) {
  try {
    const { getSqlServerPool } = require('../config/sqlserver');
    
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
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      throw lastError;
    }
    
    // SOLO Obtener productos con cantidades en BOD (Bodega Principal) y EXH (Exhibición)
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
        AND c.Cantidad > 0
        AND c.IdBodegaInventario IN ('BOD', 'EXH')
      GROUP BY 
        i.[CódigoInventario],
        i.[CodigoBarras],
        i.[Descripción],
        i.[Nombre_Generico]
      HAVING 
        SUM(CASE WHEN c.IdBodegaInventario = 'BOD' THEN c.Cantidad ELSE 0 END) > 0
        OR SUM(CASE WHEN c.IdBodegaInventario = 'EXH' THEN c.Cantidad ELSE 0 END) > 0
      ORDER BY i.[CódigoInventario]
    `);
    
    console.log('[SYNC] Productos encontrados:', productosResult.recordset.length);
    
    // Crear o obtener las zonas BOD y EXH
    const [zonaBodega, createdB] = await Zona.findOrCreate({
      where: { codigo: 'BOD' },
      defaults: {
        nombre: 'Bodega Principal',
        codigo: 'BOD',
        activa: true
      }
    });
    
    const [zonaExhibicion, createdE] = await Zona.findOrCreate({
      where: { codigo: 'EXH' },
      defaults: {
        nombre: 'Exhibición',
        codigo: 'EXH',
        activa: true
      }
    });
    
    console.log('[SYNC] Zonas: Bodega Principal (ID:', zonaBodega.id, ') Exhibición (ID:', zonaExhibicion.id, ')');
    
    let procesados = 0;
    let errores = 0;
    let totalBodega = 0;
    let totalExhibicion = 0;
    
    // Limpiar datos anteriores de este inventario para estas zonas
    await ConteoInicialDetalle.destroy({
      where: {
        inventarioId,
        zonaId: [zonaBodega.id, zonaExhibicion.id]
      }
    });
    
    for (const row of productosResult.recordset) {
      try {
        const cantidadBodega = Math.round(Number(row.cantidadBodega) || 0);
        const cantidadExhibicion = Math.round(Number(row.cantidadExhibicion) || 0);
        
        totalBodega += cantidadBodega;
        totalExhibicion += cantidadExhibicion;
        
        // Buscar o crear el producto localmente
        const [producto] = await Producto.findOrCreate({
          where: { sku: row.sku },
          defaults: {
            sku: row.sku,
            codigoBarra: row.codigoBarra || row.sku,
            descripcion: row.descripcion || 'Sin descripción',
            categoria: row.categoria || null,
            activo: true
          }
        });
        
        // Guardar para zona BODEGA (si tiene cantidad)
        if (cantidadBodega > 0) {
          await ConteoInicialDetalle.create({
            inventarioId,
            zonaId: zonaBodega.id,
            productoId: producto.id,
            sku: row.sku,
            codigoLeido: row.codigoBarra || row.sku,
            descripcionSnapshot: row.descripcion || 'Sin descripción',
            cantidadBodega: cantidadBodega,
            cantidadExhibicion: 0,
            cantidadTotal: cantidadBodega,
            origenArchivo: 'sqlserver_sync'
          });
        }
        
        // Guardar para zona EXHIBICIÓN (si tiene cantidad)
        if (cantidadExhibicion > 0) {
          await ConteoInicialDetalle.create({
            inventarioId,
            zonaId: zonaExhibicion.id,
            productoId: producto.id,
            sku: row.sku,
            codigoLeido: row.codigoBarra || row.sku,
            descripcionSnapshot: row.descripcion || 'Sin descripción',
            cantidadBodega: 0,
            cantidadExhibicion: cantidadExhibicion,
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
    console.log('[SYNC] Totales - Bodega:', totalBodega, 'unidades - Exhibición:', totalExhibicion, 'unidades');
    
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
      include: [
        { model: Zona, as: 'zona', attributes: ['nombre'] }
      ],
      order: [['zonaId', 'ASC'], ['sku', 'ASC']]
    });
    
    for (const item of data) {
      sheet.addRow({
        zona: item.zona?.nombre || 'N/A',
        sku: item.sku,
        descripcion: item.descripcionSnapshot || '',
        cantidad: item.cantidad,
        origen: item.origenArchivo || 'Manual'
      });
    }
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=conteo_inicial_${inventarioId}.xlsx`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
}

// Actualizar module.exports
module.exports = {
  importConteoInicialExcel,
  getConteoInicialResumen,
  getSqlServerStatus,
  syncFromSqlServer,
  exportConteoInicial
};