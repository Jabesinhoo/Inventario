const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 4017,
  apiVersion: process.env.API_VERSION || 'v1',
  
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME || 'inventario',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '1235',
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'inventory-super-secret-key-2026',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 10,
  
  logLevel: process.env.LOG_LEVEL || 'info',
  logDir: process.env.LOG_DIR || 'logs',
  
  corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },
  
  socketPort: parseInt(process.env.SOCKET_PORT, 10) || 4018,
};

module.exports = env;