import { useEffect, useState } from 'react';
import { createZona, getZonas } from '../../services/zonas.service';

export default function ZonasPage() {
  const [zonas, setZonas] = useState([]);
  const [form, setForm] = useState({
    nombre: '',
    codigo: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadZonas() {
    const data = await getZonas();
    setZonas(data);
  }

  useEffect(() => {
    loadZonas()
      .catch(() => setError('No se pudieron cargar las zonas'))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      await createZona(form);
      setMessage('Zona creada correctamente');
      setForm({ nombre: '', codigo: '' });
      await loadZonas();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al crear zona');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid-2">
      <div className="card">
        <h2>Crear zona</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nombre</label>
            <input
              value={form.nombre}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, nombre: e.target.value }))
              }
              placeholder="Bodega Central"
              required
            />
          </div>

          <div className="form-group">
            <label>Código</label>
            <input
              value={form.codigo}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, codigo: e.target.value }))
              }
              placeholder="BOD-CEN"
              required
            />
          </div>

          {message ? <div className="alert-success">{message}</div> : null}
          {error ? <div className="alert-error">{error}</div> : null}

          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Guardando...' : 'Crear zona'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Zonas</h2>

        {loading ? (
          <p>Cargando...</p>
        ) : zonas.length === 0 ? (
          <p className="muted">No hay zonas registradas.</p>
        ) : (
          <div className="table-list">
            {zonas.map((item) => (
              <div key={item.id} className="list-row">
                <div>
                  <strong>{item.nombre}</strong>
                  <p className="muted">
                    Código: {item.codigo} | Activa: {item.activa ? 'Sí' : 'No'}
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