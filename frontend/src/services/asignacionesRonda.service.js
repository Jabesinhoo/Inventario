import api from './api';

export async function getAsignacionesRonda(params = {}) {
  const response = await api.get('/asignaciones-ronda', { params });
  return response.data.data;
}

export async function createAsignacionRonda(payload) {
  const response = await api.post('/asignaciones-ronda', payload);
  return response.data.data;
}