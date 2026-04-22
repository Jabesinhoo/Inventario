import api from './api';

export async function getZonas() {
  const response = await api.get('/zonas');
  return response.data.data;
}

export async function createZona(payload) {
  const response = await api.post('/zonas', payload);
  return response.data.data;
}

export async function updateZona(id, payload) {
  const response = await api.put(`/zonas/${id}`, payload);
  return response.data.data;
}

export async function deleteZona(id) {
  const response = await api.delete(`/zonas/${id}`);
  return response.data;
}