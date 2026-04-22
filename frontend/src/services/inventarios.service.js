import api from './api';

export async function getInventarios() {
  const response = await api.get('/inventarios');
  return response.data.data;
}

export async function createInventario(payload) {
  const response = await api.post('/inventarios', payload);
  return response.data.data;
}

export async function updateInventario(id, payload) {
  const response = await api.put(`/inventarios/${id}`, payload);
  return response.data.data;
}

export async function deleteInventario(id) {
  const response = await api.delete(`/inventarios/${id}`);
  return response.data;
}