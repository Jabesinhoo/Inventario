'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('inventarios', 'inventarioBaseId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'inventarios',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addIndex('inventarios', ['inventarioBaseId'], {
      name: 'idx_inventarios_inventario_base_id'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      'inventarios',
      'idx_inventarios_inventario_base_id'
    );

    await queryInterface.removeColumn('inventarios', 'inventarioBaseId');
  }
};