'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Verificar si la columna ya existe antes de crearla
    const table = await queryInterface.describeTable('discrepancias_conteo');
    
    if (!table.rondaReconteoId) {
      await queryInterface.addColumn('discrepancias_conteo', 'rondaReconteoId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'rondas_conteo',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('✅ Columna rondaReconteoId creada');
    } else {
      console.log('⚠️ La columna rondaReconteoId ya existe');
    }
  },

  down: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('discrepancias_conteo');
    if (table.rondaReconteoId) {
      await queryInterface.removeColumn('discrepancias_conteo', 'rondaReconteoId');
    }
  }
};