import { useEffect, useMemo, useState } from 'react';
import { createAsignacion, getAsignaciones } from '../../services/asignaciones.service';
import { getGrupos } from '../../services/grupos.service';
import { getInventarios } from '../../services/inventarios.service';
import { getZonas } from '../../services/zonas.service';

export default function AsignacionesPage() {
  const [inventarios, setInventarios] = useState([]);
  const [zonas, setZonas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);

  const [form, setForm] = useState({
    inventarioId: '',
    conteoTipo: 1,
    grupoId: '',
    zonaId: ''
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function boot() {
    const [inventariosData, zonasData] = await Promise.all([
      getInventarios(),
      getZonas()
    ]);

    setInventarios(inventariosData);
    setZonas(zonasData);

    const inventarioId = inventariosData[0]?.id || '';
    let gruposData = [];

    if (inventarioId) {
      gruposData = await getGrupos(inventarioId);
      setGrupos(gruposData);
      await loadAsignaciones(inventarioId, 1);
    }

    setForm({
      inventarioId,
      conteoTipo: 1,
      grupoId: gruposData[0]?.id || '',
      zonaId: zonasData[0]?.id || ''
    });
  }

  async function loadAsignaciones(inventarioId, conteoTipo) {
    if (!inventarioId) {
      setAsignaciones([]);
      return;
    }

    const data = await getAsignaciones({
      inventarioId,
      conteoTipo
    });

    setAsignaciones(data);
  }

  useEffect(() => {
    boot()
      .catch(() => setError('No se pudieron cargar los datos de asignaciones'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    async function reloadByInventario() {
      if (!form.inventarioId) {
        setGrupos([]);
        setAsignaciones([]);
        return;
      }

      try {
        const gruposData = await getGrupos(form.inventarioId);
        setGrupos(gruposData);

        setForm((prev) => ({
          ...prev,
          grupoId: gruposData[0]?.id || ''
        }));

        await loadAsignaciones(form.inventarioId, form.conteoTipo);
      } catch {
        setError('No se pudo actualizar el inventario seleccionado');
      }
    }

    if (!loading) {
      reloadByInventario();
    }
  }, [form.inventarioId]);

  useEffect(() => {
    if (!loading && form.inventarioId) {
      loadAsignaciones(form.inventarioId, form.conteoTipo).catch(() => {
        setError('No se pudieron cargar las asignaciones');
      });
    }
  }, [form.conteoTipo]);

  const zonasAsignadas = useMemo(() => {
    return asignaciones.map((a) => Number(a.zonaId));
  }, [asignaciones]);

  const gruposAsignados = useMemo(() => {
    return asignaciones.map((a) => Number(a.grupoId));
  }, [asignaciones]);

  const zonasDisponibles = zonas.filter((z) => !zonasAsignadas.includes(Number(z.id)));
  const gruposDisponibles = grupos.filter((g) => !gruposAsignados.includes(Number(g.id)));

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: Number(value)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      await createAsignacion({
        inventarioId: Number(form.inventarioId),
        conteoTipo: Number(form.conteoTipo),
        grupoId: Number(form.grupoId),
        zonaId: Number(form.zonaId)
      });

      setMessage('Asignación creada correctamente');
      await loadAsignaciones(form.inventarioId, form.conteoTipo);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al crear asignación');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="card">Cargando asignaciones...</div>;
  }

  return (
    <div className="grid-2">
      <div className="card">
        <h2>Crear asignación</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Inventario</label>
            <select
              name="inventarioId"
              value={form.inventarioId}
              onChange={handleChange}
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
            <label>Conteo</label>
            <select
              name="conteoTipo"
              value={form.conteoTipo}
              onChange={handleChange}
              required
            >
              <option value={1}>Conteo 1</option>
              <option value={2}>Conteo 2</option>
              <option value={3}>Conteo 3</option>
            </select>
          </div>

          <div className="form-group">
            <label>Grupo</label>
            <select
              name="grupoId"
              value={form.grupoId}
              onChange={handleChange}
              required
            >
              <option value="">Selecciona</option>
              {gruposDisponibles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Zona</label>
            <select
              name="zonaId"
              value={form.zonaId}
              onChange={handleChange}
              required
            >
              <option value="">Selecciona</option>
              {zonasDisponibles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre} ({item.codigo})
                </option>
              ))}
            </select>
          </div>

          {message ? <div className="alert-success">{message}</div> : null}
          {error ? <div className="alert-error">{error}</div> : null}

          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Guardando...' : 'Crear asignación'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Asignaciones del conteo</h2>

        {asignaciones.length === 0 ? (
          <p className="muted">No hay asignaciones para este inventario y conteo.</p>
        ) : (
          <div className="table-list">
            {asignaciones.map((item) => (
              <div key={item.id} className="list-row">
                <div>
                  <strong>{item.grupo?.nombre}</strong>
                  <p className="muted">
                    Zona: {item.zona?.nombre} ({item.zona?.codigo}) | Conteo {item.conteoTipo}
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