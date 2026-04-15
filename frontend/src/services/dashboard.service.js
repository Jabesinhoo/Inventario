import api from './api';

export async function getDashboard(params = {}) {
  const response = await api.get('/dashboard', { params });
  return response.data.data;
}