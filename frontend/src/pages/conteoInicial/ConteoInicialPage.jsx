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
  MapPin
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

  // Cargar el último inventario activo
  async function loadInventarioActivo() {
    try {
      const inventarios = await getInventarios();
      if (inventarios && inventarios.length > 0) {
        // Tomar el último inventario creado o el activo
        const activo = inventarios.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        setInventarioActivo(activo);
        return activo.id;
      }
      return null;
    } catch (err) {
      setError('No se pudo cargar el inventario activo');
      return null;
    }
  }

  async function loadResumen(inventarioId) {
    if (!inventarioId) return;
    try {
      const data = await getConteoInicialResumen(inventarioId);
      setResumen(data);
      setFilteredResumen(data);
    } catch (err) {
      setError('No se pudo cargar el resumen');
    } finally {
      setLoading(false);
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
      const inventarioId = await loadInventarioActivo();
      if (inventarioId) {
        await loadResumen(inventarioId);
      }
      await checkSqlServerStatus();
    }
    init();
  }, []);

  // Filtrar por búsqueda
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredResumen(resumen);
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = resumen.filter(item => 
        item.sku?.toLowerCase().includes(term) || 
        item.descripcion?.toLowerCase().includes(term)
      );
      setFilteredResumen(filtered);
    }
  }, [searchTerm, resumen]);

  const handleImportExcel = async (e) => {
    e.preventDefault();
    if (!inventarioActivo) {
      setError('No hay inventario activo');
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
      setError('No hay inventario activo');
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

  const totalProductos = filteredResumen.length;
  const totalUnidades = filteredResumen.reduce((sum, item) => sum + (item.total || 0), 0);
  const totalBodega = filteredResumen.reduce((sum, item) => sum + (item.cantidadBodega || 0), 0);
  const totalExhibicion = filteredResumen.reduce((sum, item) => sum + (item.cantidadExhibicion || 0), 0);

  if (loading) return <div className="card">Cargando...</div>;
  
  return (
    <div className="dashboard-container">
      {/* Tarjetas de resumen */}
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
        
      {/* Importadores */}
      <div className="grid-2">
        <div className="card">
          <h2 className="section-title"><FileSpreadsheet size={20} /> Importar desde Excel</h2>
          <form onSubmit={handleImportExcel}>
            <div className="form-group">
              <label>Archivo Excel (.xlsx)</label>
              <input
                id="excel-file"
                type="file"
                accept=".xlsx, .xls"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={importing}>
              {importing ? 'Importando...' : <><Upload size={16} /> Importar Excel</>}
            </button>
          </form>
        </div>

        <div className="card">
          <h2 className="section-title"><Server size={20} /> Descargar plantilla</h2>
          <p className="muted">
            Descarga la plantilla con el formato correcto para importar inventario desde Melissa.
          </p>
          <button className="btn btn-outline" onClick={handleDescargarPlantilla}>
            <Download size={16} /> Descargar plantilla Melissa
          </button>
        </div>
      </div>

      {/* Estado de SQL Server */}
      {sqlServerStatus && (
        <div className={`alert-${sqlServerStatus.connected ? 'success' : 'warning'}`}>
          <Server size={18} />
          <span>
            SQL Server: {sqlServerStatus.connected ? 'Conectado' : 'Desconectado'}
            {sqlServerStatus.database && ` - ${sqlServerStatus.database}`}
            {sqlServerStatus.error && ` - ${sqlServerStatus.error}`}
          </span>
          {!sqlServerStatus.connected && (
            <button className="btn btn-outline ml-2" onClick={handleSyncFromSqlServer} disabled={syncing}>
              <RefreshCw size={14} className={syncing ? 'spin' : ''} />
              <span>Reintentar</span>
            </button>
          )}
        </div>
      )}

      {/* Buscador */}
      <div className="card">
        <div className="search-row">
          <Search size={18} />
          <input
            type="text"
            placeholder="Buscar por código o descripción..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Tabla de productos */}
      <div className="card">
        <div className="list-header">
          <h2 className="section-title"><Database size={20} /> Productos</h2>
          <button className="btn btn-outline" onClick={() => window.location.href = `/api/v1/conteo-inicial/exportar?inventarioId=${inventarioActivo?.id}`}>
            <Download size={16} /> Exportar Excel
          </button>
        </div>

        {filteredResumen.length === 0 ? (
          <p className="muted">No hay datos. Importa un archivo o sincroniza desde SQL Server.</p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Zona</th>
                  <th>SKU</th>
                  <th>Descripción</th>
                  <th>Bodega</th>
                  <th>Exhibición</th>
                  <th>Total</th>
                  <th>Origen</th>
                </tr>
              </thead>
              <tbody>
                {filteredResumen.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.zona || 'N/A'}</td>
                    <td><strong>{item.sku}</strong></td>
                    <td>{item.descripcion || 'Sin descripción'}</td>
                    <td className={item.cantidadBodega > 0 ? 'text-primary' : 'text-muted'}>
                      {item.cantidadBodega?.toLocaleString() || 0}
                    </td>
                    <td className={item.cantidadExhibicion > 0 ? 'text-primary' : 'text-muted'}>
                      {item.cantidadExhibicion?.toLocaleString() || 0}
                    </td>
                    <td className="text-success"><strong>{item.total?.toLocaleString() || 0}</strong></td>
                    <td>{item.origen || 'Manual'}</td>
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