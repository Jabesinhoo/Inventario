import { useState, useEffect } from 'react';
import { 
  Database, 
  Download, 
  FileSpreadsheet, 
  AlertCircle, 
  CheckCircle,
  Loader2,
  HardDrive,
  RefreshCw,
  Table
} from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../../services/api';

export default function ScriptsPage() {
  const [exportando, setExportando] = useState(false);
  const [backup, setBackup] = useState(false);
  const [exportaciones, setExportaciones] = useState([]);
  const [productosData, setProductosData] = useState(null);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);

  // Función para exportar DIRECTAMENTE desde SQL Server vía API
const exportarDirecto = async () => {
  setExportando(true);
  setError(null);
  setResultado(null);

  try {
    const response = await api.get('/scripts/exportar-json');
    const data = response.data;

    if (!data.ok || !data.data || data.data.length === 0) {
      throw new Error('No hay datos para exportar');
    }

    const excelData = [];

    for (const producto of data.data) {
      excelData.push({
        Zona: 'BODEGA',
        SKU: producto.sku,
        Descripción: producto.descripcion || 'Sin descripción',
        Cantidad: producto.cantidadBodega || 0
      });

      excelData.push({
        Zona: 'EXHIBICION',
        SKU: producto.sku,
        Descripción: producto.descripcion || 'Sin descripción',
        Cantidad: producto.cantidadExhibicion || 0
      });
    }

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario Base');

    ws['!cols'] = [
      { wch: 12 },
      { wch: 15 },
      { wch: 50 },
      { wch: 12 }
    ];

    const filename = `inventario_base_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
    XLSX.writeFile(wb, filename);

    setResultado({
      type: 'success',
      message: `Exportación completada. Archivo: ${filename} (${excelData.length} registros)`
    });
  } catch (err) {
    console.error('Error:', err);
    setError(err.response?.data?.message || err.message || 'Error al exportar');
  } finally {
    setExportando(false);
  }
};
  const cargarExportaciones = async () => {
    setCargandoLista(true);
    try {
      const response = await api.get('/scripts/exportaciones');
      setExportaciones(response.data.data);
    } catch (err) {
      setError('No se pudieron cargar las exportaciones');
    } finally {
      setCargandoLista(false);
    }
  };

  const handleBackup = async () => {
    setBackup(true);
    setResultado(null);
    setError(null);
    
    try {
      const response = await api.post('/scripts/backup');
      setResultado({
        type: 'success',
        message: response.data.message,
        data: response.data.data
      });
      await cargarExportaciones();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al hacer backup');
    } finally {
      setBackup(false);
    }
  };

  const descargarArchivo = async (filename) => {
    try {
      const token = localStorage.getItem('inventario_token');
      const response = await fetch(`/api/v1/scripts/exportaciones/${encodeURIComponent(filename)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Error al descargar');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      setResultado({
        type: 'success',
        message: `Archivo ${filename} descargado`
      });
    } catch (err) {
      setError('Error al descargar');
    }
  };

  useEffect(() => {
    cargarExportaciones();
  }, []);

  return (
    <div className="dashboard-container">
      <div className="grid-2">
        {/* Exportar DIRECTAMENTE a Excel */}
        <div className="card">
          <h2 className="section-title">
            <FileSpreadsheet size={20} />
            <span>Exportar inventario desde SQL Server</span>
          </h2>
          <p className="muted">
            Exporta productos con existencias actuales (Bodega y Exhibición) a Excel.
            Genera el archivo directamente en tu navegador.
          </p>
          <button 
            className="btn btn-primary" 
            onClick={exportarDirecto}
            disabled={exportando}
          >
            {exportando ? (
              <><Loader2 size={16} className="spin" /> Exportando...</>
            ) : (
              <><Download size={16} /> Exportar a Excel</>
            )}
          </button>
        </div>

        {/* Backup de base de datos */}
        <div className="card">
          <h2 className="section-title">
            <HardDrive size={20} />
            <span>Respaldo de base de datos</span>
          </h2>
          <p className="muted">
            Crea un respaldo completo de PostgreSQL.
          </p>
          <button 
            className="btn btn-outline" 
            onClick={handleBackup}
            disabled={backup}
          >
            {backup ? (
              <><Loader2 size={16} className="spin" /> Respaldando...</>
            ) : (
              <><Database size={16} /> Crear respaldo</>
            )}
          </button>
        </div>
      </div>

      {resultado && (
        <div className="alert-success">
          <CheckCircle size={18} />
          <span>{resultado.message}</span>
        </div>
      )}

      {error && (
        <div className="alert-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}