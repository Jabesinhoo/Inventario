import { useEffect, useState, useCallback, useRef } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarDays,
  CheckCircle2,
  Clock,
  GitCompareArrows,
  LayoutGrid,
  RefreshCw,
  ScanLine,
  Trophy,
  Users,
  Zap
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { getDashboard } from '../../services/dashboard.service';
import { getInventarios } from '../../services/inventarios.service';

const COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#ea580c', '#dc2626', '#f59e0b', '#8b5cf6'];

function KpiCard({ title, value, icon: Icon, subtitle }) {
  return (
    <div className="card kpi-card">
      <div className="kpi-icon">
        <Icon size={18} />
      </div>
      <div className="kpi-content">
        <p className="muted kpi-title">{title}</p>
        <h3 className="kpi-value">{value?.toLocaleString() ?? 0}</h3>
        {subtitle && <p className="muted kpi-subtitle">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [fecha, setFecha] = useState('');
  const [inventarioId, setInventarioId] = useState('');
  const [inventarios, setInventarios] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  
  const pollingRef = useRef(null);

  // Cargar lista de inventarios
  const loadInventariosList = async () => {
    try {
      const result = await getInventarios();
      setInventarios(result);
      if (result && result.length > 0 && !inventarioId) {
        setInventarioId(result[0].id);
      }
    } catch (err) {
      console.error('Error cargando inventarios:', err);
      setError('No se pudieron cargar los inventarios');
    }
  };

  // Cargar datos del dashboard
  const loadDashboardData = async (showRefreshing = false) => {
    if (!inventarioId) return;
    
    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    
    try {
      console.log('Cargando dashboard para inventario:', inventarioId);
      const result = await getDashboard({ 
        inventarioId, 
        ...(fecha ? { fecha } : {}) 
      });
      
      setData(result);
      setLastUpdate(new Date());
      setError('');
    } catch (err) {
      console.error('Error cargando dashboard:', err);
      setError(err.response?.data?.message || 'No se pudo cargar el dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Configurar polling
  const startPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    
    pollingRef.current = setInterval(() => {
      if (inventarioId && !refreshing && !loading) {
        loadDashboardData(true);
      }
    }, 30000);
  }, [inventarioId, refreshing, loading]);

  // Cargar datos iniciales
  useEffect(() => {
    loadInventariosList();
    
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Cargar dashboard cuando cambia inventario o fecha
  useEffect(() => {
    if (inventarioId) {
      loadDashboardData();
      startPolling();
    }
    
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [inventarioId, fecha]);

  // Refrescar manualmente
  const handleRefresh = () => {
    if (!refreshing && !loading) {
      loadDashboardData(true);
    }
  };

  const handleFilter = (e) => {
    e.preventDefault();
    loadDashboardData();
  };

  // Mostrar estado de carga
  if (loading && !data) {
    return (
      <div className="card loading-card">
        <div className="loading-spinner"></div>
        <p>Cargando dashboard...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="card error-card">
        <AlertTriangle size={32} />
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => loadDashboardData()}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card error-card">
        <p>No hay datos disponibles. Selecciona un inventario.</p>
      </div>
    );
  }

  const { resumenGeneral, conteos, porZona, porGrupo, usuarios, productos, tiempos, reconteos, graficos, alertas } = data;

  const zonePie = graficos?.distribucionPorZona?.map((item, index) => ({
    ...item,
    fill: COLORS[index % COLORS.length]
  })) || [];

  const evolucionData = graficos?.evolucionPorDia || [];
  const comparacionData = graficos?.comparacionPorZona || [];

  return (
    <div className="dashboard-container">
      {/* Header con control de tiempo real */}
      <div className="card filters-card">
        <div className="filters-header">
          <div className="filters-form">
            <div className="form-group">
              <label>Inventario</label>
              <select 
                value={inventarioId} 
                onChange={(e) => setInventarioId(e.target.value)}
                disabled={loading || refreshing}
              >
                <option value="">Seleccionar inventario</option>
                {inventarios.map((inv) => (
                  <option key={inv.id} value={inv.id}>{inv.nombre} - {inv.fecha}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Fecha específica</label>
              <input 
                type="date" 
                value={fecha} 
                onChange={(e) => setFecha(e.target.value)}
                disabled={loading || refreshing}
              />
            </div>
            <button 
              className="btn btn-primary" 
              onClick={handleFilter}
              disabled={loading || refreshing}
            >
              Filtrar
            </button>
          </div>
          
          <div className="filters-actions">
            {lastUpdate && (
              <div className="last-update">
                <Clock size={14} />
                <span>Última actualización: {lastUpdate.toLocaleTimeString()}</span>
              </div>
            )}
            <button 
              className="btn btn-outline" 
              onClick={handleRefresh} 
              disabled={refreshing || loading}
            >
              <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
              {refreshing ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
        </div>
      </div>

      {/* KPIs Principales */}
      <div className="kpi-grid">
        <KpiCard title="Total Zonas" value={resumenGeneral?.totalZonas} icon={LayoutGrid} />
        <KpiCard title="Total Grupos" value={resumenGeneral?.totalGrupos} icon={Users} />
        <KpiCard title="Total Asignaciones" value={resumenGeneral?.totalAsignaciones} icon={BarChart3} />
        <KpiCard title="Total Escaneos" value={resumenGeneral?.totalEscaneos} icon={ScanLine} />
        <KpiCard title="Productos Distintos" value={resumenGeneral?.productosDistintos} icon={Boxes} />
      </div>

      {/* Conteos */}
      <div className="kpi-grid">
        <KpiCard title="Conteo 1" value={conteos?.conteo1} icon={CheckCircle2} />
        <KpiCard title="Conteo 2" value={conteos?.conteo2} icon={CheckCircle2} />
        <KpiCard title="Reconteos" value={conteos?.reconteos || 0} icon={Clock} />
        <KpiCard title="Diferencia Global" value={conteos?.diferenciaGlobal} icon={GitCompareArrows} />
        <KpiCard title="Precisión" value={`${conteos?.precisionPorcentaje || 0}%`} icon={Trophy} />
      </div>

      {/* Rankings de Grupos */}
      <div className="rankings-grid">
        <div className="card ranking-card">
          <div className="ranking-header"><Trophy size={18} color="#f59e0b" /> Grupo más productivo</div>
          <div className="ranking-content">
            <strong>{porGrupo?.grupoMasProductivo?.nombre || 'N/D'}</strong>
            <p className="muted">{porGrupo?.grupoMasProductivo?.totalUnidades || 0} unidades</p>
          </div>
        </div>
        <div className="card ranking-card">
          <div className="ranking-header"><AlertTriangle size={18} color="#ef4444" /> Grupo menor diferencia</div>
          <div className="ranking-content">
            <strong>{porGrupo?.grupoMenorDiferencia?.nombre || 'N/D'}</strong>
            <p className="muted">Diferencia: {porGrupo?.grupoMenorDiferencia?.diferenciaTotal || 0}</p>
          </div>
        </div>
        <div className="card ranking-card">
          <div className="ranking-header"><Zap size={18} color="#10b981" /> Grupo más rápido</div>
          <div className="ranking-content">
            <strong>{porGrupo?.grupoMasRapido?.nombre || 'N/D'}</strong>
            <p className="muted">{porGrupo?.grupoMasRapido?.tiempoFormateado || 'N/D'}</p>
          </div>
        </div>
        <div className="card ranking-card">
          <div className="ranking-header"><Trophy size={18} color="#3b82f6" /> Grupo que terminó primero</div>
          <div className="ranking-content">
            <strong>{porGrupo?.grupoTerminoPrimero?.nombre || 'N/D'}</strong>
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="charts-grid">
        <div className="card chart-card">
          <h3><CalendarDays size={16} /> Evolución de escaneos por día</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={evolucionData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="fecha" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="total" name="Escaneos" stroke="#2563eb" strokeWidth={2} />
              <Line type="monotone" dataKey="gruposActivos" name="Grupos activos" stroke="#10b981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card chart-card">
          <h3><LayoutGrid size={16} /> Distribución por zona</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={zonePie} dataKey="total" nameKey="zona" outerRadius={90} label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                {zonePie.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card chart-card full-width">
        <h3><GitCompareArrows size={16} /> Conteo 1 vs Conteo 2 por zona</h3>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={comparacionData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="zona" angle={-45} textAnchor="end" height={80} interval={0} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="conteo1" name="Conteo 1" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="conteo2" name="Conteo 2" fill="#16a34a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detalle por Zona */}
      <div className="card">
        <h3>Detalle por Zona</h3>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Zona</th><th>Código</th><th>Conteo 1</th><th>Conteo 2</th><th>Total</th><th>Diferencia</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {porZona?.map((zona) => (
                <tr key={zona.id} className={zona.estado === 'requiere reconteo' ? 'row-warning' : ''}>
                  <td><strong>{zona.nombre}</strong></td>
                  <td>{zona.codigo}</td>
                  <td>{zona.conteo1}</td>
                  <td>{zona.conteo2}</td>
                  <td>{zona.totalUnidades}</td>
                  <td>{zona.diferencia}</td>
                  <td><span className={`status-badge ${zona.estado === 'coincide' ? 'success' : zona.estado === 'diferencia menor' ? 'warning' : 'danger'}`}>{zona.estado}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alertas y Estadísticas */}
      <div className="alerts-grid">
        <div className="card alert-card">
          <h3><AlertTriangle size={16} /> Alertas</h3>
          <div className="alert-item"><strong>Zonas que requieren reconteo:</strong> {alertas?.zonasRequierenReconteo?.length || 0}</div>
          <div className="alert-item"><strong>Grupos sin actividad:</strong> {alertas?.gruposSinActividad?.length || 0}</div>
          <div className="alert-item"><strong>Fechas sin conteo 2:</strong> {alertas?.fechasSinConteo2?.length || 0}</div>
        </div>

        <div className="card stats-card">
          <h3><Clock size={16} /> Tiempos</h3>
          <div className="stats-item"><strong>Tiempo total:</strong> {tiempos?.tiempoTotalFormateado || 'N/D'}</div>
          <div className="stats-item"><strong>Tiempo entre escaneos:</strong> {tiempos?.tiempoPromedioEntreEscaneos || 'N/D'}</div>
          <div className="stats-item"><strong>Inicio:</strong> {tiempos?.inicioGeneral ? new Date(tiempos.inicioGeneral).toLocaleString() : 'N/D'}</div>
          <div className="stats-item"><strong>Fin:</strong> {tiempos?.finGeneral ? new Date(tiempos.finGeneral).toLocaleString() : 'N/D'}</div>
        </div>

        <div className="card stats-card">
          <h3><Users size={16} /> Top Usuarios</h3>
          {usuarios?.topUsuarios?.slice(0, 5).map((u, i) => (
            <div key={u.id} className="stats-item">
              <span>{i + 1}. {u.nombre}</span>
              <strong>{u.totalEscaneos} escaneos</strong>
            </div>
          ))}
        </div>

        <div className="card stats-card">
          <h3><Boxes size={16} /> Top Productos</h3>
          {productos?.topProductos?.slice(0, 5).map((p, i) => (
            <div key={p.sku} className="stats-item">
              <span title={p.descripcion}>{p.sku}</span>
              <strong>{p.totalEscaneos} unidades</strong>
            </div>
          ))}
        </div>
      </div>

      {/* Estadísticas de Reconteos */}
      <div className="card">
        <h3>Estadísticas de Reconteos</h3>
        <div className="reconteos-stats">
          <div><strong>Total discrepancias:</strong> {reconteos?.totalDiscrepancias || 0}</div>
          <div><strong>Zonas con reconteo:</strong> {reconteos?.zonasConReconteo || 0}</div>
          <div><strong>Grupos con reconteo:</strong> {reconteos?.gruposConReconteo || 0}</div>
          <div><strong>Diferencia promedio:</strong> {reconteos?.diferenciaPromedio || 0} unidades</div>
        </div>
      </div>
    </div>
  );
}