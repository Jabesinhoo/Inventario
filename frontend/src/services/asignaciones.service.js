import api from './api';

export async function getAsignaciones(params = {}) {
  const response = await api.get('/asignaciones', { params });
  return response.data.data;
}

export async function createAsignacion(payload) {
  const response = await api.post('/asignaciones', payload);
  return response.data.data;
}

export async function deleteAsignacion(id) {
  const response = await api.delete(`/asignaciones/${id}`);
  return response.data;
}