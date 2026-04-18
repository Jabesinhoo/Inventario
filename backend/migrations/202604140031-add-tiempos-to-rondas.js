'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('rondas_conteo', 'tiempoInicio', {
      type: Sequelize.DATE,
      allowNull: true
    });

    await queryInterface.addColumn('rondas_conteo', 'tiempoFin', {
      type: Sequelize.DATE,
      allowNull: true
    });

    await queryInterface.addColumn('rondas_conteo', 'totalEscaneos', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('rondas_conteo', 'tiempoInicio');
    await queryInterface.removeColumn('rondas_conteo', 'tiempoFin');
    await queryInterface.removeColumn('rondas_conteo', 'totalEscaneos');
  }
};