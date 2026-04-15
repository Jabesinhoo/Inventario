import { useEffect, useState } from 'react';
import {
  createProducto,
  getProductos,
  importProductosExcel
} from '../../services/productos.service';

export default function ProductosPage() {
  const [productos, setProductos] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    sku: '',
    codigoBarra: '',
    codigoQr: '',
    descripcion: '',
    categoria: ''
  });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [importResult, setImportResult] = useState(null);

  async function loadProductos(query = '') {
    const data = await getProductos(query);
    setProductos(data);
  }

  useEffect(() => {
    loadProductos()
      .catch(() => setError('No se pudieron cargar los productos'))
      .finally(() => setLoading(false));
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await loadProductos(search);
    } catch {
      setError('No se pudo buscar productos');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      await createProducto(form);
      setMessage('Producto creado correctamente');
      setForm({
        sku: '',
        codigoBarra: '',
        codigoQr: '',
        descripcion: '',
        categoria: ''
      });
      await loadProductos(search);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al crear producto');
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Selecciona un archivo Excel');
      return;
    }

    setImporting(true);
    setError('');
    setMessage('');
    setImportResult(null);

    try {
      const result = await importProductosExcel(file);
      setImportResult(result.data);
      setMessage(result.message || 'Importación completada');
      setFile(null);
      await loadProductos(search);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al importar Excel');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="grid-stack">
      <div className="grid-2">
        <div className="card">
          <h2>Crear producto</h2>

          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label>SKU</label>
              <input
                value={form.sku}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, sku: e.target.value }))
                }
                required
              />
            </div>

            <div className="form-group">
              <label>Código de barra</label>
              <input
                value={form.codigoBarra}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, codigoBarra: e.target.value }))
                }
                required
              />
            </div>

            <div className="form-group">
              <label>Código QR</label>
              <input
                value={form.codigoQr}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, codigoQr: e.target.value }))
                }
              />
            </div>

            <div className="form-group">
              <label>Descripción</label>
              <input
                value={form.descripcion}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, descripcion: e.target.value }))
                }
                required
              />
            </div>

            <div className="form-group">
              <label>Categoría</label>
              <input
                value={form.categoria}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, categoria: e.target.value }))
                }
              />
            </div>

            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Guardando...' : 'Crear producto'}
            </button>
          </form>
        </div>

        <div className="card">
          <h2>Importar productos desde Excel</h2>

          <form onSubmit={handleImport}>
            <div className="form-group">
              <label>Archivo .xlsx</label>
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>

            <button
              className="btn btn-primary"
              type="submit"
              disabled={importing}
            >
              {importing ? 'Importando...' : 'Importar Excel'}
            </button>
          </form>

          {importResult ? (
            <div className="import-summary">
              <p><strong>Leídos:</strong> {importResult.totalLeidos}</p>
              <p><strong>Insertados:</strong> {importResult.insertados}</p>
              <p><strong>Actualizados:</strong> {importResult.actualizados}</p>
              <p><strong>Errores filas:</strong> {importResult.erroresFilas?.length || 0}</p>
              <p><strong>Errores conflicto:</strong> {importResult.erroresConflicto?.length || 0}</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="card">
        <h2>Productos</h2>

        <form className="search-row" onSubmit={handleSearch}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por SKU, código o descripción"
          />
          <button className="btn btn-primary" type="submit">
            Buscar
          </button>
        </form>

        {message ? <div className="alert-success">{message}</div> : null}
        {error ? <div className="alert-error">{error}</div> : null}

        {loading ? (
          <p>Cargando...</p>
        ) : productos.length === 0 ? (
          <p className="muted">No hay productos registrados.</p>
        ) : (
          <div className="table-list">
            {productos.map((item) => (
              <div key={item.id} className="list-row">
                <div>
                  <strong>{item.descripcion}</strong>
                  <p className="muted">
                    SKU: {item.sku} | Barra: {item.codigoBarra}
                    {item.categoria ? ` | Categoría: ${item.categoria}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}