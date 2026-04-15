import api from './api';

export async function scanLectura(payload) {
  const response = await api.post('/lecturas/scan', payload);
  return response.data;
}