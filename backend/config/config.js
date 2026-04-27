require('dotenv').config();

function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isSqlServerEnabled() {
  return String(process.env.SQLSERVER_ENABLED || '')
    .trim()
    .toLowerCase() === 'true';
}

const dbConfig = {
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'inventario',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  dialect: 'postgres',
  logging: false
};

const config = {
  port: Number(process.env.PORT || 4018),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiVersion: process.env.API_VERSION || 'v1',

  db: {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    username: dbConfig.username,
    password: dbConfig.password,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging
  },

  cors: {
    origins: parseOrigins(process.env.CORS_ORIGIN)
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'inventory-super-secret-key-2026',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },

  bcrypt: {
    rounds: Number(process.env.BCRYPT_ROUNDS || 10)
  },

  logs: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || 'logs'
  },

  sqlserver: {
    enabled: isSqlServerEnabled(),
    host: process.env.SQLSERVER_HOST || 'SERTECNO',
    instance: process.env.SQLSERVER_INSTANCE || 'WORLDOFFICE14',
    database: process.env.SQLSERVER_DATABASE || 'Melissa_2023',
    user: process.env.SQLSERVER_USER || '',
    password: process.env.SQLSERVER_PASSWORD || '',
    connectionTimeout: Number(process.env.SQLSERVER_CONNECTION_TIMEOUT || 5000),
    requestTimeout: Number(process.env.SQLSERVER_REQUEST_TIMEOUT || 8000),
    poolMax: Number(process.env.SQLSERVER_POOL_MAX || 2),
    idleTimeout: Number(process.env.SQLSERVER_IDLE_TIMEOUT || 10000)
  },

  development: {
    ...dbConfig
  },

  test: {
    ...dbConfig,
    database: process.env.DB_TEST_NAME || `${dbConfig.database}_test`
  },

  production: {
    ...dbConfig
  }
};

module.exports = config;