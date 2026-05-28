const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const countRoutes = require('./routes/countRoutes');
const userRoutes = require('./routes/usuarioRoutes');
const groupRoutes = require('./routes/grupoRoutes');
const statsRoutes = require('./routes/statsRoutes');
const supervisorRoutes = require('./routes/supervisor.routes');
const skuEtiquetasRoutes = require('./routes/sku-etiquetas.routes');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// LOG TEMPORAL
app.use((req, res, next) => {
  console.log('🌐 REQUEST:', req.method, req.originalUrl);
  next();
});

// Rutas
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/counts', countRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/groups', groupRoutes);
app.use('/api/v1/stats', statsRoutes);
app.use('/api/v1/supervisors', supervisorRoutes);

// Etiquetas SKU
console.log('✅ Montando /api/v1/sku-etiquetas');
app.use('/api/v1/sku-etiquetas', skuEtiquetasRoutes);

app.get('/api/v1/debug-app', (req, res) => {
  res.json({
    ok: true,
    message: 'Este es el app.js correcto',
    timestamp: new Date().toISOString()
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

console.log('✅ Montando /api/v1/etiquetas');
app.use('/api/v1/etiquetas', skuEtiquetasRoutes);

// Ruta temporal de prueba
app.get('/api/v1/test-etiquetas', (req, res) => {
  res.json({ ok: true, message: 'Ruta test etiquetas funcionando' });
});

// 404
app.use((req, res) => {
  console.log('❌ 404:', req.method, req.originalUrl);

  res.status(404).json({
    ok: false,
    error: 'Ruta no encontrada',
    method: req.method,
    path: req.originalUrl
  });
});

module.exports = app;