require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT || 4018),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiVersion: process.env.API_VERSION || 'v1',

  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    dialect: 'postgres',
    logging: false
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },

  bcrypt: {
    rounds: Number(process.env.BCRYPT_ROUNDS || 10)
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173'
  },

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
    maxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 100)
  }
};