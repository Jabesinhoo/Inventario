const { executeQuery } = require('../config/sqlserver');

// ==================== ESTADO DE CONEXIÓN ====================
async function getSqlServerStatus(req, res, next) {
  try {
    const result = await executeQuery('SELECT DB_NAME() as databaseName, @@VERSION as version');
    
    res.json({
      ok: true,
      data: {
        connected: true,
        database: result.recordset[0].databaseName,
        version: result.recordset[0].version.split('\n')[0]
      }
    });
  } catch (error) {
    console.error('[SQLSERVER STATUS] Error:', error.message);
    res.json({
      ok: true,
      data: {
        connected: false,
        error: error.message
      }
    });
  }
}

// ==================== LISTAR PRODUCTOS ====================
async function listarProductosExternos(req, res, next) {
  try {
    const { limit = 100, search = '', activo = null } = req.query;
    
    let query = `
      SELECT 
        [IdInventario] as id,
        [CódigoInventario] as codigo,
        [CodigoBarras] as codigoBarra,
        [Descripción] as descripcion,
        [Nombre_Generico] as nombreGenerico,
        [Activo] as activo
      FROM [dbo].[Inventarios]
      WHERE 1=1
    `;
    
    if (search) {
      query += ` AND ([CódigoInventario] LIKE '%${search}%' OR [Descripción] LIKE '%${search}%' OR [CodigoBarras] LIKE '%${search}%')`;
    }
    
    if (activo !== null) {
      query += ` AND [Activo] = ${activo === '1' || activo === 'true' ? 1 : 0}`;
    }
    
    query += ` ORDER BY [CódigoInventario] OFFSET 0 ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY`;
    
    const result = await executeQuery(query);
    
    // Contar total
    let countQuery = `SELECT COUNT(*) as total FROM [dbo].[Inventarios] WHERE 1=1`;
    if (search) {
      countQuery += ` AND ([CódigoInventario] LIKE '%${search}%' OR [Descripción] LIKE '%${search}%')`;
    }
    const countResult = await executeQuery(countQuery);

    res.json({
      ok: true,
      data: {
        total: countResult.recordset[0].total,
        limit: parseInt(limit),
        productos: result.recordset
      }
    });
  } catch (error) {
    console.error('[SQLSERVER LISTAR] Error:', error.message);
    res.status(500).json({
      ok: false,
      message: 'Error al listar productos: ' + error.message
    });
  }
}

// ==================== BUSCAR PRODUCTO POR CÓDIGO ====================
async function buscarProductoExterno(req, res, next) {
  try {
    const { codigo } = req.query;
    
    if (!codigo) {
      return res.status(400).json({
        ok: false,
        message: 'Código es requerido'
      });
    }
    
    const result = await executeQuery(
      `SELECT TOP 1
        [IdInventario] as id,
        [CódigoInventario] as codigo,
        [CodigoBarras] as codigoBarra,
        [Descripción] as descripcion,
        [Nombre_Generico] as nombreGenerico,
        [Activo] as activo
      FROM [dbo].[Inventarios]
      WHERE [CódigoInventario] = @codigo
         OR [CodigoBarras] = @codigo
      ORDER BY [IdInventario] ASC`,
      { codigo }
    );

    if (!result.recordset.length) {
      return res.status(404).json({
        ok: false,
        message: 'Producto no encontrado en SQL Server'
      });
    }

    res.json({
      ok: true,
      data: result.recordset[0]
    });
  } catch (error) {
    console.error('[SQLSERVER BUSCAR] Error:', error.message);
    res.status(500).json({
      ok: false,
      message: 'Error al buscar producto: ' + error.message
    });
  }
}

// ==================== LISTAR TABLAS DISPONIBLES ====================
async function getSqlServerTables(req, res, next) {
  try {
    const result = await executeQuery(`
      SELECT 
        TABLE_SCHEMA,
        TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);

    res.json({
      ok: true,
      data: result.recordset
    });
  } catch (error) {
    console.error('[SQLSERVER TABLAS] Error:', error.message);
    res.status(500).json({
      ok: false,
      message: 'Error al listar tablas: ' + error.message
    });
  }
}

module.exports = {
  getSqlServerStatus,
  listarProductosExternos,
  buscarProductoExterno,
  getSqlServerTables
};