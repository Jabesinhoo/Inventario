'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('rondas_conteo', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      inventarioId: {
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
        allowNull: false,
        references: {
          model: 'zonas',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      numeroRonda: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      tipoRonda: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'completa'
      },
      estado: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'borrador'
      },
      generadaDesdeRondaId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'rondas_conteo',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      observaciones: {
        type: Sequelize.TEXT,
        allowNull: true
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

    await queryInterface.addConstraint('rondas_conteo', {
      fields: ['inventarioId', 'zonaId', 'numeroRonda'],
      type: 'unique',
      name: 'rondas_conteo_unique_inventario_zona_ronda'
    });

    await queryInterface.addIndex('rondas_conteo', ['inventarioId']);
    await queryInterface.addIndex('rondas_conteo', ['zonaId']);
    await queryInterface.addIndex('rondas_conteo', ['estado']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('rondas_conteo', ['estado']);
    await queryInterface.removeIndex('rondas_conteo', ['zonaId']);
    await queryInterface.removeIndex('rondas_conteo', ['inventarioId']);
    await queryInterface.removeConstraint(
      'rondas_conteo',
      'rondas_conteo_unique_inventario_zona_ronda'
    );
    await queryInterface.dropTable('rondas_conteo');
  }
};