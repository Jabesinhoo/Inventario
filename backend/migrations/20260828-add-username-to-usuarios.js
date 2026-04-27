'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('usuarios', 'username', {
      type: Sequelize.STRING(60),
      allowNull: true
    });

    await queryInterface.sequelize.query(`
      UPDATE usuarios
      SET username = LOWER(
        REGEXP_REPLACE(
          COALESCE(NULLIF(nombre, ''), 'usuario'),
          '[^a-zA-Z0-9]+',
          '_',
          'g'
        )
      ) || '_' || id
    `);

    await queryInterface.changeColumn('usuarios', 'username', {
      type: Sequelize.STRING(60),
      allowNull: false,
      unique: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('usuarios', 'username');
  }
};