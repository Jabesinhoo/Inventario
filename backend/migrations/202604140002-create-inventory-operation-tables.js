'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('grupos', {
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
      nombre: {
        type: Sequelize.STRING(120),
        allowNull: false
      },
      estado: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'activo'
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

    await queryInterface.addConstraint('grupos', {
      fields: ['inventarioId', 'nombre'],
      type: 'unique',
      name: 'grupos_inventarioId_nombre_unique'
    });

    await queryInterface.createTable('productos', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      sku: {
        type: Sequelize.STRING(80),
        allowNull: false,
        unique: true
      },
      codigoBarra: {
        type: Sequelize.STRING(120),
        allowNull: false,
        unique: true
      },
      codigoQr: {
        type: Sequelize.STRING(120),
        allowNull: true,
        unique: true
      },
      descripcion: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      categoria: {
        type: Sequelize.STRING(120),
        allowNull: true
      },
      activo: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
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

    await queryInterface.createTable('asignaciones_conteo', {
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
      conteoTipo: {
        type: Sequelize.INTEGER,
        allowNull: false
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
      zonaId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'zonas',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
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

    await queryInterface.addConstraint('asignaciones_conteo', {
      fields: ['inventarioId', 'conteoTipo', 'grupoId', 'zonaId'],
      type: 'unique',
      name: 'asignaciones_conteo_unique'
    });

    await queryInterface.createTable('lecturas', {
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
      conteoTipo: {
        type: Sequelize.INTEGER,
        allowNull: false
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
      usuarioId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'usuarios',
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
        allowNull: true
      },
      codigoLeido: {
        type: Sequelize.STRING(120),
        allowNull: false
      },
      descripcionSnapshot: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      cantidad: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      estado: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'valida'
      },
      fechaHora: {
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

    await queryInterface.addIndex('lecturas', ['inventarioId']);
    await queryInterface.addIndex('lecturas', ['conteoTipo']);
    await queryInterface.addIndex('lecturas', ['zonaId']);
    await queryInterface.addIndex('lecturas', ['grupoId']);
    await queryInterface.addIndex('lecturas', ['usuarioId']);
    await queryInterface.addIndex('lecturas', ['sku']);
    await queryInterface.addIndex('lecturas', ['codigoLeido']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('lecturas', ['codigoLeido']);
    await queryInterface.removeIndex('lecturas', ['sku']);
    await queryInterface.removeIndex('lecturas', ['usuarioId']);
    await queryInterface.removeIndex('lecturas', ['grupoId']);
    await queryInterface.removeIndex('lecturas', ['zonaId']);
    await queryInterface.removeIndex('lecturas', ['conteoTipo']);
    await queryInterface.removeIndex('lecturas', ['inventarioId']);

    await queryInterface.dropTable('lecturas');
    await queryInterface.removeConstraint('asignaciones_conteo', 'asignaciones_conteo_unique');
    await queryInterface.dropTable('asignaciones_conteo');
    await queryInterface.dropTable('productos');
    await queryInterface.removeConstraint('grupos', 'grupos_inventarioId_nombre_unique');
    await queryInterface.dropTable('grupos');
  }
};