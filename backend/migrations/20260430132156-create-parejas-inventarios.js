'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('parejas_inventarios', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      inventarioBaseId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'inventarios',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      inventarioComparadoId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'inventarios',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      zonaId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'zonas',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      estado: {
        type: Sequelize.ENUM('pendiente', 'en_reconteo', 'completada'),
        defaultValue: 'pendiente',
        allowNull: false
      },
      fechaComparacion: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      fechaCompletada: {
        type: Sequelize.DATE,
        allowNull: true
      },
      observaciones: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Índices únicos para evitar duplicados
    await queryInterface.addIndex('parejas_inventarios', ['inventarioBaseId', 'inventarioComparadoId', 'zonaId'], {
      unique: true,
      name: 'unique_pareja_inventario_zona'
    });

    await queryInterface.addIndex('parejas_inventarios', ['estado']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('parejas_inventarios');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_parejas_inventarios_estado";');
  }
};