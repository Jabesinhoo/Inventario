import api from './api';

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