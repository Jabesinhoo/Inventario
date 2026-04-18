import api from './api';

// ==================== CONTEOS INICIALES ====================

export async function importConteoInicialExcel(inventarioId, file) {
  const formData = new FormData();
  formData.append('inventarioId', inventarioId);
  formData.append('file', file);

  const response = await api.post('/conteo-inicial/import-excel', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });

  return response.data;
}

export async function getConteoInicialResumen(inventarioId) {
  const response = await api.get('/conteo-inicial/resumen', {
    params: { inventarioId }
  });
  return response.data.data;
}

export async function syncFromSqlServer(inventarioId, zonaId) {
  const response = await api.post('/conteo-inicial/sync-sqlserver', {
    inventarioId,
    zonaId
  });
  return response.data;
}

export async function exportConteoInicial(inventarioId) {
  const response = await api.get('/conteo-inicial/exportar', {
    params: { inventarioId },
    responseType: 'blob'
  });
  
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `conteo_inicial_${inventarioId}.xlsx`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// ==================== SQL SERVER (SOLO LECTURA) ====================

export async function getSqlServerProducts(params = {}) {
  const response = await api.get('/sqlserver-inventarios/productos', { params });
  return response.data.data;
}

export async function getSqlServerProductByCode(codigo) {
  const response = await api.get('/sqlserver-inventarios/producto', { params: { codigo } });
  return response.data.data;
}

export async function getSqlServerConnectionStatus() {
  try {
    const response = await api.get('/sqlserver-inventarios/status');
    return response.data.data;
  } catch (error) {
    console.error('Error al obtener estado de SQL Server:', error);
    return { connected: false, error: error.message };
  }
}

export async function getSqlServerTables() {
  const response = await api.get('/sqlserver-inventarios/tablas');
  return response.data.data;
}