'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('rondas_conteo', 'alcanceReconteo', {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: 'pendientes'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('rondas_conteo', 'alcanceReconteo');
  }
};