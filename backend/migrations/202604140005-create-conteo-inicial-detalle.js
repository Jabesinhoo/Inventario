'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('conteo_inicial_detalle', {
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
      productoId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'productos',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      sku: {
        type: Sequelize.STRING(80),
        allowNull: false
      },
      codigoLeido: {
        type: Sequelize.STRING(120),
        allowNull: true
      },
      descripcionSnapshot: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      cantidad: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      origenArchivo: {
        type: Sequelize.STRING(255),
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

    await queryInterface.addConstraint('conteo_inicial_detalle', {
      fields: ['inventarioId', 'zonaId', 'sku'],
      type: 'unique',
      name: 'conteo_inicial_detalle_unique_inventario_zona_sku'
    });

    await queryInterface.addIndex('conteo_inicial_detalle', ['inventarioId']);
    await queryInterface.addIndex('conteo_inicial_detalle', ['zonaId']);
    await queryInterface.addIndex('conteo_inicial_detalle', ['sku']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('conteo_inicial_detalle', ['sku']);
    await queryInterface.removeIndex('conteo_inicial_detalle', ['zonaId']);
    await queryInterface.removeIndex('conteo_inicial_detalle', ['inventarioId']);
    await queryInterface.removeConstraint(
      'conteo_inicial_detalle',
      'conteo_inicial_detalle_unique_inventario_zona_sku'
    );
    await queryInterface.dropTable('conteo_inicial_detalle');
  }
};