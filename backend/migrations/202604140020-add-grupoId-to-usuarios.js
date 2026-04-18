// backend/migrations/202604140020-add-grupoId-to-usuarios.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
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
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('usuarios', 'grupoId');
  }
};