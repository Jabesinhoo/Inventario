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
      console.log('✅ Columna grupoId agregada a usuarios');
    } else {
      console.log('⏭️ Columna grupoId ya existe');
    }
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable('usuarios');
    if (tableInfo.grupoId) {
      await queryInterface.removeColumn('usuarios', 'grupoId');
    }
  }
};