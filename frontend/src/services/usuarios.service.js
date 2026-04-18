import api from './api';

export async function getUsuarios() {
  const response = await api.get('/usuarios');
  return response.data.data;
}

export async function getUsuario(id) {
  const response = await api.get(`/usuarios/${id}`);
  return response.data.data;
}


export async function asignarUsuarioAGrupo(usuarioId, grupoId) {
  const response = await api.post('/usuarios/asignar-grupo', { usuarioId, grupoId });
  return response.data;
}