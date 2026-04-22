const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');

const sequelize = new Sequelize('inventario', 'postgres', '1235', {
  host: 'localhost',
  port: 5432,
  dialect: 'postgres',
  logging: console.log
});

async function runMigrations() {
  try {
    const modelsPath = path.join(__dirname, '../src/models');
    const files = fs.readdirSync(modelsPath);
    
    for (const file of files) {
      if (file !== 'index.js' && file.endsWith('.js')) {
        const model = require(path.join(modelsPath, file));
        if (typeof model === 'function') {
          model(sequelize);
        }
      }
    }
    
    await sequelize.sync({ alter: true });
    console.log('✅ Tablas sincronizadas correctamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

runMigrations();