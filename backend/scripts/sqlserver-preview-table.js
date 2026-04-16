require('dotenv').config();
const { withSqlServer } = require('../src/config/sqlserver');

const schema = process.argv[2];
const table = process.argv[3];

if (!schema || !table) {
  console.error('Uso: node scripts/sqlserver-preview-table.js <schema> <table>');
  process.exit(1);
}

async function main() {
  try {
    const rows = await withSqlServer(async (pool) => {
      const result = await pool.request().query(`
        SELECT TOP 10 *
        FROM [${schema}].[${table}]
      `);
      return result.recordset;
    });

    console.table(rows);
  } catch (error) {
    console.error('Error previsualizando tabla:', error.message);
  }
}

main();