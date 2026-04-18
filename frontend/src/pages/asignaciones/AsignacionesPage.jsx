import { useEffect, useState } from 'react';
import { 
  Tags, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Users, 
  MapPin, 
  Hash, 
  ChevronLeft, 
  ChevronRight,
  Circle,
  CircleCheck,
  CirclePause,
  CircleX,
  History,
  ListChecks
} from 'lucide-react';
import { getAsignaciones, createAsignacion, deleteAsignacion } from '../../services/asignaciones.service';
import { getInventarios } from '../../services/inventarios.service';
import { getZonas } from '../../services/zonas.service';
import { getGrupos } from '../../services/grupos.service';
import { getRondas } from '../../services/rondas.service';

export default function AsignacionesPage() {
  const [inventarios, setInventarios] = useState([]);
  const [zonas, setZonas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [rondas, setRondas] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [inventarioFiltro, setInventarioFiltro] = useState('');
  const [rondaSeleccionada, setRondaSeleccionada] = useState(null);
  const [conteoNumero, setConteoNumero] = useState(1);
  
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

  async function loadData() {
    try {
      const [inventariosData, zonasData] = await Promise.all([
        getInventarios(),
        getZonas()
      ]);
      setInventarios(inventariosData);
      setZonas(zonasData);
      
      if (inventariosData.length > 0 && !inventarioFiltro) {
        setInventarioFiltro(inventariosData[0].id);
        setForm(prev => ({ ...prev, inventarioId: inventariosData[0].id }));
      }
    } catch (err) {
      setError('No se pudieron cargar los datos');
    }
  }

  async function loadGrupos(inventarioId) {
    if (!inventarioId) return;
    try {
      const data = await getGrupos(inventarioId);
      setGrupos(data);
      if (data.length > 0 && !form.grupoId) {
        setForm(prev => ({ ...prev, grupoId: data[0].id }));
      }
    } catch (err) {
      console.error('Error cargando grupos:', err);
    }
  }

  async function loadRondas(inventarioId) {
    if (!inventarioId) return;
    try {
      const data = await getRondas({ inventarioId });
      setRondas(data);
      const maxRonda = Math.max(...data.map(r => r.numeroRonda), 0);
      if (conteoNumero > maxRonda + 1) {
        setConteoNumero(maxRonda + 1);
      }
    } catch (err) {
      console.error('Error cargando rondas:', err);
    }
  }

  async function loadAsignaciones(inventarioId, numeroRonda) {
    if (!inventarioId) return;
    try {
      const ronda = rondas.find(r => r.inventarioId === inventarioId && r.numeroRonda === numeroRonda);
      if (ronda) {
        setRondaSeleccionada(ronda);
        const data = await getAsignaciones({ inventarioId, conteoTipo: numeroRonda });
        setAsignaciones(data);
      } else {
        setRondaSeleccionada(null);
        setAsignaciones([]);
      }
    } catch (err) {
      setError('No se pudieron cargar las asignaciones');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (inventarioFiltro) {
      loadGrupos(inventarioFiltro);
      loadRondas(inventarioFiltro);
    }
  }, [inventarioFiltro]);

  useEffect(() => {
    if (inventarioFiltro && conteoNumero) {
      loadAsignaciones(inventarioFiltro, conteoNumero);
    }
  }, [inventarioFiltro, conteoNumero, rondas]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      await createAsignacion({
        inventarioId: Number(form.inventarioId),
        conteoTipo: Number(conteoNumero),
        grupoId: Number(form.grupoId),
        zonaId: Number(form.zonaId)
      });
      setMessage('Asignación creada correctamente');
      await loadAsignaciones(form.inventarioId, conteoNumero);
      setForm(prev => ({ ...prev, grupoId: '', zonaId: '' }));
    } catch (err) {
      setError(err.response?.data?.message || 'Error al crear asignación');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta asignación?')) return;
    try {
      await deleteAsignacion(id);
      setMessage('Asignación eliminada');
      await loadAsignaciones(inventarioFiltro, conteoNumero);
    } catch (err) {
      setError('Error al eliminar');
    }
  };

  const aumentarConteo = () => {
    const maxRonda = Math.max(...rondas.map(r => r.numeroRonda), 0);
    if (conteoNumero < maxRonda + 5) {
      setConteoNumero(conteoNumero + 1);
    }
  };

  const disminuirConteo = () => {
    if (conteoNumero > 1) {
      setConteoNumero(conteoNumero - 1);
    }
  };

  const zonasAsignadas = asignaciones.map(a => a.zonaId);
  const gruposAsignados = asignaciones.map(a => a.grupoId);
  
  const zonasDisponibles = zonas.filter(z => !zonasAsignadas.includes(z.id));
  const gruposDisponibles = grupos.filter(g => !gruposAsignados.includes(g.id));

  const rondaActual = rondas.find(r => r.inventarioId === inventarioFiltro && r.numeroRonda === conteoNumero);
  const rondaEstado = rondaActual?.estado || 'no_creada';

  const getEstadoIcon = (estado) => {
    switch(estado) {
      case 'activa': return <CircleCheck size={14} />;
      case 'pausada': return <CirclePause size={14} />;
      case 'cerrada': return <CircleX size={14} />;
      default: return <Circle size={14} />;
    }
  };

  const getEstadoColor = (estado) => {
    switch(estado) {
      case 'activa': return 'success';
      case 'pausada': return 'warning';
      case 'cerrada': return 'danger';
      default: return 'muted';
    }
  };

  if (loading) return <div className="card">Cargando asignaciones...</div>;

  return (
    <div className="dashboard-container">
      {/* Filtros */}
      <div className="card filters-card">
        <div className="filters-form">
          <div className="form-group">
            <label><Hash size={14} /> Inventario</label>
            <select value={inventarioFiltro} onChange={(e) => setInventarioFiltro(Number(e.target.value))}>
              {inventarios.map(inv => (
                <option key={inv.id} value={inv.id}>{inv.nombre}</option>
              ))}
            </select>
          </div>
          
          <div className="form-group conteo-selector">
            <label><History size={14} /> Ronda / Conteo</label>
            <div className="conteo-control">
              <button type="button" onClick={disminuirConteo} disabled={conteoNumero <= 1}>
                <ChevronLeft size={16} />
              </button>
              <span className="conteo-numero">Ronda {conteoNumero}</span>
              <button type="button" onClick={aumentarConteo}>
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="ronda-estado">
              <span className={`estado-badge ${getEstadoColor(rondaEstado)}`}>
                {getEstadoIcon(rondaEstado)}
                <span>
                  {rondaEstado === 'activa' && 'Activa'}
                  {rondaEstado === 'pausada' && 'Pausada'}
                  {rondaEstado === 'cerrada' && 'Cerrada'}
                  {rondaEstado === 'borrador' && 'Borrador'}
                  {rondaEstado === 'no_creada' && 'Por crear'}
                </span>
              </span>
            </div>
          </div>
          
          <button className="btn btn-outline" onClick={() => loadAsignaciones(inventarioFiltro, conteoNumero)}>
            <RefreshCw size={16} /> Actualizar
          </button>
        </div>
      </div>

      <div className="grid-2">
        {/* Formulario */}
        <div className="card">
          <h2 className="section-title"><Plus size={20} /> Nueva asignación</h2>
          
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label><Hash size={14} /> Inventario</label>
              <select
                value={form.inventarioId}
                onChange={(e) => setForm(prev => ({ ...prev, inventarioId: Number(e.target.value) }))}
                required
              >
                <option value="">Selecciona</option>
                {inventarios.map(inv => (
                  <option key={inv.id} value={inv.id}>{inv.nombre}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label><Users size={14} /> Grupo</label>
              <select
                value={form.grupoId}
                onChange={(e) => setForm(prev => ({ ...prev, grupoId: Number(e.target.value) }))}
                required
              >
                <option value="">Selecciona grupo</option>
                {gruposDisponibles.map(grupo => (
                  <option key={grupo.id} value={grupo.id}>{grupo.nombre}</option>
                ))}
              </select>
              {gruposDisponibles.length === 0 && (
                <p className="muted">No hay grupos disponibles para esta ronda.</p>
              )}
            </div>

            <div className="form-group">
              <label><MapPin size={14} /> Zona</label>
              <select
                value={form.zonaId}
                onChange={(e) => setForm(prev => ({ ...prev, zonaId: Number(e.target.value) }))}
                required
              >
                <option value="">Selecciona zona</option>
                {zonasDisponibles.map(zona => (
                  <option key={zona.id} value={zona.id}>{zona.nombre}</option>
                ))}
              </select>
              {zonasDisponibles.length === 0 && (
                <p className="muted">No hay zonas disponibles para esta ronda.</p>
              )}
            </div>

            {message && <div className="alert-success">{message}</div>}
            {error && <div className="alert-error">{error}</div>}

            <button className="btn btn-primary" type="submit" disabled={saving || rondaEstado === 'cerrada'}>
              {saving ? 'Asignando...' : <><Plus size={16} /> Asignar grupo a zona</>}
            </button>
            
            {rondaEstado === 'cerrada' && (
              <p className="muted" style={{ marginTop: '8px' }}>Esta ronda está cerrada. No se pueden modificar asignaciones.</p>
            )}
          </form>
        </div>

        {/* Lista de asignaciones */}
        <div className="card">
          <h2 className="section-title"><ListChecks size={20} /> Asignaciones - Ronda {conteoNumero}</h2>
          
          {asignaciones.length === 0 ? (
            <p className="muted">No hay asignaciones para esta ronda.</p>
          ) : (
            <div className="table-list">
              {asignaciones.map(asignacion => (
                <div key={asignacion.id} className="list-row">
                  <div className="asignacion-info">
                    <div className="asignacion-grupo">
                      <Users size={14} />
                      <strong>{asignacion.grupo?.nombre}</strong>
                    </div>
                    <div className="asignacion-zona">
                      <MapPin size={14} />
                      <span>{asignacion.zona?.nombre}</span>
                      <span className="zona-codigo">({asignacion.zona?.codigo})</span>
                    </div>
                  </div>
                  {rondaEstado !== 'cerrada' && (
                    <button className="icon-btn danger" onClick={() => handleDelete(asignacion.id)}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Resumen */}
          <div className="asignaciones-resumen">
            <div className="resumen-item">
              <span>Grupos asignados</span>
              <strong>{asignaciones.length}</strong>
            </div>
            <div className="resumen-item">
              <span>Zonas cubiertas</span>
              <strong>{new Set(asignaciones.map(a => a.zonaId)).size}</strong>
            </div>
            <div className="resumen-item">
              <span>Completitud</span>
              <strong>{Math.round((asignaciones.length / zonas.length) * 100)}%</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Historial de rondas */}
      <div className="card">
        <h2 className="section-title"><History size={20} /> Historial de rondas</h2>
        <div className="rondas-historial">
          {rondas.filter(r => r.inventarioId === inventarioFiltro).map(ronda => (
            <div 
              key={ronda.id} 
              className={`ronda-item ${ronda.numeroRonda === conteoNumero ? 'active' : ''}`}
              onClick={() => setConteoNumero(ronda.numeroRonda)}
            >
              <div className="ronda-numero">Ronda {ronda.numeroRonda}</div>
              <div className="ronda-tipo">
                {ronda.tipoRonda === 'reconteo' ? 'Reconteo' : 'Completa'}
              </div>
              <div className={`ronda-estado ${ronda.estado}`}>
                {getEstadoIcon(ronda.estado)}
                <span>{ronda.estado}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}