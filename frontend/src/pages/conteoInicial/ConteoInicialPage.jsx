import { useEffect, useState } from 'react';
import {
  Database,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Download,
  Server,
  Search,
  Package,
  MapPin,
  X,
  Filter
} from 'lucide-react';
import { getInventarios } from '../../services/inventarios.service';
import {
  importConteoInicialExcel,
  getConteoInicialResumen,
  syncFromSqlServer,
  getSqlServerConnectionStatus
} from '../../services/conteoInicial.service';
import api from '../../services/api';

export default function ConteoInicialPage() {
  const [inventarioActivo, setInventarioActivo] = useState(null);
  const [file, setFile] = useState(null);
  const [resumen, setResumen] = useState([]);
  const [filteredResumen, setFilteredResumen] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sqlServerStatus, setSqlServerStatus] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [zonaFiltro, setZonaFiltro] = useState('');

  async function loadInventarioActivo() {
    try {
      const inventarios = await getInventarios();
      if (inventarios && inventarios.length > 0) {
        const activo = inventarios.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        setInventarioActivo(activo);
        return activo.id;
      }
      setInventarioActivo(null);
      return null;
    } catch (err) {
      console.error('Error cargando inventarios:', err);
      setError('No se pudo cargar el inventario activo');
      setInventarioActivo(null);
      return null;
    }
  }

  async function loadResumen(inventarioId) {
    if (!inventarioId) {
      setResumen([]);
      setFilteredResumen([]);
      return;
    }
    try {
      const data = await getConteoInicialResumen(inventarioId);
      setResumen(data || []);
      setFilteredResumen(data || []);
    } catch (err) {
      console.error('Error cargando resumen:', err);
      setError('No se pudo cargar el resumen');
      setResumen([]);
      setFilteredResumen([]);
    }
  }

  async function checkSqlServerStatus() {
    try {
      const status = await getSqlServerConnectionStatus();
      setSqlServerStatus(status);
    } catch (err) {
      setSqlServerStatus({ connected: false, error: err.message });
    }
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      const inventarioId = await loadInventarioActivo();
      await loadResumen(inventarioId);
      await checkSqlServerStatus();
      setLoading(false);
    }
    init();
  }, []);

  // Filtrar por búsqueda y zona
  useEffect(() => {
    let filtered = [...resumen];
    
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.sku?.toLowerCase().includes(term) ||
        item.descripcion?.toLowerCase().includes(term)
      );
    }
    
    if (zonaFiltro) {
      filtered = filtered.filter(item => item.zona === zonaFiltro);
    }
    
    setFilteredResumen(filtered);
  }, [searchTerm, resumen, zonaFiltro]);

  const handleImportExcel = async (e) => {
    e.preventDefault();
    if (!inventarioActivo) {
      setError('No hay inventario activo. Crea un inventario primero.');
      return;
    }
    if (!file) {
      setError('Selecciona un archivo Excel');
      return;
    }

    setImporting(true);
    setError('');
    setMessage('');
    setImportResult(null);

    try {
      const result = await importConteoInicialExcel(inventarioActivo.id, file);
      setImportResult(result.data);
      setMessage(result.message || 'Conteo inicial importado correctamente');
      setFile(null);
      await loadResumen(inventarioActivo.id);

      const fileInput = document.getElementById('excel-file');
      if (fileInput) fileInput.value = '';
    } catch (err) {
      setError(err.response?.data?.message || 'Error al importar archivo');
    } finally {
      setImporting(false);
    }
  };

  const handleSyncFromSqlServer = async () => {
    if (!inventarioActivo) {
      setError('No hay inventario activo. Crea un inventario primero.');
      return;
    }

    setSyncing(true);
    setError('');
    setMessage('');
    setSyncResult(null);

    try {
      const result = await syncFromSqlServer(inventarioActivo.id);
      setSyncResult(result.data);
      setMessage(result.message || 'Sincronización completada');
      await loadResumen(inventarioActivo.id);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  const handleDescargarPlantilla = async () => {
    try {
      const response = await api.post('/scripts/exportar-excel', {}, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'plantilla_conteo_inicial.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setMessage('Plantilla descargada correctamente');
    } catch (err) {
      setError('Error al descargar plantilla');
    }
  };

  // Obtener zonas únicas para el filtro
  const zonasUnicas = [...new Set(resumen.map(item => item.zona).filter(Boolean))];

  const totalProductos = filteredResumen.length;
  const totalUnidades = filteredResumen.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
  const totalBodega = filteredResumen.reduce((sum, item) => sum + (Number(item.cantidadBodega) || 0), 0);
  const totalExhibicion = filteredResumen.reduce((sum, item) => sum + (Number(item.cantidadExhibicion) || 0), 0);

  if (loading) {
    return (
      <div className="card loading-card">
        <div className="loading-spinner" />
        <p>Cargando módulo de conteo inicial...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Tarjetas de resumen - responsive */}
      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-icon"><Package size={24} /></div>
          <div className="kpi-content">
            <p className="kpi-title">Total Productos</p>
            <h3 className="kpi-value">{totalProductos.toLocaleString()}</h3>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-icon"><Database size={24} /></div>
          <div className="kpi-content">
            <p className="kpi-title">Total Unidades</p>
            <h3 className="kpi-value">{totalUnidades.toLocaleString()}</h3>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-icon"><MapPin size={24} /></div>
          <div className="kpi-content">
            <p className="kpi-title">Unidades en Bodega</p>
            <h3 className="kpi-value">{totalBodega.toLocaleString()}</h3>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-icon"><MapPin size={24} /></div>
          <div className="kpi-content">
            <p className="kpi-title">Unidades en Exhibición</p>
            <h3 className="kpi-value">{totalExhibicion.toLocaleString()}</h3>
          </div>
        </div>
      </div>

      {/* Mensaje si no hay inventario activo */}
      {!inventarioActivo && (
        <div className="alert-warning">
          <AlertCircle size={18} />
          <span>No hay inventarios activos. Ve a la sección "Inventarios" y crea uno.</span>
        </div>
      )}

      {/* Importadores - responsive */}
      <div className="importadores-grid">
        <div className="card importador-card">
          <h2 className="section-title"><FileSpreadsheet size={20} /> Importar desde Excel</h2>
          <form onSubmit={handleImportExcel}>
            <div className="form-group">
              <label>Archivo Excel (.xlsx)</label>
              <input
                id="excel-file"
                type="file"
                accept=".xlsx, .xls"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                disabled={!inventarioActivo}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={importing || !inventarioActivo}>
              {importing ? 'Importando...' : <><Upload size={16} /> Importar Excel</>}
            </button>
          </form>
        </div>

        <div className="card importador-card">
          <h2 className="section-title"><Server size={20} /> Descargar plantilla</h2>
          <p className="muted">
            Descarga la plantilla con el formato correcto para importar inventario.
          </p>
          <button className="btn btn-outline" onClick={handleDescargarPlantilla}>
            <Download size={16} /> Descargar plantilla
          </button>
        </div>
      </div>

      {/* Estado de SQL Server */}
      {sqlServerStatus && (
        <div className={`sql-status ${sqlServerStatus.connected ? 'connected' : 'disconnected'}`}>
          <Server size={18} />
          <span>
            SQL Server: {sqlServerStatus.connected ? 'Conectado' : 'Desconectado'}
            {sqlServerStatus.database && ` - ${sqlServerStatus.database}`}
            {sqlServerStatus.error && ` - ${sqlServerStatus.error}`}
          </span>
          {!sqlServerStatus.connected && (
            <button className="btn btn-outline" onClick={handleSyncFromSqlServer} disabled={syncing || !inventarioActivo}>
              <RefreshCw size={14} className={syncing ? 'spin' : ''} />
              <span>Reintentar</span>
            </button>
          )}
        </div>
      )}

      {/* Buscador y filtros - responsive */}
      <div className="card filtros-card">
        <div className="filtros-header">
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              placeholder="Buscar por código o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={resumen.length === 0}
            />
          </div>
          <button 
            className="btn btn-outline filtros-toggle"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} />
            <span>Filtros {zonaFiltro && <span className="filtro-activo">(1)</span>}</span>
          </button>
        </div>

        {showFilters && (
          <div className="filtros-panel">
            <div className="filtro-group">
              <label>Filtrar por zona</label>
              <select value={zonaFiltro} onChange={(e) => setZonaFiltro(e.target.value)}>
                <option value="">Todas las zonas</option>
                {zonasUnicas.map(zona => (
                  <option key={zona} value={zona}>{zona}</option>
                ))}
              </select>
            </div>
            {zonaFiltro && (
              <button className="btn btn-sm btn-outline" onClick={() => setZonaFiltro('')}>
                <X size={14} /> Limpiar filtro
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabla de productos - responsive con scroll */}
      <div className="card tabla-card">
        <div className="tabla-header">
          <h2 className="section-title"><Database size={20} /> Productos</h2>
          {inventarioActivo && resumen.length > 0 && (
            <button className="btn btn-outline" onClick={() => window.location.href = `/api/v1/conteo-inicial/exportar?inventarioId=${inventarioActivo.id}`}>
              <Download size={16} /> Exportar
            </button>
          )}
        </div>

        {resumen.length === 0 ? (
          <div className="empty-state">
            <Database size={48} className="text-muted" />
            <p>No hay datos de conteo inicial.</p>
            <p className="muted">Importa un archivo Excel o sincroniza desde SQL Server para comenzar.</p>
          </div>
        ) : (
          <div className="table-responsive-container">
            <table className="data-table responsive-table">
              <thead>
                <tr>
                  <th>Zona</th>
                  <th>SKU</th>
                  <th>Descripción</th>
                  <th className="text-center">Bodega</th>
                  <th className="text-center">Exhibición</th>
                  <th className="text-center">Total</th>
                  <th>Origen</th>
                </tr>
              </thead>
              <tbody>
                {filteredResumen.map((item, idx) => (
                  <tr key={idx}>
                    <td data-label="Zona">{item.zona || 'N/A'}</td>
                    <td data-label="SKU"><strong>{item.sku}</strong></td>
                    <td data-label="Descripción">{item.descripcion || 'Sin descripción'}</td>
                    <td data-label="Bodega" className={item.cantidadBodega > 0 ? 'text-primary' : 'text-muted'}>
                      {item.cantidadBodega?.toLocaleString() || 0}
                    </td>
                    <td data-label="Exhibición" className={item.cantidadExhibicion > 0 ? 'text-primary' : 'text-muted'}>
                      {item.cantidadExhibicion?.toLocaleString() || 0}
                    </td>
                    <td data-label="Total" className="text-success">
                      <strong>{item.total?.toLocaleString() || 0}</strong>
                    </td>
                    <td data-label="Origen">{item.origen || 'Manual'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {message && <div className="alert-success">{message}</div>}
      {error && <div className="alert-error">{error}</div>}
    </div>
  );
}