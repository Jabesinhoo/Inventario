require('dotenv').config();
const { withSqlServer } = require('../src/config/sqlserver');

const schema = process.argv[2];
const table = process.argv[3];

if (!schema || !table) {
  console.error('Uso: node scripts/sqlserver-describe-table.js <schema> <table>');
  process.exit(1);
}

async function main() {
  try {
    const rows = await withSqlServer(async (pool) => {
      const result = await pool
        .request()
        .input('schema', schema)
        .input('table', table)
        .query(`
          SELECT
            c.name AS COLUMN_NAME,
            t.name AS DATA_TYPE,
            c.max_length AS CHARACTER_MAXIMUM_LENGTH,
            c.is_nullable AS IS_NULLABLE
          FROM sys.columns c
          INNER JOIN sys.tables tb
            ON tb.object_id = c.object_id
          INNER JOIN sys.schemas s
            ON s.schema_id = tb.schema_id
          INNER JOIN sys.types t
            ON t.user_type_id = c.user_type_id
          WHERE s.name = @schema
            AND tb.name = @table
          ORDER BY c.column_id;
        `);

      return result.recordset;
    });

    console.table(rows);
  } catch (error) {
    console.error('Error describiendo tabla:', error.message);
  }
}

main();