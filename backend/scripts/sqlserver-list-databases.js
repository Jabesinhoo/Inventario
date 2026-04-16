require('dotenv').config();
const { sql } = require('../src/config/sqlserver');

async function main() {
  const config = {
    user: process.env.SQLSERVER_USER,
    password: process.env.SQLSERVER_PASSWORD,
    server: process.env.SQLSERVER_HOST,
    options: {
      instanceName: process.env.SQLSERVER_INSTANCE,
      encrypt: String(process.env.SQLSERVER_ENCRYPT || 'false') === 'true',
      trustServerCertificate:
        String(process.env.SQLSERVER_TRUST_CERT || 'true') === 'true'
    }
  };

  let pool;

  try {
    pool = await new sql.ConnectionPool(config).connect();

    const result = await pool.request().query(`
      SELECT name
      FROM sys.databases
      ORDER BY name;
    `);

    console.table(result.recordset);
  } catch (error) {
    console.error('Error listando bases de datos:', error.message);
  } finally {
    if (pool) await pool.close();
  }
}

main();