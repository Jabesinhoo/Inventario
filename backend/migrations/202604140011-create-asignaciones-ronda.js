'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('asignaciones_ronda', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      rondaId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'rondas_conteo',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      grupoId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'grupos',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      estado: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'asignada'
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

    await queryInterface.addConstraint('asignaciones_ronda', {
      fields: ['rondaId'],
      type: 'unique',
      name: 'asignaciones_ronda_unique_ronda'
    });

    await queryInterface.addIndex('asignaciones_ronda', ['grupoId']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('asignaciones_ronda', ['grupoId']);
    await queryInterface.removeConstraint(
      'asignaciones_ronda',
      'asignaciones_ronda_unique_ronda'
    );
    await queryInterface.dropTable('asignaciones_ronda');
  }
};