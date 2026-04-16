const sql = require('mssql');

let poolPromise = null;

function buildSqlServerConfig() {
  const usePort = !!process.env.SQLSERVER_PORT;

  return {
    user: process.env.SQLSERVER_USER,
    password: process.env.SQLSERVER_PASSWORD,
    server: process.env.SQLSERVER_HOST,
    database: process.env.SQLSERVER_DATABASE,
    connectionTimeout: 30000,
    requestTimeout: 30000,
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000
    },
    options: {
      encrypt: String(process.env.SQLSERVER_ENCRYPT || 'false') === 'true',
      trustServerCertificate:
        String(process.env.SQLSERVER_TRUST_CERT || 'true') === 'true',
      enableArithAbort: true,
      ...(usePort
        ? {}
        : { instanceName: process.env.SQLSERVER_INSTANCE })
    },
    ...(usePort ? { port: Number(process.env.SQLSERVER_PORT) } : {})
  };
}

async function getSqlServerPool() {
  if (!poolPromise) {
    const pool = new sql.ConnectionPool(buildSqlServerConfig());

    pool.on('error', (err) => {
      console.error('[SQLSERVER POOL ERROR]', err.message);
      poolPromise = null;
    });

    poolPromise = pool.connect();
  }

  return poolPromise;
}

async function closeSqlServerPool() {
  if (poolPromise) {
    const pool = await poolPromise;
    await pool.close();
    poolPromise = null;
  }
}

module.exports = {
  sql,
  buildSqlServerConfig,
  getSqlServerPool,
  closeSqlServerPool
};