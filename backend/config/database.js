const { Pool } = require('pg');
const env = require('./env');
const logger = require('../src/utils/logger');

const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  user: env.db.user,
  password: env.db.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  logger.info('[DATABASE] Connected to PostgreSQL');
});

pool.on('error', (err) => {
  logger.error('[DATABASE] Unexpected error:', err);
});

const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('[DATABASE] Query executed', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    logger.error('[DATABASE] Query error:', { text, error: error.message });
    throw error;
  }
};

const getClient = async () => {
  const client = await pool.connect();
  const query = client.query;
  const release = client.release;
  
  client.query = (...args) => {
    client.lastQuery = args;
    return query.apply(client, args);
  };
  
  client.release = () => {
    client.query = query;
    client.release = release;
    return release.apply(client);
  };
  
  return client;
};

module.exports = {
  query,
  getClient,
  pool,
};