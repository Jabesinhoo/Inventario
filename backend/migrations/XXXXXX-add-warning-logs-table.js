// migrations/XXXXXX-add-warning-logs-table.js

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('warning_logs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      tipo: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'producto_en_otra_zona'
      },
      ronda_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'rondas_conteo',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      sku: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      zona_actual_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'zonas',
          key: 'id'
        }
      },
      zona_actual_nombre: {
        type: Sequelize.STRING(120),
        allowNull: false
      },
      grupo_actual_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'grupos',
          key: 'id'
        }
      },
      grupo_actual_nombre: {
        type: Sequelize.STRING(120),
        allowNull: false
      },
      cantidad_actual: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      zona_otra_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'zonas',
          key: 'id'
        }
      },
      zona_otra_nombre: {
        type: Sequelize.STRING(120),
        allowNull: false
      },
      grupo_otro_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'grupos',
          key: 'id'
        }
      },
      grupo_otro_nombre: {
        type: Sequelize.STRING(120),
        allowNull: false
      },
      cantidad_otra_zona: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      usuario_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'usuarios',
          key: 'id'
        }
      },
      usuario_nombre: {
        type: Sequelize.STRING(120),
        allowNull: false
      },
      creado_en: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Índices para búsqueda rápida
    await queryInterface.addIndex('warning_logs', ['ronda_id']);
    await queryInterface.addIndex('warning_logs', ['sku']);
    await queryInterface.addIndex('warning_logs', ['creado_en']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('warning_logs');
  }
};