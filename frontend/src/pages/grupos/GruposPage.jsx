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
  EyeOff,
  UserMinus,
  Save,
  X,
  Edit2,
  Trash2,
  Search,
  MapPin
} from 'lucide-react';
import {
  getGrupos,
  createGrupo,
  updateGrupo,
  deleteGrupo,
  getGrupoEstadisticas,
  getUsuariosDisponiblesParaGrupo,
  getLideresDisponiblesParaGrupo,
  asignarUsuarioAGrupo,
  removerUsuarioDeGrupo
} from '../../services/grupos.service';
import { getInventarios } from '../../services/inventarios.service';
import { getUsuarios } from '../../services/usuarios.service';
import { getZonas } from '../../services/zonas.service';
import { getRondaActivaDelGrupo } from '../../services/rondas.service';
import api from '../../services/api';

export default function GruposPage() {
  const [inventarios, setInventarios] = useState([]);
  const [zonas, setZonas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [inventarioFiltro, setInventarioFiltro] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [grupoSeleccionado, setGrupoSeleccionado] = useState(null);
  const [estadisticas, setEstadisticas] = useState(null);
  const [rondaActiva, setRondaActiva] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [lideresDisponibles, setLideresDisponibles] = useState([]);
  const [miembrosDisponibles, setMiembrosDisponibles] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchLider, setSearchLider] = useState('');
  const [searchZona, setSearchZona] = useState('');
  const [form, setForm] = useState({
    inventarioId: '',
    nombre: '',
    liderId: '',
    color: '#3b82f6',
    zonaId: ''
  });

  const colores = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
    '#14b8a6', '#d946ef', '#f43f5e', '#0ea5e9', '#eab308'
  ];

  async function loadZonas() {
    try {
      const data = await getZonas();
      setZonas(data);
    } catch (err) {
      console.error('Error cargando zonas:', err);
    }
  }

  async function loadData() {
    try {
      const [inventariosData, usuariosData] = await Promise.all([
        getInventarios(),
        getUsuarios()
      ]);

      setInventarios(inventariosData);
      setUsuarios(usuariosData);

      if (inventariosData.length > 0 && !inventarioFiltro) {
        setInventarioFiltro(inventariosData[0].id);
        setForm(prev => ({ ...prev, inventarioId: inventariosData[0].id }));

        const gruposData = await getGrupos(inventariosData[0].id);
        setGrupos(gruposData);
      } else if (inventarioFiltro) {
        const gruposData = await getGrupos(inventarioFiltro);
        setGrupos(gruposData);
      }
    } catch (err) {
      setError('No se pudieron cargar los datos');
      console.error(err);
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

  async function cargarLideresDisponibles() {
    try {
      if (editing) {
        const data = await getLideresDisponiblesParaGrupo(editing);
        setLideresDisponibles(data);
        return;
      }

      const data = await getUsuarios();
      setLideresDisponibles(data);
    } catch (err) {
      console.error('Error cargando líderes disponibles:', err);
    }
  }

  async function cargarMiembrosDisponibles(grupoId) {
    if (!grupoId) return;
    try {
      const data = await getUsuariosDisponiblesParaGrupo(grupoId);
      setMiembrosDisponibles(data);
    } catch (err) {
      console.error('Error cargando miembros disponibles:', err);
    }
  }

  async function verDetalleGrupo(grupo) {
    setGrupoSeleccionado(grupo);
    try {
      const [stats, ronda] = await Promise.all([
        getGrupoEstadisticas(grupo.id),
        getRondaActivaDelGrupo(grupo.id)
      ]);
      setEstadisticas(stats);
      setRondaActiva(ronda);
      await cargarMiembrosDisponibles(grupo.id);
    } catch (err) {
      console.error('Error cargando detalles:', err);
    }
  }

  async function asignarUsuario(usuarioId, grupoId) {
    try {
      await asignarUsuarioAGrupo(usuarioId, grupoId);
      setMessage('Usuario asignado al grupo correctamente');

      const actualizados = await getGrupos(inventarioFiltro);
      setGrupos(actualizados);

      if (grupoSeleccionado?.id === grupoId) {
        const grupoActualizado = actualizados.find(g => g.id === grupoId);
        if (grupoActualizado) {
          await verDetalleGrupo(grupoActualizado);
        }
      }

      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al asignar usuario');
      setTimeout(() => setError(''), 3000);
    }
  }

  async function removerUsuario(usuarioId) {
    try {
      await removerUsuarioDeGrupo(usuarioId, grupoSeleccionado.id);
      setMessage('Usuario removido del grupo');

      const actualizados = await getGrupos(inventarioFiltro);
      setGrupos(actualizados);

      const grupoActualizado = actualizados.find(g => g.id === grupoSeleccionado.id);
      if (grupoActualizado) {
        await verDetalleGrupo(grupoActualizado);
      } else {
        setGrupoSeleccionado(null);
      }

      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al remover usuario');
      setTimeout(() => setError(''), 3000);
    }
  }

  useEffect(() => {
    loadData();
    loadZonas();
  }, []);

  useEffect(() => {
    if (inventarioFiltro) {
      loadGrupos(inventarioFiltro);
    }
  }, [inventarioFiltro]);

  useEffect(() => {
    if (form.inventarioId) {
      cargarLideresDisponibles();
    }
  }, [form.inventarioId]);
  useEffect(() => {
    setSearchLider('');
    setSearchZona('');
  }, [form.inventarioId, editing]);
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
      setForm({ inventarioId: form.inventarioId, nombre: '', liderId: '', color: '#3b82f6', zonaId: '' });
      setEditing(null);
      setSearchLider('');
      setSearchZona('');
      await loadGrupos(form.inventarioId);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al guardar grupo');
      setTimeout(() => setError(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (grupo) => {
    setEditing(grupo.id);
    setForm({
      inventarioId: grupo.inventarioId,
      nombre: grupo.nombre,
      liderId: grupo.liderId || '',
      color: grupo.color || '#3b82f6',
      zonaId: grupo.zonaAsignada?.id || ''
    });
    setSearchLider('');
    setSearchZona('');
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este grupo? Se perderán las asignaciones y miembros.')) return;
    try {
      await deleteGrupo(id);
      setMessage('Grupo eliminado');
      await loadGrupos(inventarioFiltro);
      if (grupoSeleccionado?.id === id) {
        setGrupoSeleccionado(null);
      }
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al eliminar');
      setTimeout(() => setError(''), 3000);
    }
  };

  const miembrosDelGrupo = grupoSeleccionado?.miembros || [];
  const lider = usuarios.find(u => u.id === grupoSeleccionado?.liderId);
  const zonaAsignada = grupoSeleccionado?.zonaAsignada || null;
  const usuariosAsignadosEnInventario = new Set(
    grupos.flatMap(g => (g.miembros || []).map(u => u.id))
  );

  const usuariosSinGrupo = usuarios.filter(
    u => !usuariosAsignadosEnInventario.has(u.id)
  ).length;

  // Líderes ya ocupados en otros grupos del inventario actual
  const lideresOcupados = new Set(
    grupos
      .filter(g => !editing || g.id !== editing)
      .map(g => g.liderId)
      .filter(Boolean)
  );

  // Zonas ya ocupadas en otros grupos del inventario actual
  const zonasOcupadas = new Set(
    grupos
      .filter(g => !editing || g.id !== editing)
      .map(g => g.zonaAsignada?.id)
      .filter(Boolean)
  );

  // Filtro de líderes con búsqueda
  const lideresFiltrados = lideresDisponibles.filter(user => {
    const texto = `${user.nombre || ''} ${user.email || ''}`.toLowerCase();
    const coincide = texto.includes(searchLider.toLowerCase());

    return coincide && (
      !lideresOcupados.has(user.id) || user.id === Number(form.liderId)
    );
  });

  // Filtro de zonas con búsqueda
  const zonasFiltradas = zonas.filter(zona => {
    const texto = `${zona.nombre || ''} ${zona.codigo || ''}`.toLowerCase();
    const coincide = texto.includes(searchZona.toLowerCase());

    return coincide && (
      !zonasOcupadas.has(zona.id) || zona.id === Number(form.zonaId)
    );
  });

  // Filtrar miembros disponibles por búsqueda
  const miembrosDisponiblesFiltrados = miembrosDisponibles.filter(user =>
    user.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading && grupos.length === 0) return <div className="card">Cargando grupos...</div>;

  return (
    <div className="dashboard-container">
      {/* Tarjetas de resumen */}
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
            <h3 className="kpi-value">{usuariosSinGrupo}</h3>
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
        {/* Formulario de creación/edición */}
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
                <option value="">Selecciona un inventario</option>
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

              <div className="search-usuarios" style={{ marginBottom: '8px' }}>
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Buscar líder por nombre o email..."
                  value={searchLider}
                  onChange={(e) => setSearchLider(e.target.value)}
                />
              </div>

              <select
                value={form.liderId}
                onChange={(e) => setForm(prev => ({ ...prev, liderId: Number(e.target.value) || '' }))}
              >
                <option value="">Selecciona un líder</option>
                {lideresFiltrados.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.nombre} ({user.email}) - {
                      user.rol === 'admin' || user.rol?.nombre === 'admin'
                        ? 'Admin'
                        : user.rol === 'supervisor' || user.rol?.nombre === 'supervisor'
                          ? 'Supervisor'
                          : 'Contador'
                    }
                  </option>
                ))}
              </select>

              {lideresFiltrados.length === 0 && (
                <small className="text-muted">
                  No hay líderes disponibles con ese filtro.
                </small>
              )}

              {form.liderId && (
                <small className="text-muted">
                  El líder puede gestionar el grupo y ver estadísticas.
                </small>
              )}
            </div>

            <div className="form-group">
              <label><Palette size={14} /> Color del grupo</label>
              <div className="color-selector">
                <div
                  className="selected-color"
                  style={{ backgroundColor: form.color }}
                  onClick={() => setShowColorPicker(!showColorPicker)}
                />
                {showColorPicker && (
                  <div className="color-picker-popup">
                    {colores.map(color => (
                      <button
                        key={color}
                        type="button"
                        className={`color-option ${form.color === color ? 'active' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => {
                          setForm(prev => ({ ...prev, color }));
                          setShowColorPicker(false);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label><MapPin size={14} /> Zona asignada (opcional)</label>

              <div className="search-usuarios" style={{ marginBottom: '8px' }}>
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Buscar zona por nombre o código..."
                  value={searchZona}
                  onChange={(e) => setSearchZona(e.target.value)}
                />
              </div>

              <select
                value={form.zonaId}
                onChange={(e) => setForm(prev => ({ ...prev, zonaId: Number(e.target.value) || '' }))}
              >
                <option value="">Asignar después</option>
                {zonasFiltradas.map(zona => (
                  <option key={zona.id} value={zona.id}>
                    {zona.nombre} ({zona.codigo})
                  </option>
                ))}
              </select>

              {zonasFiltradas.length === 0 && (
                <small className="text-muted">
                  No hay zonas disponibles con ese filtro.
                </small>
              )}

              <small className="text-muted">
                Puedes asignar la zona ahora o después en Asignaciones.
              </small>
            </div>

            {message && <div className="alert-success">{message}</div>}
            {error && <div className="alert-error">{error}</div>}

            <div className="form-actions">
              {editing && (
                <button type="button" className="btn btn-outline" onClick={() => {
                  setEditing(null);
                  setForm({ inventarioId: form.inventarioId, nombre: '', liderId: '', color: '#3b82f6', zonaId: '' });
                  setSearchLider('');
                  setSearchZona('');
                }}>
                  <X size={16} /> Cancelar
                </button>
              )}
              <button className="btn btn-primary" type="submit" disabled={saving}>
                <Save size={16} /> {saving ? 'Guardando...' : (editing ? 'Actualizar grupo' : 'Crear grupo')}
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
                const miembros = grupo.miembros || [];
                return (
                  <div
                    key={grupo.id}
                    className={`list-row ${grupoSeleccionado?.id === grupo.id ? 'selected' : ''}`}
                    style={{ borderLeftColor: grupo.color || '#3b82f6', borderLeftWidth: '4px' }}
                    onClick={() => verDetalleGrupo(grupo)}
                  >
                    <div className="grupo-info">
                      <div className="grupo-header">
                        <span className="grupo-color" style={{ background: grupo.color || '#3b82f6' }} />
                        <strong>{grupo.nombre}</strong>
                        {liderGrupo && <span className="badge leader">👑 {liderGrupo.nombre}</span>}
                        <span className="badge">{miembros.length} miembros</span>
                      </div>
                    </div>
                    <div className="grupo-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="icon-btn" onClick={() => handleEdit(grupo)}>
                        <Edit2 size={16} />
                      </button>
                      <button className="icon-btn danger" onClick={() => handleDelete(grupo.id)}>
                        <Trash2 size={16} />
                      </button>
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
        <div className="grupo-detalle">
          <div className="card">
            <div className="detail-header">
              <h2 className="section-title">
                <div
                  className="grupo-color-badge"
                  style={{ background: grupoSeleccionado.color || '#3b82f6' }}
                />
                <span>Detalle: {grupoSeleccionado.nombre}</span>
              </h2>
              <button className="icon-btn" onClick={() => setGrupoSeleccionado(null)}>
                <EyeOff size={16} />
              </button>
            </div>

            {/* Estadísticas del grupo */}
            <div className="grupo-stats-grid">
              <div className="grupo-stat-card">
                <div className="stat-icon">
                  <Trophy size={24} />
                </div>
                <div className="stat-content">
                  <div className="stat-label">Total escaneos</div>
                  <div className="stat-value">{estadisticas?.total_escaneos || 0}</div>
                </div>
              </div>

              <div className="grupo-stat-card">
                <div className="stat-icon">
                  <Clock size={24} />
                </div>
                <div className="stat-content">
                  <div className="stat-label">Tiempo activo</div>
                  <div className="stat-value">{estadisticas?.tiempo_activo || '0h'}</div>
                </div>
              </div>
              <div className="grupo-stat-card">
                <div className="stat-icon warning">
                  <AlertTriangle size={24} />
                </div>
                <div className="stat-content">
                  <div className="stat-label">Diferencias</div>
                  <div className="stat-value">{estadisticas?.no_reconocidos || 0}</div>
                </div>
              </div>
            </div>

            {/* Ronda activa */}
            {rondaActiva && (
              <div className="ronda-activa-alert">
                <Activity size={18} />
                <span>Ronda activa: {rondaActiva.numeroRonda} - Zona: {rondaActiva.zona?.nombre}</span>
              </div>
            )}
            {grupoSeleccionado?.zonaAsignada ? (
              <div className="alert-info" style={{ marginBottom: '12px' }}>
                <MapPin size={16} />
                <span>
                  Zona asignada: {grupoSeleccionado.zonaAsignada.nombre} ({grupoSeleccionado.zonaAsignada.codigo})
                </span>
              </div>
            ) : (
              <div className="alert-info" style={{ marginBottom: '12px' }}>
                <MapPin size={16} />
                <span>Este grupo todavía no tiene zona asignada.</span>
              </div>
            )}
            <div className="zona-asignada">
              <h3><MapPin size={16} /> Zona asignada</h3>
              {zonaAsignada ? (
                <div className="zona-info">
                  <span className="zona-nombre">{zonaAsignada.nombre}</span>
                  <span className="zona-codigo">({zonaAsignada.codigo})</span>
                </div>
              ) : (
                <p className="muted">No hay zona asignada. Ve a Asignaciones para asignar una zona.</p>
              )}
            </div>

            <div className="miembros-section">
              <h3>Miembros del grupo ({miembrosDelGrupo.length})</h3>
              <div className="miembros-list">
                {miembrosDelGrupo.map(miembro => (
                  <div key={miembro.id} className="miembro-item">
                    <div className="miembro-info">
                      <div className="miembro-nombre">
                        <strong>{miembro.nombre}</strong>
                        {miembro.id === grupoSeleccionado?.liderId && (
                          <span className="lider-badge">
                            <Crown size={10} /> Líder
                          </span>
                        )}
                      </div>
                      <div className="miembro-email">
                        <span>{miembro.email}</span>
                        <span className={`miembro-rol rol-${miembro.rol?.nombre === 'admin' ? 'admin' :
                          miembro.rol?.nombre === 'supervisor' ? 'supervisor' : 'contador'
                          }`}>
                          {miembro.rol?.nombre || (miembro.rolId === 1 ? 'Admin' : miembro.rolId === 2 ? 'Supervisor' : 'Contador')}
                        </span>
                      </div>
                    </div>
                    {miembro.id !== grupoSeleccionado?.liderId && (
                      <button
                        className="btn-remover"
                        onClick={() => removerUsuario(miembro.id)}
                        title="Remover del grupo"
                      >
                        <UserMinus size={16} />
                      </button>
                    )}
                    {miembro.id === grupoSeleccionado?.liderId && (
                      <span className="lider-nota">No se puede remover al líder</span>
                    )}
                  </div>
                ))}
                {miembrosDelGrupo.length === 0 && (
                  <div className="miembros-empty">
                    <Users size={32} />
                    <p>No hay miembros asignados a este grupo.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Asignar nuevos miembros */}
            <div className="asignar-section">
              <h3>
                <UserPlus size={18} />
                Asignar usuario al grupo
              </h3>

              {/* Buscador de usuarios */}
              <div className="search-usuarios">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Buscar usuario por nombre o email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {miembrosDisponiblesFiltrados.length === 0 && miembrosDisponibles.length > 0 && (
                <div className="alert-info">
                  <span>No hay usuarios que coincidan con la búsqueda.</span>
                </div>
              )}

              {miembrosDisponibles.length === 0 && (
                <div className="alert-info">
                  <span>No hay usuarios disponibles para asignar. Todos los usuarios ya están en otros grupos o son líderes.</span>
                </div>
              )}

              {miembrosDisponiblesFiltrados.length > 0 && (
                <div className="usuario-selector">
                  <select id="usuario-select" defaultValue="">
                    <option value="" disabled>Selecciona un usuario</option>
                    {miembrosDisponiblesFiltrados.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.nombre} ({user.email}) - {
                          user.rol === 'admin' ? 'Admin' :
                            user.rol === 'supervisor' ? 'Supervisor' : 'Contador'
                        }
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-asignar"
                    onClick={() => {
                      const select = document.getElementById('usuario-select');
                      const usuarioId = select.value;
                      if (usuarioId) {
                        asignarUsuario(usuarioId, grupoSeleccionado.id);
                        select.value = '';
                        setSearchTerm('');
                      }
                    }}
                  >
                    <UserPlus size={16} /> Asignar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}