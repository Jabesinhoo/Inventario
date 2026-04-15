import { useEffect, useState } from 'react';
import { createGrupo, getGrupos } from '../../services/grupos.service';
import { getInventarios } from '../../services/inventarios.service';

export default function GruposPage() {
  const [inventarios, setInventarios] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [inventarioFiltro, setInventarioFiltro] = useState('');
  const [form, setForm] = useState({
    inventarioId: '',
    nombre: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadInventarios() {
    const data = await getInventarios();
    setInventarios(data);
    if (data.length && !inventarioFiltro) {
      setInventarioFiltro(data[0].id);
      setForm((prev) => ({ ...prev, inventarioId: data[0].id }));
    }
  }

  async function loadGrupos(selectedInventarioId = inventarioFiltro) {
    if (!selectedInventarioId) {
      setGrupos([]);
      return;
    }

    const data = await getGrupos(selectedInventarioId);
    setGrupos(data);
  }

  useEffect(() => {
    async function init() {
      try {
        await loadInventarios();
      } catch (err) {
        setError('No se pudieron cargar los inventarios');
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  useEffect(() => {
    if (!inventarioFiltro) return;

    loadGrupos(inventarioFiltro).catch(() => {
      setError('No se pudieron cargar los grupos');
    });
  }, [inventarioFiltro]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      await createGrupo({
        inventarioId: Number(form.inventarioId),
        nombre: form.nombre
      });

      setMessage('Grupo creado correctamente');
      setForm((prev) => ({ ...prev, nombre: '' }));
      await loadGrupos(form.inventarioId);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al crear grupo');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="card">Cargando grupos...</div>;
  }

  return (
    <div className="grid-2">
      <div className="card">
        <h2>Crear grupo</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Inventario</label>
            <select
              value={form.inventarioId}
              onChange={(e) => {
                const value = Number(e.target.value);
                setForm((prev) => ({ ...prev, inventarioId: value }));
                setInventarioFiltro(value);
              }}
              required
            >
              <option value="">Selecciona</option>
              {inventarios.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre} - {item.fecha}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Nombre del grupo</label>
            <input
              value={form.nombre}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, nombre: e.target.value }))
              }
              placeholder="Grupo 1"
              required
            />
          </div>

          {message ? <div className="alert-success">{message}</div> : null}
          {error ? <div className="alert-error">{error}</div> : null}

          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Guardando...' : 'Crear grupo'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Listado de grupos</h2>

        <div className="form-group">
          <label>Filtrar por inventario</label>
          <select
            value={inventarioFiltro}
            onChange={(e) => setInventarioFiltro(Number(e.target.value))}
          >
            <option value="">Selecciona</option>
            {inventarios.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombre} - {item.fecha}
              </option>
            ))}
          </select>
        </div>

        <div className="table-list">
          {grupos.length === 0 ? (
            <p className="muted">No hay grupos para este inventario.</p>
          ) : (
            grupos.map((item) => (
              <div key={item.id} className="list-row">
                <div>
                  <strong>{item.nombre}</strong>
                  <p className="muted">Estado: {item.estado}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}