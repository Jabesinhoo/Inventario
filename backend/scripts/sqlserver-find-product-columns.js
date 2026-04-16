require('dotenv').config();
const { getSqlServerPool } = require('../src/config/sqlserver');

async function main() {
  let pool;

  try {
    pool = await getSqlServerPool();

    const result = await pool.request().query(`
      SELECT TOP 500
        c.TABLE_SCHEMA,
        c.TABLE_NAME,
        c.COLUMN_NAME,
        c.DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS c
      WHERE
        LOWER(c.COLUMN_NAME) LIKE '%codigo%'
        OR LOWER(c.COLUMN_NAME) LIKE '%barra%'
        OR LOWER(c.COLUMN_NAME) LIKE '%sku%'
        OR LOWER(c.COLUMN_NAME) LIKE '%descripcion%'
        OR LOWER(c.COLUMN_NAME) LIKE '%descrip%'
        OR LOWER(c.COLUMN_NAME) LIKE '%nombre%'
        OR LOWER(c.COLUMN_NAME) LIKE '%existencia%'
        OR LOWER(c.COLUMN_NAME) LIKE '%stock%'
        OR LOWER(c.COLUMN_NAME) LIKE '%saldo%'
        OR LOWER(c.COLUMN_NAME) LIKE '%cant%'
      ORDER BY c.TABLE_NAME, c.COLUMN_NAME;
    `);

    console.table(result.recordset);
  } catch (error) {
    console.error('Error buscando columnas candidatas:', error.message);
  } finally {
    if (pool) {
      const realPool = await pool;
      await realPool.close();
    }
  }
}

main();