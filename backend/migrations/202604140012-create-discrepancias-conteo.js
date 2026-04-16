'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('discrepancias_conteo', {
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
      descripcionSnapshot: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      rondaBaseId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'rondas_conteo',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      ultimaRondaId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'rondas_conteo',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      cantidadBase: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      cantidadUltima: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      diferencia: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      estado: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: 'pendiente_reconteo'
      },
      proximaRondaNumero: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      cantidadFinal: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      criterioCierre: {
        type: Sequelize.STRING(60),
        allowNull: true
      },
      cerradoEn: {
        type: Sequelize.DATE,
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

    await queryInterface.addConstraint('discrepancias_conteo', {
      fields: ['inventarioId', 'zonaId', 'sku'],
      type: 'unique',
      name: 'discrepancias_conteo_unique_inventario_zona_sku'
    });

    await queryInterface.addIndex('discrepancias_conteo', ['estado']);
    await queryInterface.addIndex('discrepancias_conteo', ['inventarioId']);
    await queryInterface.addIndex('discrepancias_conteo', ['zonaId']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('discrepancias_conteo', ['zonaId']);
    await queryInterface.removeIndex('discrepancias_conteo', ['inventarioId']);
    await queryInterface.removeIndex('discrepancias_conteo', ['estado']);
    await queryInterface.removeConstraint(
      'discrepancias_conteo',
      'discrepancias_conteo_unique_inventario_zona_sku'
    );
    await queryInterface.dropTable('discrepancias_conteo');
  }
};