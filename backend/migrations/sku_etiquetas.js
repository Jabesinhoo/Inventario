'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sku_etiquetas', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      sku: {
        type: Sequelize.STRING(80),
        allowNull: false
      },
      nombre: {
        type: Sequelize.STRING(100),
        allowNull: false,
        defaultValue: 'Etiqueta'
      },
      color: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: '#f59e0b'
      },
      nota: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      activo: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      creadoPorId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'usuarios',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      actualizadoPorId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'usuarios',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });

    await queryInterface.addIndex('sku_etiquetas', ['sku'], {
      name: 'idx_sku_etiquetas_sku'
    });

    await queryInterface.addIndex('sku_etiquetas', ['sku', 'activo'], {
      name: 'idx_sku_etiquetas_sku_activo'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sku_etiquetas');
  }
};