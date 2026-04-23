import { useEffect, useMemo, useState } from 'react';
import {
  Layers3,
  PlusCircle,
  RefreshCw,
  Link2,
  Play,
  Pause,
  RotateCcw,
  Lock,
  MapPin,
  Boxes
} from 'lucide-react';
import { getInventarios } from '../../services/inventarios.service';
import { getZonas } from '../../services/zonas.service';
import { getGrupos } from '../../services/grupos.service';
import {
  getRondas,
  createRonda,
  iniciarRonda,
  pausarRonda,
  reanudarRonda,
  cerrarRonda
} from '../../services/rondas.service';
import { createAsignacionRonda } from '../../services/asignacionesRonda.service';

export default function RondasPage() {
  const [inventarios, setInventarios] = useState([]);
  const [zonas, setZonas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [rondas, setRondas] = useState([]);

  const [inventarioFiltro, setInventarioFiltro] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [asignacionDraft, setAsignacionDraft] = useState({});

  const [form, setForm] = useState({
    inventarioId: '',
    zonaId: '',
    tipoRonda: 'completa',
    observaciones: ''
  });

  async function loadBaseData() {
    try {
      const [inventariosData, zonasData] = await Promise.all([
        getInventarios(),
        getZonas()
      ]);

      setInventarios(inventariosData || []);
      setZonas(zonasData || []);

      if (inventariosData?.length > 0) {
        const firstInventarioId = inventariosData[0].id;
        setInventarioFiltro((prev) => prev || firstInventarioId);
        setForm((prev) => ({
          ...prev,
          inventarioId: prev.inventarioId || firstInventarioId
        }));
      }
    } catch (err) {
      setError('No se pudieron cargar los datos base');
    } finally {
      setLoading(false);
    }
  }

  async function loadGruposYRounds(inventarioId, { silent = false } = {}) {
    if (!inventarioId) {
      setGrupos([]);
      setRondas([]);
      return;
    }

    if (!silent) {
      setRefreshing(true);
    }

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
      loadGruposYRounds(inventarioFiltro);
    }
  }, [inventarioFiltro]);

  const rondasFiltradas = useMemo(() => {
    return [...rondas].sort((a, b) => {
      if (Number(a.zonaId) !== Number(b.zonaId)) {
        return Number(a.zonaId) - Number(b.zonaId);
      }
      return Number(a.numeroRonda) - Number(b.numeroRonda);
    });
  }, [rondas]);

  const gruposDelInventario = useMemo(() => {
    return grupos.filter((g) => Number(g.inventarioId) === Number(inventarioFiltro));
  }, [grupos, inventarioFiltro]);

  function getSiguienteNumeroRonda(zonaId) {
    const rondasZona = rondas.filter((r) => Number(r.zonaId) === Number(zonaId));
    const maxNumero = rondasZona.reduce((max, r) => Math.max(max, Number(r.numeroRonda || 0)), 0);
    return maxNumero + 1;
  }

  function getUltimaRondaZona(zonaId) {
    const rondasZona = rondas
      .filter((r) => Number(r.zonaId) === Number(zonaId))
      .sort((a, b) => Number(b.numeroRonda) - Number(a.numeroRonda));

    return rondasZona[0] || null;
  }

  async function handleCreateRonda(e) {
    e.preventDefault();

    if (!form.inventarioId || !form.zonaId) {
      setError('Debes seleccionar inventario y zona');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const ultimaRondaZona = getUltimaRondaZona(form.zonaId);

      const payload = {
        inventarioId: Number(form.inventarioId),
        zonaId: Number(form.zonaId),
        numeroRonda: getSiguienteNumeroRonda(form.zonaId),
        tipoRonda: form.tipoRonda,
        generadaDesdeRondaId:
          form.tipoRonda === 'reconteo' && ultimaRondaZona ? ultimaRondaZona.id : null,
        observaciones: form.observaciones?.trim() || null
      };

      await createRonda(payload);

      setMessage('Ronda creada correctamente');
      setForm((prev) => ({
        ...prev,
        zonaId: '',
        tipoRonda: 'completa',
        observaciones: ''
      }));

      await loadGruposYRounds(inventarioFiltro, { silent: true });
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo crear la ronda');
    } finally {
      setSaving(false);
    }
  }

  async function handleAsignarGrupo(rondaId) {
    const grupoId = asignacionDraft[rondaId];

    if (!grupoId) {
      setError('Debes seleccionar un grupo');
      return;
    }

    setError('');
    setMessage('');

    try {
      await createAsignacionRonda({
        rondaId: Number(rondaId),
        grupoId: Number(grupoId)
      });

      setMessage('Grupo asignado correctamente a la ronda');
      setAsignacionDraft((prev) => ({ ...prev, [rondaId]: '' }));
      await loadGruposYRounds(inventarioFiltro, { silent: true });
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo asignar el grupo');
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
      }

      await loadGruposYRounds(inventarioFiltro, { silent: true });
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
                  setForm((prev) => ({ ...prev, inventarioId: value, zonaId: '' }));
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
              <label>Zona</label>
              <select
                value={form.zonaId}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, zonaId: Number(e.target.value) || '' }))
                }
                required
              >
                <option value="">Selecciona una zona</option>
                {zonas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre} ({item.codigo})
                  </option>
                ))}
              </select>
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
              <label>Número sugerido</label>
              <input
                value={form.zonaId ? getSiguienteNumeroRonda(form.zonaId) : ''}
                disabled
                placeholder="Selecciona una zona"
              />
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

            <button className="btn btn-outline" onClick={() => loadGruposYRounds(inventarioFiltro)}>
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
                setForm((prev) => ({ ...prev, inventarioId: value }));
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
                <h3 className="kpi-value">{rondasFiltradas.length}</h3>
              </div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-icon">
                <MapPin size={20} />
              </div>
              <div className="kpi-content">
                <p className="kpi-title">Zonas activas</p>
                <h3 className="kpi-value">
                  {new Set(rondasFiltradas.map((r) => r.zonaId)).size}
                </h3>
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

        {rondasFiltradas.length === 0 ? (
          <p className="muted">No hay rondas creadas para este inventario.</p>
        ) : (
          <div className="table-list">
            {rondasFiltradas.map((ronda) => (
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
                    <strong>{ronda.asignacion?.grupo?.nombre || 'Sin asignar'}</strong>
                  </p>

                  {ronda.observaciones ? (
                    <p className="muted" style={{ marginTop: '4px' }}>
                      {ronda.observaciones}
                    </p>
                  ) : null}
                </div>

                <div className="zona-actions">
                  {!ronda.asignacion?.grupo ? (
                    <div className="select-row">
                      <select
                        value={asignacionDraft[ronda.id] || ''}
                        onChange={(e) =>
                          setAsignacionDraft((prev) => ({
                            ...prev,
                            [ronda.id]: Number(e.target.value) || ''
                          }))
                        }
                      >
                        <option value="">Asignar grupo</option>
                        {gruposDelInventario.map((grupo) => (
                          <option key={grupo.id} value={grupo.id}>
                            {grupo.nombre}
                          </option>
                        ))}
                      </select>

                      <button
                        className="btn btn-outline"
                        onClick={() => handleAsignarGrupo(ronda.id)}
                      >
                        <Link2 size={16} />
                        <span>Asignar</span>
                      </button>
                    </div>
                  ) : null}

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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}