import api from './api';

export async function getDashboardSupervisor(inventarioId) {
  const response = await api.get('/supervisor/dashboard', {
    params: { inventarioId }
  });
  return response.data.data;
}

export async function getAlertasRealtime(inventarioId, desde = null) {
  const params = { inventarioId };
  if (desde) params.desde = desde;
  
  const response = await api.get('/supervisor/alertas', { params });
  return response.data.data;
}

export async function getGrupoDetalle(grupoId, inventarioId) {
  const response = await api.get('/supervisor/grupo-detalle', {
    params: { grupoId, inventarioId }
  });
  return response.data.data;
}