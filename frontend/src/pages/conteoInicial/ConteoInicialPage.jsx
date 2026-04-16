import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { getInventarios } from '../../services/inventarios.service';
import {
  getConteoInicialResumen,
  importConteoInicialExcel
} from '../../services/conteoInicial.service';

export default function ConteoInicialPage() {
  const [inventarios, setInventarios] = useState([]);
  const [inventarioId, setInventarioId] = useState('');
  const [file, setFile] = useState(null);
  const [resumen, setResumen] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function boot() {
    const inventariosData = await getInventarios();
    setInventarios(inventariosData);

    const firstInventarioId = inventariosData[0]?.id || '';
    setInventarioId(firstInventarioId);

    if (firstInventarioId) {
      const data = await getConteoInicialResumen(firstInventarioId);
      setResumen(data);
    }
  }

  async function loadResumen(selectedInventarioId) {
    if (!selectedInventarioId) {
      setResumen([]);
      return;
    }

    const data = await getConteoInicialResumen(selectedInventarioId);
    setResumen(data);
  }

  useEffect(() => {
    boot()
      .catch(() => setError('No se pudo cargar la pantalla de conteo inicial'))
      .finally(() => setLoading(false));
  }, []);

  const handleImport = async (e) => {
    e.preventDefault();

    if (!inventarioId) {
      setError('Selecciona un inventario');
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
      const result = await importConteoInicialExcel(inventarioId, file);
      setImportResult(result.data);
      setMessage(result.message || 'Conteo inicial importado');
      setFile(null);
      await loadResumen(inventarioId);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al importar conteo inicial');
    } finally {
      setImporting(false);
    }
  };

  const resumenStats = useMemo(() => {
    const totalRegistros = resumen.length;
    const totalCantidad = resumen.reduce((acc, item) => acc + Number(item.cantidad || 0), 0);
    const zonas = new Set(resumen.map((item) => item.zonaId)).size;

    return {
      totalRegistros,
      totalCantidad,
      zonas
    };
  }, [resumen]);

  if (loading) {
    return <div className="card">Cargando conteo inicial...</div>;
  }

  return (
    <div className="grid-stack">
      <div className="grid-2">
        <div className="card">
          <h2 className="section-title">
            <Upload size={18} />
            <span>Importar conteo inicial</span>
          </h2>

          <form onSubmit={handleImport}>
            <div className="form-group">
              <label>Inventario</label>
              <select
                value={inventarioId}
                onChange={async (e) => {
                  const value = Number(e.target.value);
                  setInventarioId(value);
                  setError('');
                  setMessage('');
                  await loadResumen(value);
                }}
              >
                <option value="">Selecciona</option>
                {inventarios.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre} - {item.fecha}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Archivo .xlsx</label>
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>

            {message ? <div className="alert-success">{message}</div> : null}
            {error ? <div className="alert-error">{error}</div> : null}

            <button className="btn btn-primary" type="submit" disabled={importing}>
              {importing ? 'Importando...' : 'Importar conteo inicial'}
            </button>
          </form>

          {importResult ? (
            <div className="import-summary">
              <p><strong>Leídos:</strong> {importResult.totalLeidos}</p>
              <p><strong>Insertados:</strong> {importResult.insertados}</p>
              <p><strong>Actualizados:</strong> {importResult.actualizados}</p>
              <p><strong>Errores filas:</strong> {importResult.erroresFilas?.length || 0}</p>
              <p><strong>No resueltos:</strong> {importResult.noResueltos?.length || 0}</p>
            </div>
          ) : null}
        </div>

        <div className="card">
          <h2 className="section-title">
            <FileSpreadsheet size={18} />
            <span>Resumen del conteo inicial</span>
          </h2>

          <div className="grid-3 compact-grid">
            <div className="mini-stat">
              <span className="muted">Registros</span>
              <strong>{resumenStats.totalRegistros}</strong>
            </div>
            <div className="mini-stat">
              <span className="muted">Cantidad total</span>
              <strong>{resumenStats.totalCantidad}</strong>
            </div>
            <div className="mini-stat">
              <span className="muted">Zonas</span>
              <strong>{resumenStats.zonas}</strong>
            </div>
          </div>

          <p className="muted">
            Aquí ves la base con la que luego se compara el conteo físico.
          </p>
        </div>
      </div>

      <div className="card">
        <h2>Detalle cargado</h2>

        {resumen.length === 0 ? (
          <p className="muted">No hay datos de conteo inicial para este inventario.</p>
        ) : (
          <div className="table-list">
            {resumen.map((item) => (
              <div key={item.id} className="list-row">
                <div>
                  <strong>{item.sku}</strong>
                  <p className="muted">
                    Zona: {item.zona?.nombre} ({item.zona?.codigo}) | Cantidad: {item.cantidad}
                  </p>
                  <p className="muted">
                    {item.descripcionSnapshot || 'Sin descripción'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}