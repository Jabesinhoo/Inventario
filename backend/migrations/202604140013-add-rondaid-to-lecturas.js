'use strict';

async function columnExists(queryInterface, tableName, columnName) {
  const [results] = await queryInterface.sequelize.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = :tableName
      AND column_name = :columnName
    LIMIT 1
    `,
    {
      replacements: { tableName, columnName }
    }
  );

  return results.length > 0;
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const exists = await columnExists(queryInterface, 'lecturas', 'rondaId');

    if (!exists) {
      await queryInterface.addColumn('lecturas', 'rondaId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'rondas_conteo',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });

      await queryInterface.addIndex('lecturas', ['rondaId']);
    }
  },

  async down(queryInterface) {
    const exists = await columnExists(queryInterface, 'lecturas', 'rondaId');

    if (exists) {
      await queryInterface.removeIndex('lecturas', ['rondaId']);
      await queryInterface.removeColumn('lecturas', 'rondaId');
    }
  }
};