import { useEffect, useMemo, useState } from 'react';
import {
  Layers3,
  PlusCircle,
  RefreshCw,
  Play,
  Pause,
  RotateCcw,
  Lock,
  MapPin,
  Boxes,
  Users
} from 'lucide-react';
import { getInventarios } from '../../services/inventarios.service';
import { getGrupos } from '../../services/grupos.service';

import {
  getRondas,
  createRonda,
  iniciarRonda,
  pausarRonda,
  reanudarRonda,
  cerrarRonda,
  reabrirRonda
} from '../../services/rondas.service';
export default function RondasPage() {
  const [inventarios, setInventarios] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [rondas, setRondas] = useState([]);

  const [inventarioFiltro, setInventarioFiltro] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    inventarioId: '',
    grupoId: '',
    tipoRonda: 'completa',
    observaciones: ''
  });

  async function loadBaseData() {
    try {
      const inventariosData = await getInventarios();
      setInventarios(inventariosData || []);

      if (inventariosData?.length > 0) {
        const firstInventarioId = inventariosData[0].id;
        setInventarioFiltro((prev) => prev || firstInventarioId);
        setForm((prev) => ({
          ...prev,
          inventarioId: prev.inventarioId || firstInventarioId
        }));
      }
    } catch (err) {
      setError('No se pudieron cargar los inventarios');
    } finally {
      setLoading(false);
    }
  }

  async function loadData(inventarioId, { silent = false } = {}) {
    if (!inventarioId) {
      setGrupos([]);
      setRondas([]);
      return;
    }

    if (!silent) setRefreshing(true);

    try {
      const [gruposData, rondasData] = await Promise.all([
        getGrupos(inventarioId),
        getRondas({ inventarioId })
      ]);

      setGrupos(gruposData || []);
      setRondas(rondasData || []);
    } catch (err) {
      setError('No se pudieron cargar grupos y rondas');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadBaseData();
  }, []);

  useEffect(() => {
    if (inventarioFiltro) {
      loadData(inventarioFiltro);
    }
  }, [inventarioFiltro]);

  const gruposDelInventario = useMemo(() => {
    return grupos.filter((g) => Number(g.inventarioId) === Number(inventarioFiltro));
  }, [grupos, inventarioFiltro]);

  const grupoSeleccionado = useMemo(() => {
    return gruposDelInventario.find((g) => Number(g.id) === Number(form.grupoId)) || null;
  }, [gruposDelInventario, form.grupoId]);

  async function handleCreateRonda(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      if (!form.grupoId) {
        setError('Debes seleccionar un grupo');
        return;
      }

      await createRonda({
        grupoId: Number(form.grupoId),
        tipoRonda: form.tipoRonda,
        observaciones: form.observaciones?.trim() || null
      });

      setMessage('Ronda creada correctamente');
      setForm((prev) => ({
        ...prev,
        grupoId: '',
        tipoRonda: 'completa',
        observaciones: ''
      }));

      await loadData(inventarioFiltro, { silent: true });
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo crear la ronda');
    } finally {
      setSaving(false);
    }
  }

  async function handleEstado(ronda, accion) {
    setError('');
    setMessage('');

    try {
      if (accion === 'iniciar') {
        await iniciarRonda(ronda.id);
        setMessage(`Ronda ${ronda.numeroRonda} iniciada`);
      } else if (accion === 'pausar') {
        await pausarRonda(ronda.id);
        setMessage(`Ronda ${ronda.numeroRonda} pausada`);
      } else if (accion === 'reanudar') {
        await reanudarRonda(ronda.id);
        setMessage(`Ronda ${ronda.numeroRonda} reanudada`);
      } else if (accion === 'cerrar') {
        const ok = window.confirm('¿Cerrar esta ronda?');
        if (!ok) return;
        await cerrarRonda(ronda.id);
        setMessage(`Ronda ${ronda.numeroRonda} cerrada`);
      } else if (accion === 'reabrir') {
        const ok = window.confirm('¿Reabrir esta ronda? Quedará en estado pausada.');
        if (!ok) return;
        await reabrirRonda(ronda.id);
        setMessage(`Ronda ${ronda.numeroRonda} reabierta`);
      }

      await loadData(inventarioFiltro, { silent: true });
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo actualizar la ronda');
    }
  }

  function getEstadoBadgeClass(estado) {
    if (estado === 'activa') return 'success';
    if (estado === 'pausada') return 'warning';
    if (estado === 'cerrada') return 'danger';
    return 'info';
  }

  if (loading) {
    return <div className="card">Cargando rondas...</div>;
  }

  return (
    <div className="dashboard-container">
      <div className="grid-2">
        <div className="card">
          <div className="list-header">
            <h2 className="section-title">
              <PlusCircle size={20} />
              <span>Crear ronda</span>
            </h2>
          </div>

          <form onSubmit={handleCreateRonda}>
            <div className="form-group">
              <label>Inventario</label>
              <select
                value={form.inventarioId}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setForm((prev) => ({
                    ...prev,
                    inventarioId: value,
                    grupoId: ''
                  }));
                  setInventarioFiltro(value);
                }}
                required
              >
                <option value="">Selecciona un inventario</option>
                {inventarios.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre} - {item.fecha}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Grupo</label>
              <select
                value={form.grupoId}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    grupoId: Number(e.target.value) || ''
                  }))
                }
                required
              >
                <option value="">Selecciona un grupo</option>
                {gruposDelInventario.map((grupo) => (
                  <option key={grupo.id} value={grupo.id}>
                    {grupo.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Zona del grupo</label>
              <input
                value={
                  grupoSeleccionado?.zonaAsignada
                    ? `${grupoSeleccionado.zonaAsignada.nombre} (${grupoSeleccionado.zonaAsignada.codigo || 'sin código'})`
                    : 'El grupo no tiene zona asignada'
                }
                disabled
              />
            </div>

            <div className="form-group">
              <label>Tipo de ronda</label>
              <select
                value={form.tipoRonda}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, tipoRonda: e.target.value }))
                }
              >
                <option value="completa">Completa</option>
                <option value="reconteo">Reconteo</option>
              </select>
            </div>

            <div className="form-group">
              <label>Observaciones</label>
              <textarea
                rows="3"
                value={form.observaciones}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, observaciones: e.target.value }))
                }
                placeholder="Opcional"
              />
            </div>

            {message ? <div className="alert-success">{message}</div> : null}
            {error ? <div className="alert-error">{error}</div> : null}

            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>
                <PlusCircle size={16} />
                <span>{saving ? 'Guardando...' : 'Crear ronda'}</span>
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="list-header">
            <h2 className="section-title">
              <Boxes size={20} />
              <span>Resumen</span>
            </h2>

            <button className="btn btn-outline" onClick={() => loadData(inventarioFiltro)}>
              <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
              <span>Actualizar</span>
            </button>
          </div>

          <div className="form-group filter-group">
            <label>Filtrar por inventario</label>
            <select
              value={inventarioFiltro}
              onChange={(e) => {
                const value = Number(e.target.value);
                setInventarioFiltro(value);
                setForm((prev) => ({ ...prev, inventarioId: value, grupoId: '' }));
              }}
            >
              <option value="">Selecciona</option>
              {inventarios.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="kpi-grid" style={{ marginTop: '12px' }}>
            <div className="card kpi-card">
              <div className="kpi-icon">
                <Layers3 size={20} />
              </div>
              <div className="kpi-content">
                <p className="kpi-title">Rondas</p>
                <h3 className="kpi-value">{rondas.length}</h3>
              </div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-icon">
                <Users size={20} />
              </div>
              <div className="kpi-content">
                <p className="kpi-title">Grupos</p>
                <h3 className="kpi-value">{gruposDelInventario.length}</h3>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="list-header">
          <h2 className="section-title">
            <Layers3 size={20} />
            <span>Rondas registradas</span>
          </h2>
        </div>

        {rondas.length === 0 ? (
          <p className="muted">No hay rondas creadas para este inventario.</p>
        ) : (
          <div className="table-list">
            {rondas.map((ronda) => (
              <div key={ronda.id} className="list-row compact-row">
                <div className="flex-1">
                  <div className="grupo-header">
                    <strong>Ronda {ronda.numeroRonda}</strong>
                    <span className={`status-badge ${getEstadoBadgeClass(ronda.estado)}`}>
                      {ronda.estado}
                    </span>
                    <span className="codigo-badge">
                      {ronda.tipoRonda === 'reconteo' ? 'Reconteo' : 'Completa'}
                    </span>
                  </div>

                  <div className="zona-meta" style={{ marginTop: '8px' }}>
                    <span className="zona-nombre">
                      Zona: {ronda.zona?.nombre || 'Sin zona'}
                    </span>
                    <span className="zona-codigo">
                      {ronda.zona?.codigo || 'Sin código'}
                    </span>
                  </div>

                  <p className="muted" style={{ marginTop: '6px' }}>
                    Grupo asignado:{' '}
                    <strong>{ronda.asignacion?.grupo?.nombre || 'Sin grupo'}</strong>
                  </p>

                  {ronda.observaciones ? (
                    <p className="muted" style={{ marginTop: '4px' }}>
                      {ronda.observaciones}
                    </p>
                  ) : null}
                </div>

                <div className="zona-actions">
                  {ronda.estado === 'borrador' ? (
                    <button
                      className="btn btn-primary"
                      onClick={() => handleEstado(ronda, 'iniciar')}
                    >
                      <Play size={16} />
                      <span>Iniciar</span>
                    </button>
                  ) : null}

                  {ronda.estado === 'activa' ? (
                    <>
                      <button
                        className="btn btn-outline"
                        onClick={() => handleEstado(ronda, 'pausar')}
                      >
                        <Pause size={16} />
                        <span>Pausar</span>
                      </button>

                      <button
                        className="btn btn-danger"
                        onClick={() => handleEstado(ronda, 'cerrar')}
                      >
                        <Lock size={16} />
                        <span>Cerrar</span>
                      </button>
                    </>
                  ) : null}

                  {ronda.estado === 'pausada' ? (
                    <>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleEstado(ronda, 'reanudar')}
                      >
                        <RotateCcw size={16} />
                        <span>Reanudar</span>
                      </button>

                      <button
                        className="btn btn-danger"
                        onClick={() => handleEstado(ronda, 'cerrar')}
                      >
                        <Lock size={16} />
                        <span>Cerrar</span>
                      </button>
                    </>
                  ) : null}

                  {ronda.estado === 'cerrada' ? (
                    <button
                      className="btn btn-outline"
                      onClick={() => handleEstado(ronda, 'reabrir')}
                    >
                      <RotateCcw size={16} />
                      <span>Reabrir</span>
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}