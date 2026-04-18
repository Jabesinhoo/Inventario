import { useEffect, useState } from 'react';
import { 
  Users, 
  UserPlus, 
  Crown, 
  Palette, 
  Trophy, 
  Clock, 
  AlertTriangle,
  Activity,
  Eye,
  EyeOff
} from 'lucide-react';
import { getGrupos, createGrupo, updateGrupo, deleteGrupo, getGrupoEstadisticas } from '../../services/grupos.service';
import { getInventarios } from '../../services/inventarios.service';
import { getUsuarios, asignarUsuarioAGrupo } from '../../services/usuarios.service';
import { getRondaActivaDelGrupo } from '../../services/rondas.service';

export default function GruposPage() {
  const [inventarios, setInventarios] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [usuariosSinGrupo, setUsuariosSinGrupo] = useState([]);
  const [inventarioFiltro, setInventarioFiltro] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [grupoSeleccionado, setGrupoSeleccionado] = useState(null);
  const [estadisticas, setEstadisticas] = useState(null);
  const [rondaActiva, setRondaActiva] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  
  const [form, setForm] = useState({
    inventarioId: '',
    nombre: '',
    liderId: '',
    color: '#3b82f6'
  });

  const colores = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
  ];

  async function loadData() {
    try {
      const [inventariosData, usuariosData, gruposData] = await Promise.all([
        getInventarios(),
        getUsuarios(),
        getGrupos()
      ]);
      
      setInventarios(inventariosData);
      setUsuarios(usuariosData);
      
      // Usuarios sin grupo
      const sinGrupo = usuariosData.filter(u => !u.grupoId);
      setUsuariosSinGrupo(sinGrupo);
      
      if (inventariosData.length > 0 && !inventarioFiltro) {
        setInventarioFiltro(inventariosData[0].id);
        setForm(prev => ({ ...prev, inventarioId: inventariosData[0].id }));
        
        const gruposFiltrados = gruposData.filter(g => g.inventarioId === inventariosData[0].id);
        setGrupos(gruposFiltrados);
      }
    } catch (err) {
      setError('No se pudieron cargar los datos');
    } finally {
      setLoading(false);
    }
  }

  async function loadGrupos(inventarioId) {
    if (!inventarioId) {
      setGrupos([]);
      return;
    }
    try {
      const data = await getGrupos(inventarioId);
      setGrupos(data);
    } catch (err) {
      setError('No se pudieron cargar los grupos');
    }
  }

  async function verDetalleGrupo(grupo) {
    setGrupoSeleccionado(grupo);
    setLoading(true);
    try {
      const [stats, ronda] = await Promise.all([
        getGrupoEstadisticas(grupo.id),
        getRondaActivaDelGrupo(grupo.id)
      ]);
      setEstadisticas(stats);
      setRondaActiva(ronda);
    } catch (err) {
      console.error('Error cargando detalles:', err);
    } finally {
      setLoading(false);
    }
  }

  async function asignarUsuario(usuarioId, grupoId) {
    try {
      await asignarUsuarioAGrupo(usuarioId, grupoId);
      setMessage(`Usuario asignado al grupo correctamente`);
      await loadData();
      if (grupoSeleccionado?.id === grupoId) {
        await verDetalleGrupo(grupoSeleccionado);
      }
    } catch (err) {
      setError('Error al asignar usuario');
    }
  }

  async function removerUsuario(usuarioId) {
    try {
      await asignarUsuarioAGrupo(usuarioId, null);
      setMessage(`Usuario removido del grupo`);
      await loadData();
      if (grupoSeleccionado) {
        await verDetalleGrupo(grupoSeleccionado);
      }
    } catch (err) {
      setError('Error al remover usuario');
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (inventarioFiltro) {
      loadGrupos(inventarioFiltro);
    }
  }, [inventarioFiltro]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      if (editing) {
        await updateGrupo(editing, form);
        setMessage('Grupo actualizado correctamente');
      } else {
        await createGrupo(form);
        setMessage('Grupo creado correctamente');
      }
      setForm({ inventarioId: form.inventarioId, nombre: '', liderId: '', color: '#3b82f6' });
      setEditing(null);
      await loadGrupos(form.inventarioId);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al guardar grupo');
    } finally {
      setSaving(false);
    }
  };

  const miembrosDelGrupo = usuarios.filter(u => u.grupoId === grupoSeleccionado?.id);
  const lider = usuarios.find(u => u.id === grupoSeleccionado?.liderId);

  if (loading && grupos.length === 0) return <div className="card">Cargando grupos...</div>;

  return (
    <div className="dashboard-container">
      {/* Header con estadísticas globales */}
      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-icon"><Users size={24} /></div>
          <div className="kpi-content">
            <p className="kpi-title">Total Grupos</p>
            <h3 className="kpi-value">{grupos.length}</h3>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-icon"><UserPlus size={24} /></div>
          <div className="kpi-content">
            <p className="kpi-title">Usuarios sin grupo</p>
            <h3 className="kpi-value">{usuariosSinGrupo.length}</h3>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-icon"><Activity size={24} /></div>
          <div className="kpi-content">
            <p className="kpi-title">Grupos activos</p>
            <h3 className="kpi-value">{grupos.filter(g => g.estado === 'activo').length}</h3>
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Formulario */}
        <div className="card">
          <h2 className="section-title">
            <Users size={20} />
            <span>{editing ? 'Editar grupo' : 'Crear grupo'}</span>
          </h2>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Inventario</label>
              <select
                value={form.inventarioId}
                onChange={(e) => setForm(prev => ({ ...prev, inventarioId: Number(e.target.value) }))}
                required
              >
                <option value="">Selecciona</option>
                {inventarios.map(item => (
                  <option key={item.id} value={item.id}>{item.nombre} - {item.fecha}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Nombre del grupo</label>
              <input
                value={form.nombre}
                onChange={(e) => setForm(prev => ({ ...prev, nombre: e.target.value }))}
                placeholder="Ej: Grupo Alpha"
                required
              />
            </div>

            <div className="form-group">
              <label><Crown size={14} /> Líder del grupo</label>
              <select
                value={form.liderId}
                onChange={(e) => setForm(prev => ({ ...prev, liderId: Number(e.target.value) || '' }))}
              >
                <option value="">Sin líder</option>
                {usuarios.map(user => (
                  <option key={user.id} value={user.id}>{user.nombre} {user.rol === 'admin' ? '(Admin)' : ''}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label><Palette size={14} /> Color del grupo</label>
              <div className="color-picker">
                {colores.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={`color-option ${form.color === color ? 'active' : ''}`}
                    style={{ background: color }}
                    onClick={() => setForm(prev => ({ ...prev, color }))}
                  />
                ))}
              </div>
            </div>

            {message && <div className="alert-success">{message}</div>}
            {error && <div className="alert-error">{error}</div>}

            <div className="form-actions">
              {editing && (
                <button type="button" className="btn btn-outline" onClick={() => {
                  setEditing(null);
                  setForm({ inventarioId: form.inventarioId, nombre: '', liderId: '', color: '#3b82f6' });
                }}>
                  Cancelar
                </button>
              )}
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Guardando...' : (editing ? 'Actualizar' : 'Crear grupo')}
              </button>
            </div>
          </form>
        </div>

        {/* Lista de grupos */}
        <div className="card">
          <div className="list-header">
            <h2 className="section-title"><Users size={20} /><span>Grupos</span></h2>
            <div className="form-group filter-group">
              <label>Filtrar por inventario</label>
              <select value={inventarioFiltro} onChange={(e) => setInventarioFiltro(Number(e.target.value))}>
                <option value="">Selecciona</option>
                {inventarios.map(item => (
                  <option key={item.id} value={item.id}>{item.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {grupos.length === 0 ? (
            <p className="muted">No hay grupos para este inventario.</p>
          ) : (
            <div className="table-list">
              {grupos.map(grupo => {
                const liderGrupo = usuarios.find(u => u.id === grupo.liderId);
                const miembros = usuarios.filter(u => u.grupoId === grupo.id);
                return (
                  <div 
                    key={grupo.id} 
                    className={`list-row ${grupoSeleccionado?.id === grupo.id ? 'selected' : ''}`}
                    style={{ borderLeftColor: grupo.color || '#3b82f6', borderLeftWidth: '4px' }}
                    onClick={() => verDetalleGrupo(grupo)}
                  >
                    <div className="grupo-info">
                      <div className="grupo-header">
                        <span className="grupo-color" style={{ background: grupo.color }} />
                        <strong>{grupo.nombre}</strong>
                        {liderGrupo && <span className="badge">👑 {liderGrupo.nombre}</span>}
                        <span className="badge">{miembros.length} miembros</span>
                      </div>
                    </div>
                    <div className="grupo-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="icon-btn" onClick={() => handleEdit(grupo)}><Edit2 size={16} /></button>
                      <button className="icon-btn danger" onClick={() => handleDelete(grupo.id)}><Trash2 size={16} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detalle del grupo seleccionado */}
      {grupoSeleccionado && (
        <div className="card">
          <div className="detail-header">
            <h2 className="section-title">
              <span className="grupo-color" style={{ background: grupoSeleccionado.color }} />
              <span>Detalle: {grupoSeleccionado.nombre}</span>
            </h2>
            <button className="icon-btn" onClick={() => setGrupoSeleccionado(null)}>
              <EyeOff size={16} />
            </button>
          </div>

          {/* Estadísticas del grupo */}
          <div className="grid-3">
            <div className="mini-stat">
              <Trophy size={16} />
              <span>Total escaneos</span>
              <strong>{estadisticas?.total_escaneos || 0}</strong>
            </div>
            <div className="mini-stat">
              <Clock size={16} />
              <span>Tiempo activo</span>
              <strong>{estadisticas?.horas_activas || '0h'}</strong>
            </div>
            <div className="mini-stat">
              <AlertTriangle size={16} />
              <span>Diferencias</span>
              <strong>{estadisticas?.diferencias || 0}</strong>
            </div>
          </div>

          {/* Ronda activa */}
          {rondaActiva && (
            <div className="alert-info">
              <Activity size={16} />
              <span>Ronda activa: {rondaActiva.numeroRonda} - Zona: {rondaActiva.zona?.nombre}</span>
            </div>
          )}

          {/* Miembros del grupo */}
          <div className="miembros-section">
            <h3>Miembros del grupo</h3>
            <div className="table-list">
              {miembrosDelGrupo.map(miembro => (
                <div key={miembro.id} className="list-row small">
                  <div>
                    <strong>{miembro.nombre}</strong>
                    <p className="muted">{miembro.email} - {miembro.rol}</p>
                  </div>
                  <button className="icon-btn danger" onClick={() => removerUsuario(miembro.id)}>
                    <UserMinus size={14} />
                  </button>
                </div>
              ))}
              {miembrosDelGrupo.length === 0 && (
                <p className="muted">No hay miembros asignados a este grupo.</p>
              )}
            </div>
          </div>

          {/* Asignar usuarios */}
          {usuariosSinGrupo.length > 0 && (
            <div className="asignar-section">
              <h3>Asignar usuario al grupo</h3>
              <div className="select-row">
                <select id="usuario-select" className="flex-1">
                  <option value="">Selecciona un usuario</option>
                  {usuariosSinGrupo.map(user => (
                    <option key={user.id} value={user.id}>{user.nombre} ({user.email})</option>
                  ))}
                </select>
                <button 
                  className="btn btn-primary"
                  onClick={() => {
                    const select = document.getElementById('usuario-select');
                    const usuarioId = select.value;
                    if (usuarioId) {
                      asignarUsuario(usuarioId, grupoSeleccionado.id);
                      select.value = '';
                    }
                  }}
                >
                  <UserPlus size={16} /> Asignar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}