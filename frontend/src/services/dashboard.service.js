import api from './api';

export async function getDashboard(params = {}) {
  const response = await api.get('/dashboard', { params });
  return response.data.data;
}

export async function getDashboardResumen(params = {}) {
  const response = await api.get('/dashboard/resumen', { params });
  return response.data.data;
}

export async function exportarDashboardExcel(params = {}) {
  const response = await api.get('/dashboard/exportar', {
    params,
    responseType: 'blob'
  });
  
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `dashboard_${new Date().toISOString().slice(0,19)}.xlsx`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}