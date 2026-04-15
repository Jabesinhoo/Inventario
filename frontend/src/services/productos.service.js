import api from './api';

export async function getProductos(q = '') {
  const response = await api.get('/productos', {
    params: q ? { q } : {}
  });
  return response.data.data;
}

export async function createProducto(payload) {
  const response = await api.post('/productos', payload);
  return response.data.data;
}

export async function importProductosExcel(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post('/productos/import-excel', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });

  return response.data;
}