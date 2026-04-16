const express = require('express');
const cors = require('cors');
const config = require('./config/config');
const routes = require('./src/routes');
const { sequelize } = require('./src/models');
const {
  notFoundHandler,
  errorHandler
} = require('./src/middleware/error.middleware');

const app = express();

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (config.cors.origins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    credentials: true
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    environment: config.nodeEnv,
    version: config.apiVersion,
    message: 'API inventario activa'
  });
});

app.use(`/api/${config.apiVersion}`, routes);

app.use(notFoundHandler);
app.use(errorHandler);

async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('Base de datos PostgreSQL conectada correctamente');

    app.listen(config.port, () => {
      console.log(`Servidor corriendo en puerto ${config.port}`);
    });
  } catch (error) {
    console.error('Error al iniciar el servidor:', error);
  }
}

startServer();