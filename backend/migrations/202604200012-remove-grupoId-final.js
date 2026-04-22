'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('usuarios');
    if (tableInfo.grupoId) {
      await queryInterface.removeColumn('usuarios', 'grupoId');
      console.log('✅ Columna grupoId eliminada definitivamente');
    }
  },

  async down(queryInterface) {
    await queryInterface.addColumn('usuarios', 'grupoId', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
  }
};