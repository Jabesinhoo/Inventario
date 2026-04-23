const sql = require('mssql');

let pool = null;
let poolPromise = null;

function isSqlServerEnabled() {
  return String(process.env.SQLSERVER_ENABLED || '')
    .trim()
    .toLowerCase() === 'true';
}

function buildSqlServerConfig() {
  return {
    user: process.env.SQLSERVER_USER || '',
    password: process.env.SQLSERVER_PASSWORD || '',
    server: process.env.SQLSERVER_HOST || 'SERTECNO',
    database: process.env.SQLSERVER_DATABASE || 'Melissa_2023',

    connectionTimeout: Number(process.env.SQLSERVER_CONNECTION_TIMEOUT || 5000),
    requestTimeout: Number(process.env.SQLSERVER_REQUEST_TIMEOUT || 8000),

    pool: {
      max: Number(process.env.SQLSERVER_POOL_MAX || 5),
      min: 0,
      idleTimeoutMillis: Number(process.env.SQLSERVER_IDLE_TIMEOUT || 10000)
    },

    options: {
      instanceName: process.env.SQLSERVER_INSTANCE || 'WORLDOFFICE14',
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
      useUTC: false
    }
  };
}

function isConnectionResetError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();

  return (
    code === 'ESOCKET' ||
    code === 'ECONNRESET' ||
    message.includes('econnreset') ||
    message.includes('connection lost') ||
    message.includes('socket') ||
    message.includes('failed to connect')
  );
}

function resetPool() {
  pool = null;
  poolPromise = null;
}

async function createPool() {
  const config = buildSqlServerConfig();

  console.log('[SQLSERVER] Habilitado:', isSqlServerEnabled());
  console.log('[SQLSERVER] ENV raw:', JSON.stringify(process.env.SQLSERVER_ENABLED));
  console.log('[SQLSERVER] Configuración:');
  console.log(`   Host: ${config.server}`);
  console.log(`   Instancia: ${config.options.instanceName}`);
  console.log(`   Base de datos: ${config.database}`);
  console.log('[SQLSERVER] Conectando...');

  const connectionPool = new sql.ConnectionPool(config);

  connectionPool.on('error', (err) => {
    console.error('[SQLSERVER POOL ERROR]', err.message);
    resetPool();
  });

  await connectionPool.connect();

  console.log('[SQLSERVER] ✅ Conectado exitosamente');

  return connectionPool;
}

async function getSqlServerPool() {
  if (!isSqlServerEnabled()) {
    throw new Error('SQL Server deshabilitado por configuración');
  }

  if (pool && pool.connected) {
    return pool;
  }

  if (poolPromise) {
    return poolPromise;
  }

  poolPromise = createPool()
    .then((connectedPool) => {
      pool = connectedPool;
      return connectedPool;
    })
    .catch((error) => {
      resetPool();
      throw error;
    });

  return poolPromise;
}

async function closeSqlServerPool() {
  try {
    if (pool) {
      await pool.close();
      console.log('[SQLSERVER] Pool cerrado');
    }
  } catch (error) {
    console.error('[SQLSERVER] Error cerrando pool:', error.message);
  } finally {
    resetPool();
  }
}

async function executeQuery(query, params = {}, options = {}) {
  const { retryOnceOnSocketError = true } = options;

  if (!isSqlServerEnabled()) {
    throw new Error('SQL Server deshabilitado por configuración');
  }

  try {
    const activePool = await getSqlServerPool();
    const request = activePool.request();

    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }

    return await request.query(query);
  } catch (error) {
    console.error('[SQLSERVER] Query falló:', error.message);

    if (retryOnceOnSocketError && isConnectionResetError(error)) {
      console.warn('[SQLSERVER] Reiniciando pool y reintentando una vez...');
      await closeSqlServerPool();

      const retryPool = await getSqlServerPool();
      const retryRequest = retryPool.request();

      for (const [key, value] of Object.entries(params)) {
        retryRequest.input(key, value);
      }

      return await retryRequest.query(query);
    }

    throw error;
  }
}

module.exports = {
  sql,
  buildSqlServerConfig,
  getSqlServerPool,
  closeSqlServerPool,
  executeQuery
};