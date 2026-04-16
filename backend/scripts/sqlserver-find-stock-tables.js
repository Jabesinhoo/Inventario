require('dotenv').config();
const { withSqlServer } = require('../src/config/sqlserver');

async function main() {
  try {
    const rows = await withSqlServer(async (pool) => {
      const result = await pool.request().query(`
        SELECT
          s.name AS TABLE_SCHEMA,
          t.name AS TABLE_NAME,
          c.name AS COLUMN_NAME,
          ty.name AS DATA_TYPE
        FROM sys.tables t
        INNER JOIN sys.schemas s
          ON s.schema_id = t.schema_id
        INNER JOIN sys.columns c
          ON c.object_id = t.object_id
        INNER JOIN sys.types ty
          ON ty.user_type_id = c.user_type_id
        WHERE
          (
            LOWER(c.name) LIKE '%saldo%'
            OR LOWER(c.name) LIKE '%existencia%'
            OR LOWER(c.name) LIKE '%cantidad%'
            OR LOWER(c.name) LIKE '%cantreal%'
            OR LOWER(c.name) LIKE '%stock%'
          )
          AND EXISTS (
            SELECT 1
            FROM sys.columns c2
            WHERE c2.object_id = t.object_id
              AND LOWER(c2.name) LIKE '%idinventario%'
          )
        ORDER BY t.name, c.name;
      `);

      return result.recordset;
    });

    console.table(rows);
  } catch (error) {
    console.error('Error buscando tablas de stock:', error.message);
  }
}

main();