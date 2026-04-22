'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('grupos');
    
    if (!tableInfo.color) {
      await queryInterface.addColumn('grupos', 'color', {
        type: Sequelize.STRING(20),
        allowNull: true,
        defaultValue: '#3b82f6'
      });
      console.log('✅ Columna color agregada a grupos');
    } else {
      console.log('⏭️ Columna color ya existe');
    }
    
    if (!tableInfo.liderId) {
      await queryInterface.addColumn('grupos', 'liderId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'usuarios',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('✅ Columna liderId agregada a grupos');
    } else {
      console.log('⏭️ Columna liderId ya existe');
    }
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable('grupos');
    if (tableInfo.color) {
      await queryInterface.removeColumn('grupos', 'color');
    }
    if (tableInfo.liderId) {
      await queryInterface.removeColumn('grupos', 'liderId');
    }
  }
};