import { useEffect, useState } from 'react';
import {
  createInventario,
  getInventarios
} from '../../services/inventarios.service';

export default function InventariosPage() {
  const [inventarios, setInventarios] = useState([]);
  const [form, setForm] = useState({
    nombre: '',
    fecha: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadInventarios() {
    const data = await getInventarios();
    setInventarios(data);
  }

  useEffect(() => {
    loadInventarios()
      .catch(() => setError('No se pudieron cargar los inventarios'))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      await createInventario(form);
      setMessage('Inventario creado correctamente');
      setForm({ nombre: '', fecha: '' });
      await loadInventarios();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al crear inventario');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid-2">
      <div className="card">
        <h2>Crear inventario</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nombre</label>
            <input
              value={form.nombre}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, nombre: e.target.value }))
              }
              placeholder="Inventario Semestral 2026-1"
              required
            />
          </div>

          <div className="form-group">
            <label>Fecha</label>
            <input
              type="date"
              value={form.fecha}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, fecha: e.target.value }))
              }
              required
            />
          </div>

          {message ? <div className="alert-success">{message}</div> : null}
          {error ? <div className="alert-error">{error}</div> : null}

          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Guardando...' : 'Crear inventario'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Inventarios</h2>

        {loading ? (
          <p>Cargando...</p>
        ) : inventarios.length === 0 ? (
          <p className="muted">No hay inventarios registrados.</p>
        ) : (
          <div className="table-list">
            {inventarios.map((item) => (
              <div key={item.id} className="list-row">
                <div>
                  <strong>{item.nombre}</strong>
                  <p className="muted">
                    Fecha: {item.fecha} | Estado: {item.estado}
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