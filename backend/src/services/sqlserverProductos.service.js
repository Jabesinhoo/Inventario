const { getSqlServerPool } = require('../config/sqlserver');

async function findProductoByCodigo(codigo) {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input('codigo', codigo)
    .query(`
      SELECT TOP 1
        SKU,
        CodigoBarra,
        Descripcion,
        Existencia
      FROM dbo.Articulos
      WHERE CodigoBarra = @codigo
         OR SKU = @codigo
    `);

  return result.recordset[0] || null;
}

async function getInventarioBase() {
  const pool = await getSqlServerPool();

  const result = await pool.request().query(`
    SELECT
      SKU,
      CodigoBarra,
      Descripcion,
      Existencia
    FROM dbo.Articulos
  `);

  return result.recordset;
}

module.exports = {
  findProductoByCodigo,
  getInventarioBase
};