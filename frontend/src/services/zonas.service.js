import api from './api';

export async function getZonas() {
  const response = await api.get('/zonas');
  return response.data.data;
}

export async function createZona(payload) {
  const response = await api.post('/zonas', payload);
  return response.data.data;
}