'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Verificar si la columna ya existe
    const table = await queryInterface.describeTable('parejas_inventarios');
    
    if (!table.rondasReconteoGeneradas) {
      await queryInterface.addColumn('parejas_inventarios', 'rondasReconteoGeneradas', {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      });
      console.log('✅ Columna rondasReconteoGeneradas creada');
    } else {
      console.log('⚠️ La columna rondasReconteoGeneradas ya existe');
    }
  },

  down: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('parejas_inventarios');
    if (table.rondasReconteoGeneradas) {
      await queryInterface.removeColumn('parejas_inventarios', 'rondasReconteoGeneradas');
    }
  }
};