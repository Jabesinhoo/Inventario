const { getSqlServerPool } = require('../config/sqlserver');

async function findProductoExternoByCodigo(codigo) {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input('codigo', codigo)
    .query(`
      SELECT TOP 1
        [IdInventario],
        [CódigoInventario],
        [CodigoBarras],
        [Descripción],
        [Nombre_Generico],
        [Activo]
      FROM [dbo].[Inventarios]
      WHERE [CodigoBarras] = @codigo
         OR [CódigoInventario] = @codigo
      ORDER BY [IdInventario] ASC
    `);

  if (!result.recordset.length) {
    return null;
  }

  const row = result.recordset[0];

  return {
    externalId: row.IdInventario,
    codigoInventario: row.CódigoInventario,
    codigoBarras: row.CodigoBarras,
    descripcion: row.Descripción,
    nombreGenerico: row.Nombre_Generico,
    activo: row.Activo
  };
}

module.exports = {
  findProductoExternoByCodigo
};