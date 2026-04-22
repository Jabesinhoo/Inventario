'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('usuario_grupo', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      usuarioId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'usuarios',
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
        onDelete: 'CASCADE'
      },
      esLider: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      fechaAsignacion: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
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

    // Índice único para evitar duplicados (mismo usuario en mismo grupo)
    await queryInterface.addConstraint('usuario_grupo', {
      fields: ['usuarioId', 'grupoId'],
      type: 'unique',
      name: 'usuario_grupo_unique'
    });

    console.log('✅ Tabla usuario_grupo creada');
  },

  async down(queryInterface) {
    await queryInterface.dropTable('usuario_grupo');
    console.log('❌ Tabla usuario_grupo eliminada');
  }
};