// frontend/src/services/etiqueta.service.js
import api from './api';

export async function getEtiquetasSku(sku) {
  try {
    const response = await api.get(`/sku-etiquetas/${sku}`);
    return response.data.data || [];
  } catch (error) {
    console.warn('No se pudieron cargar etiquetas del SKU:', error.response?.data || error.message);
    return [];
  }
}

export async function upsertEtiquetaSku(payload) {
  const response = await api.post('/sku-etiquetas/upsert', payload);
  return response.data;
}

export async function deleteEtiquetaSku(id) {
  const response = await api.delete(`/sku-etiquetas/${id}`);
  return response.data;
}