import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, GitCompareArrows, ShieldCheck } from 'lucide-react';
import { getInventarios } from '../../services/inventarios.service';
import {
  getConteo1VsConteo2,
  getInicialVsConteo1
} from '../../services/diferencias.service';

function getZoneSummary(rows) {
  const byZone = new Map();

  for (const row of rows) {
    const key = `${row.zonaId}-${row.zona}`;
    const current = byZone.get(key) || {
      zonaId: row.zonaId,
      zona: row.zona,
      diferenciaTotal: 0,
      skusConDiferencia: 0
    };

    current.diferenciaTotal += Number(row.diferencia || 0);
    if (Number(row.diferencia || 0) > 0) {
      current.skusConDiferencia += 1;
    }

    byZone.set(key, current);
  }

  return Array.from(byZone.values()).sort((a, b) => b.diferenciaTotal - a.diferenciaTotal);
}

export default function DiferenciasPage() {
  const [inventarios, setInventarios] = useState([]);
  const [inventarioId, setInventarioId] = useState('');
  const [modo, setModo] = useState('conteo1-vs-conteo2');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function boot() {
    const inventariosData = await getInventarios();
    setInventarios(inventariosData);

    const firstInventarioId = inventariosData[0]?.id || '';
    setInventarioId(firstInventarioId);

    if (firstInventarioId) {
      const data = await getConteo1VsConteo2(firstInventarioId);
      setRows(data);
    }
  }

  async function loadData(selectedInventarioId, selectedModo) {
    if (!selectedInventarioId) {
      setRows([]);
      return;
    }

    const data =
      selectedModo === 'inicial-vs-conteo1'
        ? await getInicialVsConteo1(selectedInventarioId)
        : await getConteo1VsConteo2(selectedInventarioId);

    setRows(data);
  }

  useEffect(() => {
    boot()
      .catch(() => setError('No se pudieron cargar las diferencias'))
      .finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => {
    const totalFilas = rows.length;
    const totalDiferencia = rows.reduce((acc, item) => acc + Number(item.diferencia || 0), 0);
    const filasConDiferencia = rows.filter((item) => Number(item.diferencia || 0) > 0).length;
    const zonasAfectadas = new Set(
      rows.filter((item) => Number(item.diferencia || 0) > 0).map((item) => item.zonaId)
    ).size;

    return {
      totalFilas,
      totalDiferencia,
      filasConDiferencia,
      zonasAfectadas
    };
  }, [rows]);

  const zoneSummary = useMemo(() => getZoneSummary(rows), [rows]);

  if (loading) {
    return <div className="card">Cargando diferencias...</div>;
  }

  return (
    <div className="grid-stack">
      <div className="card">
        <div className="filters-row">
          <div className="form-group filter-item">
            <label>Inventario</label>
            <select
              value={inventarioId}
              onChange={async (e) => {
                const value = Number(e.target.value);
                setInventarioId(value);
                setError('');
                await loadData(value, modo);
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

          <div className="form-group filter-item">
            <label>Comparación</label>
            <select
              value={modo}
              onChange={async (e) => {
                const value = e.target.value;
                setModo(value);
                setError('');
                await loadData(inventarioId, value);
              }}
            >
              <option value="conteo1-vs-conteo2">Conteo 1 vs Conteo 2</option>
              <option value="inicial-vs-conteo1">Inicial vs Conteo 1</option>
            </select>
          </div>
        </div>

        {error ? <div className="alert-error">{error}</div> : null}
      </div>

      <div className="grid-4">
        <div className="card mini-kpi">
          <div className="kpi-icon"><GitCompareArrows size={18} /></div>
          <div>
            <span className="muted">Filas comparadas</span>
            <strong>{summary.totalFilas}</strong>
          </div>
        </div>

        <div className="card mini-kpi">
          <div className="kpi-icon"><AlertTriangle size={18} /></div>
          <div>
            <span className="muted">Filas con diferencia</span>
            <strong>{summary.filasConDiferencia}</strong>
          </div>
        </div>

        <div className="card mini-kpi">
          <div className="kpi-icon"><ShieldCheck size={18} /></div>
          <div>
            <span className="muted">Zonas afectadas</span>
            <strong>{summary.zonasAfectadas}</strong>
          </div>
        </div>

        <div className="card mini-kpi">
          <div className="kpi-icon"><GitCompareArrows size={18} /></div>
          <div>
            <span className="muted">Diferencia total</span>
            <strong>{summary.totalDiferencia}</strong>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Resumen por zona</h2>

          {zoneSummary.length === 0 ? (
            <p className="muted">No hay diferencias para mostrar.</p>
          ) : (
            <div className="table-list">
              {zoneSummary.map((item) => (
                <div key={`${item.zonaId}-${item.zona}`} className="list-row">
                  <div>
                    <strong>{item.zona}</strong>
                    <p className="muted">
                      Diferencia total: {item.diferenciaTotal} | SKUs con diferencia: {item.skusConDiferencia}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Interpretación</h2>
          <p className="muted">
            Esta vista te muestra dónde no coinciden los conteos. Las filas con diferencia distinta de cero
            son las candidatas a revisión o tercer conteo.
          </p>
          <p className="muted">
            La comparación activa es: <strong>{modo === 'inicial-vs-conteo1' ? 'Inicial vs Conteo 1' : 'Conteo 1 vs Conteo 2'}</strong>.
          </p>
        </div>
      </div>

      <div className="card">
        <h2>Detalle por SKU</h2>

        {rows.length === 0 ? (
          <p className="muted">No hay datos para esta comparación.</p>
        ) : (
          <div className="table-list">
            {rows.map((item, index) => (
              <div
                key={`${item.zonaId}-${item.sku}-${index}`}
                className={`list-row ${Number(item.diferencia) > 0 ? 'row-warning' : ''}`}
              >
                <div>
                  <strong>{item.sku}</strong>
                  <p className="muted">
                    Zona: {item.zona || 'Sin zona'} | {item.descripcion || 'Sin descripción'}
                  </p>
                  {modo === 'inicial-vs-conteo1' ? (
                    <p className="muted">
                      Inicial: {item.inicial} | Conteo 1: {item.conteo1} | Diferencia: {item.diferencia}
                    </p>
                  ) : (
                    <p className="muted">
                      Conteo 1: {item.conteo1} | Conteo 2: {item.conteo2} | Diferencia: {item.diferencia}
                    </p>
                  )}
                </div>

                <span className={`status-pill ${Number(item.diferencia) > 0 ? 'warning' : 'success'}`}>
                  {Number(item.diferencia) > 0 ? 'Diferencia' : 'Coincide'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}