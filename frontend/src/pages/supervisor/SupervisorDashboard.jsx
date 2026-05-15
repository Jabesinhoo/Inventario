import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Users, Activity, AlertTriangle, Eye, EyeOff,
  RefreshCw, Clock, Boxes, TrendingUp, Zap,
  MapPin, Crown, Search, X
} from 'lucide-react';
import { getInventarios } from '../../services/inventarios.service';
import {
  getDashboardSupervisor,
  getAlertasRealtime,
  getGrupoDetalle
} from '../../services/supervisor.service';

export default function SupervisorDashboard() {
  const [inventarios, setInventarios] = useState([]);
  const [inventarioId, setInventarioId] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGrupo, setSelectedGrupo] = useState(null);
  const [grupoDetalle, setGrupoDetalle] = useState(null);
  const [showAlertasModal, setShowAlertasModal] = useState(false);
  const [alertasFiltradas, setAlertasFiltradas] = useState([]);
  
  const pollingRef = useRef(null);

  // Cargar inventarios
  async function loadInventarios() {
    try {
      const data = await getInventarios();
      setInventarios(data);
      if (data.length > 0 && !inventarioId) {
        setInventarioId(data[0].id);
      }
    } catch (error) {
      console.error('Error cargando inventarios:', error);
    }
  }

  // Cargar dashboard
  async function loadDashboard(showRefreshing = false) {
    if (!inventarioId) return;
    
    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await getDashboardSupervisor(inventarioId);
      setDashboard(data);
    } catch (error) {
      console.error('Error cargando dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Cargar detalle de grupo
  async function loadGrupoDetalle(grupoId) {
    try {
      const data = await getGrupoDetalle(grupoId, inventarioId);
      setGrupoDetalle(data);
    } catch (error) {
      console.error('Error cargando detalle de grupo:', error);
    }
  }

  // Ver alertas
  async function verAlertas() {
    try {
      const alertas = await getAlertasRealtime(inventarioId);
      setAlertasFiltradas(alertas);
      setShowAlertasModal(true);
    } catch (error) {
      console.error('Error cargando alertas:', error);
    }
  }

  // Configurar polling cada 10 segundos
  const startPolling = useCallback(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(() => {
      if (inventarioId && !refreshing && !loading) {
        loadDashboard(true);
      }
    }, 10000);
  }, [inventarioId, refreshing, loading]);

  useEffect(() => {
    loadInventarios();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  useEffect(() => {
    if (inventarioId) {
      loadDashboard();
      startPolling();
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [inventarioId]);

  useEffect(() => {
    if (selectedGrupo) {
      loadGrupoDetalle(selectedGrupo.id);
    }
  }, [selectedGrupo]);

  if (loading && !dashboard) {
    return (
      <div className="card loading-card">
        <div className="loading-spinner" />
        <p>Cargando dashboard de supervisor...</p>
      </div>
    );
  }

  const resumen = dashboard?.resumen || {};
  const grupos = dashboard?.grupos || [];
  const alertas = dashboard?.alertas || [];
  const escaneosRecientes = dashboard?.escaneosRecientes || [];
  const topProductos = dashboard?.topProductos || [];

  const getEstadoColor = (estado) => {
    switch (estado) {
      case 'activo': return '#10b981';
      case 'inactivo': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const getRondaEstadoClass = (estado) => {
    if (estado === 'activa') return 'success';
    if (estado === 'pausada') return 'warning';
    if (estado === 'cerrada') return 'danger';
    return 'info';
  };

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="card filters-card">
        <div className="filters-header">
          <div className="filters-form">
            <div className="form-group">
              <label>Inventario</label>
              <select value={inventarioId} onChange={(e) => setInventarioId(Number(e.target.value))}>
                {inventarios.map((inv) => (
                  <option key={inv.id} value={inv.id}>{inv.nombre} - {inv.fecha}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" onClick={() => loadDashboard()} disabled={refreshing}>
              <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
              Actualizar
            </button>
            {alertas.length > 0 && (
              <button className="btn btn-danger" onClick={verAlertas}>
                <AlertTriangle size={16} />
                Alertas ({alertas.length})
              </button>
            )}
          </div>
          <div className="last-update">
            <Clock size={14} />
            <span>Actualizado: {dashboard?.ultimaActualizacion ? new Date(dashboard.ultimaActualizacion).toLocaleTimeString() : '--:--:--'}</span>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-icon"><Users size={24} /></div>
          <div className="kpi-content">
            <p className="kpi-title">Grupos</p>
            <h3 className="kpi-value">{resumen.total_grupos || 0}</h3>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-icon"><Activity size={24} /></div>
          <div className="kpi-content">
            <p className="kpi-title">Usuarios activos</p>
            <h3 className="kpi-value">{resumen.usuarios_activos || 0}</h3>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-icon"><Boxes size={24} /></div>
          <div className="kpi-content">
            <p className="kpi-title">Total escaneos</p>
            <h3 className="kpi-value">{(resumen.total_escaneos || 0).toLocaleString()}</h3>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-icon"><TrendingUp size={24} /></div>
          <div className="kpi-content">
            <p className="kpi-title">Productos distintos</p>
            <h3 className="kpi-value">{resumen.productos_distintos || 0}</h3>
          </div>
        </div>
      </div>

      {/* Tabla de grupos */}
      <div className="card">
        <div className="list-header">
          <h2 className="section-title"><Users size={20} /> Grupos en tiempo real</h2>
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Grupo</th>
                <th>Zona</th>
                <th>Líder</th>
                <th>Escaneos</th>
                <th>Productos</th>
                <th>Ronda</th>
                <th>Estado</th>
                <th>Última actividad</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((grupo) => (
                <tr key={grupo.id} style={{ borderLeft: `4px solid ${grupo.color || '#3b82f6'}` }}>
                  <td><strong>{grupo.nombre}</strong></td>
                  <td>{grupo.zona || 'Sin zona'} {grupo.zona_codigo && `(${grupo.zona_codigo})`}</td>
                  <td>{grupo.lider || 'Sin líder'}</td>
                  <td className="text-center">{grupo.total_escaneos}</td>
                  <td className="text-center">{grupo.productos_distintos}</td>
                  <td className="text-center">
                    <span className={`status-badge ${getRondaEstadoClass(grupo.ronda_estado)}`}>
                      R{grupo.numero_ronda || '?'} {grupo.ronda_estado || 'Sin ronda'}
                    </span>
                  </td>
                  <td>
                    <span className="status-chip" style={{ backgroundColor: getEstadoColor(grupo.estado_actividad), color: 'white' }}>
                      {grupo.estado_actividad === 'activo' ? '🟢 Activo' : grupo.estado_actividad === 'inactivo' ? '🟡 Inactivo' : '⚫ Desconectado'}
                    </span>
                  </td>
                  <td className="text-muted">
                    {grupo.ultima_actividad ? new Date(grupo.ultima_actividad).toLocaleTimeString() : 'Nunca'}
                  </td>
                  <td>
                    <button className="btn btn-outline small" onClick={() => setSelectedGrupo(grupo)}>
                      <Eye size={14} /> Detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Escaneos recientes y Top productos */}
      <div className="grid-2">
        <div className="card">
          <h2 className="section-title"><Zap size={20} /> Escaneos recientes</h2>
          {escaneosRecientes.length === 0 ? (
            <p className="muted">No hay escaneos recientes.</p>
          ) : (
            <div className="history-list" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {escaneosRecientes.map((escaneo) => (
                <div key={escaneo.id} className="history-item">
                  <div className="history-main">
                    <strong>{escaneo.codigoLeido}</strong>
                    <p>{escaneo.descripcionSnapshot || escaneo.sku || 'Sin descripción'}</p>
                  </div>
                  <div className="history-meta">
                    <span className="tag-muted">{new Date(escaneo.fechaHora).toLocaleTimeString()}</span>
                    <span className="badge">{escaneo.grupo?.nombre}</span>
                    <span className="badge info">{escaneo.usuario?.nombre}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="section-title"><TrendingUp size={20} /> Top productos más escaneados</h2>
          {topProductos.length === 0 ? (
            <p className="muted">No hay productos escaneados.</p>
          ) : (
            <div className="top-productos-list">
              {topProductos.map((producto, idx) => (
                <div key={producto.sku} className="top-producto-item">
                  <div className="top-producto-rank">#{idx + 1}</div>
                  <div className="top-producto-info">
                    <div className="top-producto-sku"><strong>{producto.sku}</strong></div>
                    <div className="top-producto-desc">{producto.descripcion?.substring(0, 50) || 'Sin descripción'}</div>
                  </div>
                  <div className="top-producto-total">{producto.total} und</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de detalle de grupo */}
      {selectedGrupo && grupoDetalle && (
        <div className="modal-overlay" onClick={() => setSelectedGrupo(null)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><Users size={18} /> {selectedGrupo.nombre}</h3>
              <button className="icon-btn" onClick={() => setSelectedGrupo(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="grupo-detalle-grid">
                <div className="detail-item">
                  <span className="detail-label">Zona:</span>
                  <span className="detail-value">{grupoDetalle.grupo?.zona || 'Sin zona'} {grupoDetalle.grupo?.zona_codigo && `(${grupoDetalle.grupo.zona_codigo})`}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Líder:</span>
                  <span className="detail-value">{grupoDetalle.grupo?.lider || 'Sin líder'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Total escaneos:</span>
                  <span className="detail-value">{grupoDetalle.grupo?.total_escaneos || 0}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Productos distintos:</span>
                  <span className="detail-value">{grupoDetalle.grupo?.productos_distintos || 0}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Integrantes activos:</span>
                  <span className="detail-value">{grupoDetalle.grupo?.integrantes_activos || 0}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Primera actividad:</span>
                  <span className="detail-value">{grupoDetalle.grupo?.primera_actividad ? new Date(grupoDetalle.grupo.primera_actividad).toLocaleString() : 'Nunca'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Última actividad:</span>
                  <span className="detail-value">{grupoDetalle.grupo?.ultima_actividad ? new Date(grupoDetalle.grupo.ultima_actividad).toLocaleString() : 'Nunca'}</span>
                </div>
              </div>

              <h4 style={{ marginTop: '20px' }}>Productos escaneados por este grupo</h4>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr><th>SKU</th><th>Descripción</th><th>Cantidad</th></tr>
                  </thead>
                  <tbody>
                    {grupoDetalle.productos?.map((p) => (
                      <tr key={p.sku}>
                        <td>{p.sku}</td>
                        <td>{p.descripcion?.substring(0, 60) || 'Sin descripción'}</td>
                        <td className="text-center">{p.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setSelectedGrupo(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de alertas */}
      {showAlertasModal && (
        <div className="modal-overlay" onClick={() => setShowAlertasModal(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><AlertTriangle size={18} /> Alertas - Productos en zona incorrecta</h3>
              <button className="icon-btn" onClick={() => setShowAlertasModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {alertasFiltradas.length === 0 ? (
                <p className="muted">No hay alertas registradas en las últimas 24 horas.</p>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Zona destino</th>
                        <th>Grupo destino</th>
                        <th>Cantidad</th>
                        <th>Zona origen</th>
                        <th>Grupo origen</th>
                        <th>Usuario</th>
                        <th>Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alertasFiltradas.map((alerta) => (
                        <tr key={alerta.id} className="row-warning">
                          <td><strong>{alerta.sku}</strong></td>
                          <td>{alerta.zona_destino}</td>
                          <td>{alerta.grupo_destino}</td>
                          <td className="text-center">{alerta.cantidad}</td>
                          <td>{alerta.zona_origen}</td>
                          <td>{alerta.grupo_origen}</td>
                          <td>{alerta.usuario}</td>
                          <td className="text-muted">{new Date(alerta.fecha).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setShowAlertasModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}