require('dotenv').config();
const { getSqlServerPool } = require('../src/config/sqlserver');
const { Producto, sequelize } = require('../src/models');

async function syncProductos() {
  console.log('🔄 Iniciando sincronización de productos desde SQL Server...');
  
  let sqlPool;
  
  try {
    sqlPool = await getSqlServerPool();
    
    // Obtener productos desde SQL Server
    const result = await sqlPool.request().query(`
      SELECT 
        [IdInventario],
        [CódigoInventario] as sku,
        [CodigoBarras] as codigoBarra,
        [Descripción] as descripcion,
        [Nombre_Generico] as categoria,
        [Activo]
      FROM [dbo].[Inventarios]
      WHERE [Activo] = 1
    `);
    
    console.log(`📦 Encontrados ${result.recordset.length} productos en SQL Server`);
    
    let insertados = 0;
    let actualizados = 0;
    
    for (const row of result.recordset) {
      const [producto, created] = await Producto.findOrCreate({
        where: { sku: row.sku },
        defaults: {
          sku: row.sku,
          codigoBarra: row.codigoBarra || row.sku,
          descripcion: row.descripcion || 'Sin descripción',
          categoria: row.categoria || null,
          activo: row.Activo === 1 || row.Activo === true
        }
      });
      
      if (!created) {
        // Actualizar si cambió algo
        await producto.update({
          codigoBarra: row.codigoBarra || producto.codigoBarra,
          descripcion: row.descripcion || producto.descripcion,
          categoria: row.categoria || producto.categoria,
          activo: row.Activo === 1 || row.Activo === true
        });
        actualizados++;
      } else {
        insertados++;
      }
    }
    
    console.log(`✅ Sincronización completada: ${insertados} insertados, ${actualizados} actualizados`);
    
  } catch (error) {
    console.error('❌ Error en sincronización:', error.message);
  } finally {
    if (sqlPool) {
      const pool = await sqlPool;
      await pool.close();
    }
    await sequelize.close();
  }
}

syncProductos();