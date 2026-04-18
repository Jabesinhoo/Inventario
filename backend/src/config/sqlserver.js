const sql = require('mssql');

let poolPromise = null;
let retryCount = 0;
const MAX_RETRIES = 3;

function buildSqlServerConfig() {
  const config = {
    user: process.env.SQLSERVER_USER || 'Jabes',
    password: process.env.SQLSERVER_PASSWORD || 'Jabes2026',
    server: 'SERTECNO',
    database: 'Melissa_2023',
    connectionTimeout: 120000,  // 2 minutos
    requestTimeout: 120000,     // 2 minutos
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 120000,
      acquireTimeoutMillis: 120000
    },
    options: {
      instanceName: 'WORLDOFFICE14',
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
      useUTC: false,
      connectTimeout: 120000
    }
  };

  console.log('[SQLSERVER] Configuración:');
  console.log(`   Host: ${config.server}`);
  console.log(`   Instancia: ${config.options.instanceName}`);
  console.log(`   Base de datos: ${config.database}`);

  return config;
}

async function getSqlServerPool() {
  if (!poolPromise) {
    try {
      const config = buildSqlServerConfig();
      const pool = new sql.ConnectionPool(config);
      
      pool.on('error', (err) => {
        console.error('[SQLSERVER POOL ERROR]', err.message);
        poolPromise = null;
      });

      console.log('[SQLSERVER] Conectando...');
      poolPromise = pool.connect();
      await poolPromise;
      console.log('[SQLSERVER] ✅ Conectado exitosamente');
      retryCount = 0;
    } catch (error) {
      console.error('[SQLSERVER] Error de conexión:', error.message);
      poolPromise = null;
      
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`[SQLSERVER] Reintentando (${retryCount}/${MAX_RETRIES}) en 2 segundos...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return getSqlServerPool();
      }
      throw error;
    }
  }
  return poolPromise;
}

async function closeSqlServerPool() {
  if (poolPromise) {
    const pool = await poolPromise;
    await pool.close();
    poolPromise = null;
    console.log('[SQLSERVER] Pool cerrado');
  }
}

async function executeQuery(query, params = {}) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const pool = await getSqlServerPool();
      const request = pool.request();
      
      for (const [key, value] of Object.entries(params)) {
        request.input(key, value);
      }
      
      const result = await request.query(query);
      return result;
    } catch (error) {
      lastError = error;
      console.error(`[SQLSERVER] Query falló (intento ${attempt}/${MAX_RETRIES}):`, error.message);
      
      if (attempt < MAX_RETRIES) {
        poolPromise = null;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  
  throw lastError;
}

module.exports = {
  sql,
  buildSqlServerConfig,
  getSqlServerPool,
  closeSqlServerPool,
  executeQuery
};