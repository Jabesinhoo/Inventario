import api from './api';

export async function compareInventariosDiferencias(params) {
  const response = await api.get('/diferencias', { params });
  return response.data.data;
}

export async function exportarDiferenciasExcel(params) {
  const response = await api.get('/diferencias/exportar', {
    params,
    responseType: 'blob'
  });

  const blob = new Blob([response.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `diferencias_${params.inventarioBaseId}_vs_${params.inventarioComparadoId}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}