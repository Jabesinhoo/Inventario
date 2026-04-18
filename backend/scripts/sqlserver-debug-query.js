require('dotenv').config();
const sql = require('mssql');

async function debugQuery() {
  const config = {
    user: 'Jabes',
    password: 'Jabes2026',
    server: 'SERTECNO',
    database: 'Melissa_2023',
    options: {
      instanceName: 'WORLDOFFICE14',
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true
    },
    connectionTimeout: 60000,
    requestTimeout: 60000
  };

  console.log('========================================');
  console.log('🔍 DEBUG QUERY');
  console.log('========================================\n');

  try {
    const pool = await sql.connect(config);
    console.log('✅ Conectado\n');

    // 1. Ver cuántos productos activos hay
    console.log('1. Productos ACTIVOS en Inventarios:');
    const activos = await pool.request().query(`
      SELECT COUNT(*) as total 
      FROM [dbo].[Inventarios] 
      WHERE [Activo] = 1
    `);
    console.log(`   Total: ${activos.recordset[0].total}\n`);

    // 2. Ver cuántos registros hay en CCA_M_Inventarios
    console.log('2. Registros en CCA_M_Inventarios:');
    const ccaCount = await pool.request().query(`
      SELECT COUNT(*) as total 
      FROM [dbo].[CCA_M_Inventarios]
    `);
    console.log(`   Total: ${ccaCount.recordset[0].total}\n`);

    // 3. Ver registros con Cantidad > 0
    console.log('3. Registros con Cantidad > 0 en CCA_M_Inventarios:');
    const conCantidad = await pool.request().query(`
      SELECT COUNT(*) as total 
      FROM [dbo].[CCA_M_Inventarios]
      WHERE Cantidad > 0
    `);
    console.log(`   Total: ${conCantidad.recordset[0].total}\n`);

    // 4. Ver distribución por bodega
    console.log('4. Distribución por bodega (Cantidad > 0):');
    const porBodega = await pool.request().query(`
      SELECT 
        IdBodegaInventario,
        COUNT(*) as registros,
        SUM(Cantidad) as total_cantidad
      FROM [dbo].[CCA_M_Inventarios]
      WHERE Cantidad > 0
      GROUP BY IdBodegaInventario
      ORDER BY total_cantidad DESC
    `);
    console.table(porBodega.recordset);

    // 5. Ver un ejemplo de JOIN exitoso
    console.log('\n5. Ejemplo de JOIN (primeros 5 productos con existencias):');
    const joinExample = await pool.request().query(`
      SELECT TOP 5
        i.[IdInventario],
        i.[CódigoInventario],
        i.[Descripción],
        c.IdBodegaInventario,
        c.Cantidad
      FROM [dbo].[Inventarios] i
      INNER JOIN [dbo].[CCA_M_Inventarios] c ON c.IdInventario = i.IdInventario
      WHERE c.Cantidad > 0
        AND i.[Activo] = 1
    `);
    
    if (joinExample.recordset.length > 0) {
      console.table(joinExample.recordset);
    } else {
      console.log('   ❌ No hay productos que cumplan ambas condiciones');
      
      // Ver si hay productos activos con algún registro en CCA
      console.log('\n6. Verificando productos activos con cualquier registro en CCA:');
      const anyJoin = await pool.request().query(`
        SELECT TOP 5
          i.[IdInventario],
          i.[CódigoInventario],
          i.[Activo],
          COUNT(c.IdInventario) as registros_cca
        FROM [dbo].[Inventarios] i
        LEFT JOIN [dbo].[CCA_M_Inventarios] c ON c.IdInventario = i.IdInventario
        WHERE i.[Activo] = 1
        GROUP BY i.[IdInventario], i.[CódigoInventario], i.[Activo]
        HAVING COUNT(c.IdInventario) > 0
      `);
      
      if (anyJoin.recordset.length > 0) {
        console.table(anyJoin.recordset);
      } else {
        console.log('   ❌ No hay productos activos con registros en CCA_M_Inventarios');
      }
    }

    // 7. Verificar si hay productos con Cantidad en EXH o BOD
    console.log('\n7. Productos con cantidad en EXH o BOD:');
    const exhBod = await pool.request().query(`
      SELECT 
        IdBodegaInventario,
        COUNT(DISTINCT IdInventario) as productos,
        SUM(Cantidad) as total
      FROM [dbo].[CCA_M_Inventarios]
      WHERE IdBodegaInventario IN ('EXH', 'BOD')
        AND Cantidad > 0
      GROUP BY IdBodegaInventario
    `);
    console.table(exhBod.recordset);

    await pool.close();
    console.log('\n👋 Conexión cerrada');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

debugQuery();