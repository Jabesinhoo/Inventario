import api from './api';

export async function compareInventariosDiferencias(params) {
  const cleanParams = {
    inventarioBaseId: params.inventarioBaseId,
    inventarioComparadoId: params.inventarioComparadoId
  };

  if (params.zonaBaseId) cleanParams.zonaBaseId = params.zonaBaseId;
  if (params.zonaComparadaId) cleanParams.zonaComparadaId = params.zonaComparadaId;

  const response = await api.get('/diferencias', {
    params: cleanParams
  });

  return response.data.data;
}

export async function exportarDiferenciasExcel(params) {
  const cleanParams = {
    inventarioBaseId: params.inventarioBaseId,
    inventarioComparadoId: params.inventarioComparadoId
  };

  if (params.zonaBaseId) cleanParams.zonaBaseId = params.zonaBaseId;
  if (params.zonaComparadaId) cleanParams.zonaComparadaId = params.zonaComparadaId;

  const response = await api.get('/diferencias/exportar', {
    params: cleanParams,
    responseType: 'blob'
  });

  const blob = new Blob([response.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `diferencias_${cleanParams.inventarioBaseId}_vs_${cleanParams.inventarioComparadoId}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// NUEVA FUNCIÓN: Generar ronda de reconteo desde comparación
export async function generarRondaReconteoDesdeComparacion(data) {
  const response = await api.post('/diferencias/reconteo', {
    inventarioBaseId: data.inventarioBaseId,
    inventarioComparadoId: data.inventarioComparadoId,
    zonaId: data.zonaId
  });
  
  return response;
}
