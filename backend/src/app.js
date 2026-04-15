const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const countRoutes = require('./routes/countRoutes');
const userRoutes = require('./routes/usuarioRoutes');
const groupRoutes = require('./routes/grupoRoutes');
const statsRoutes = require('./routes/statsRoutes'); // <-- DEBE ESTAR

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Rutas
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/counts', countRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/groups', groupRoutes);
app.use('/api/v1/stats', statsRoutes); // <-- DEBE ESTAR

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

module.exports = app;