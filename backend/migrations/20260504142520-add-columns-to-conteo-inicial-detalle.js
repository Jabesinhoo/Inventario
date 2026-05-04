'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Agregar columna unidadMedida
    await queryInterface.addColumn('conteo_inicial_detalle', 'unidadMedida', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: 'Und.'
    });

    // Agregar columna grupoNombre
    await queryInterface.addColumn('conteo_inicial_detalle', 'grupoNombre', {
      type: Sequelize.STRING(100),
      allowNull: true
    });

    // Agregar columna precioCoste
    await queryInterface.addColumn('conteo_inicial_detalle', 'precioCoste', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: true,
      defaultValue: 0
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('conteo_inicial_detalle', 'unidadMedida');
    await queryInterface.removeColumn('conteo_inicial_detalle', 'grupoNombre');
    await queryInterface.removeColumn('conteo_inicial_detalle', 'precioCoste');
  }
};