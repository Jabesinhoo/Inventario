'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('usuarios');
    
    if (!tableInfo.grupoId) {
      await queryInterface.addColumn('usuarios', 'grupoId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'grupos',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('✅ Columna grupoId restaurada en usuarios');
    }
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable('usuarios');
    if (tableInfo.grupoId) {
      await queryInterface.removeColumn('usuarios', 'grupoId');
    }
  }
};