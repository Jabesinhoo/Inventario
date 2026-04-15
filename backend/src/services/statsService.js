const Stats = require('../models/Stats');

const statsService = {
  async getDashboardStats() {
    const general = await Stats.getGeneralStats();
    const rankingUsuarios = await Stats.getUserRanking();
    const rankingGrupos = await Stats.getGroupRanking();
    const sesionesRecientes = await Stats.getRecentSessions();
    const gruposTop = await Stats.getTopGroupsByProducts();
    
    return {
      general,
      ranking_usuarios: rankingUsuarios,
      ranking_grupos: rankingGrupos,
      sesiones_usuario: sesionesRecientes,
      grupos_top_productos: gruposTop
    };
  },

  async getUserStats(userId) {
    return await Stats.getUserStats(userId);
  },

  async getGroupStats(groupId) {
    return await Stats.getGroupStats(groupId);
  },

  async getProductivityRanking(limit) {
    return await Stats.getProductivityRanking(limit);
  }
};

module.exports = statsService;