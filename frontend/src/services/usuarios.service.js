import api from './api';

export async function getUsuarios() {
  const response = await api.get('/usuarios');
  return response.data.data;
}

export async function getRolesUsuarios() {
  const response = await api.get('/usuarios/roles');
  return response.data.data;
}

export async function createUsuario(payload) {
  const response = await api.post('/usuarios', payload);
  return response.data.data;
}

export async function updateUsuario(id, payload) {
  const response = await api.put(`/usuarios/${id}`, payload);
  return response.data.data;
}

export async function updateEstadoUsuario(id, activo) {
  const response = await api.patch(`/usuarios/${id}/estado`, { activo });
  return response.data;
}