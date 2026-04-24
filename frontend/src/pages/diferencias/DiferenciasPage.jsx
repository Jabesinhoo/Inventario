import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, GitCompareArrows, Download, Users, MapPin, User } from 'lucide-react';
import { getInventarios } from '../../services/inventarios.service';
import { getGrupos } from '../../services/grupos.service';
import {
  compareInventariosDiferencias,
  exportarDiferenciasExcel
} from '../../services/diferencias.service';

function getEscaneos(item) {
  return item?.totalEscaneos ?? item?.totalescaneos ?? 0;
}

function getProductos(item) {
  return item?.productosUnicos ?? item?.productosunicos ?? 0;
}

function normalizeZoneText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function zonesAreEquivalent(zonaA, zonaB) {
  if (!zonaA || !zonaB) return false;

  const codigoA = normalizeZoneText(zonaA.codigo);
  const codigoB = normalizeZoneText(zonaB.codigo);

  if (codigoA && codigoB) {
    return codigoA === codigoB;
  }

  const nombreA = normalizeZoneText(zonaA.nombre);
  const nombreB = normalizeZoneText(zonaB.nombre);

  return nombreA === nombreB;
}

function buildZoneOptions(groups) {
  const map = new Map();

  for (const grupo of groups || []) {
    const zona = grupo?.zonaAsignada;
    if (!zona?.id) continue;

    if (!map.has(zona.id)) {
      map.set(zona.id, {
        id: zona.id,
        nombre: zona.nombre,
        codigo: zona.codigo || '',
        grupos: [grupo.nombre]
      });
    } else {
      const current = map.get(zona.id);
      current.grupos.push(grupo.nombre);
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    String(a.nombre).localeCompare(String(b.nombre))
  );
}

function getZonaLabel(zona) {
  const grupos = zona.grupos?.length ? ` · ${zona.grupos.join(', ')}` : '';
  return `${zona.nombre}${zona.codigo ? ` (${zona.codigo})` : ''}${grupos}`;
}

export default function DiferenciasPage() {
  const [inventarios, setInventarios] = useState([]);
  const [inventarioBaseId, setInventarioBaseId] = useState('');
  const [inventarioComparadoId, setInventarioComparadoId] = useState('');

  const [gruposBase, setGruposBase] = useState([]);
  const [gruposComparado, setGruposComparado] = useState([]);

  const [zonaBaseId, setZonaBaseId] = useState('');
  const [zonaComparadaId, setZonaComparadaId] = useState('');

  const [data, setData] = useState(null);
  const [tab, setTab] = useState('diferencias');
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const zonasBaseOptions = useMemo(() => buildZoneOptions(gruposBase), [gruposBase]);
  const zonasComparadoOptions = useMemo(() => buildZoneOptions(gruposComparado), [gruposComparado]);

  const zonaBaseSeleccionada =
    zonasBaseOptions.find((z) => Number(z.id) === Number(zonaBaseId)) || null;

  const zonaComparadaSeleccionada =
    zonasComparadoOptions.find((z) => Number(z.id) === Number(zonaComparadaId)) || null;

  const zonasComparadoFiltradas = zonaBaseSeleccionada
    ? zonasComparadoOptions.filter((z) => zonesAreEquivalent(zonaBaseSeleccionada, z))
    : zonasComparadoOptions;

  const zonasBaseFiltradas = zonaComparadaSeleccionada
    ? zonasBaseOptions.filter((z) => zonesAreEquivalent(z, zonaComparadaSeleccionada))
    : zonasBaseOptions;

  async function loadInventariosData() {
    try {
      const rows = await getInventarios();
      setInventarios(rows || []);

      if (rows?.length >= 2) {
        setInventarioBaseId(rows[0].id);
        setInventarioComparadoId(rows[1].id);
      } else if (rows?.length === 1) {
        setInventarioBaseId(rows[0].id);
      }
    } catch (err) {
      setError('No se pudieron cargar los inventarios');
    } finally {
      setLoading(false);
    }
  }

  async function loadGruposBase(inventarioId) {
    if (!inventarioId) {
      setGruposBase([]);
      setZonaBaseId('');
      return;
    }

    try {
      const rows = await getGrupos(inventarioId);
      setGruposBase(rows || []);
    } catch {
      setGruposBase([]);
    }
  }

  async function loadGruposComparado(inventarioId) {
    if (!inventarioId) {
      setGruposComparado([]);
      setZonaComparadaId('');
      return;
    }

    try {
      const rows = await getGrupos(inventarioId);
      setGruposComparado(rows || []);
    } catch {
      setGruposComparado([]);
    }
  }

  useEffect(() => {
    loadInventariosData();
  }, []);

  useEffect(() => {
    loadGruposBase(inventarioBaseId);
    setZonaBaseId('');
  }, [inventarioBaseId]);

  useEffect(() => {
    loadGruposComparado(inventarioComparadoId);
    setZonaComparadaId('');
  }, [inventarioComparadoId]);

  async function handleComparar() {
    try {
      setComparing(true);
      setError('');

      if (!inventarioBaseId || !inventarioComparadoId) {
        setError('Debes seleccionar ambos inventarios');
        return;
      }

      if (Number(inventarioBaseId) === Number(inventarioComparadoId)) {
        setError('Debes seleccionar inventarios distintos');
        return;
      }

      if ((zonaBaseId && !zonaComparadaId) || (!zonaBaseId && zonaComparadaId)) {
        setError('Si comparas por zona, debes seleccionar zona base y zona comparada.');
        return;
      }

      if (zonaBaseSeleccionada && zonaComparadaSeleccionada) {
        if (!zonesAreEquivalent(zonaBaseSeleccionada, zonaComparadaSeleccionada)) {
          setError('No puedes comparar zonas distintas.');
          return;
        }
      }

      const response = await compareInventariosDiferencias({
        inventarioBaseId,
        inventarioComparadoId,
        zonaBaseId: zonaBaseId || undefined,
        zonaComparadaId: zonaComparadaId || undefined
      });

      setData(response);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo comparar los inventarios');
    } finally {
      setComparing(false);
    }
  }

  async function handleExportar() {
    try {
      setExporting(true);
      setError('');

      if ((zonaBaseId && !zonaComparadaId) || (!zonaBaseId && zonaComparadaId)) {
        setError('Si comparas por zona, debes seleccionar zona base y zona comparada.');
        return;
      }

      if (zonaBaseSeleccionada && zonaComparadaSeleccionada) {
        if (!zonesAreEquivalent(zonaBaseSeleccionada, zonaComparadaSeleccionada)) {
          setError('No puedes exportar comparación entre zonas distintas.');
          return;
        }
      }

      await exportarDiferenciasExcel({
        inventarioBaseId,
        inventarioComparadoId,
        zonaBaseId: zonaBaseId || undefined,
        zonaComparadaId: zonaComparadaId || undefined
      });
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo exportar el Excel');
    } finally {
      setExporting(false);
    }
  }

  const resumen = data?.resumen || {
    totalComparados: 0,
    totalCoinciden: 0,
    totalDifieren: 0
  };

  const rowsActivos = useMemo(() => {
    if (!data) return [];
    return tab === 'coinciden' ? data.coinciden || [] : data.diferencias || [];
  }, [data, tab]);

  const gruposBaseTotales = data?.totales?.base?.grupos || [];
  const gruposComparadoTotales = data?.totales?.comparado?.grupos || [];
  const zonasBase = data?.totales?.base?.zonas || [];
  const zonasComparado = data?.totales?.comparado?.zonas || [];
  const miembrosBase = data?.totales?.base?.miembros || [];
  const miembrosComparado = data?.totales?.comparado?.miembros || [];

  if (loading) {
    return <div className="card">Cargando diferencias...</div>;
  }

  return (
    <div className="dashboard-container">
      <div className="card">
        <div className="list-header">
          <h2 className="section-title">
            <GitCompareArrows size={20} />
            <span>Comparar inventarios o zonas</span>
          </h2>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label>Inventario base</label>
            <select
              value={inventarioBaseId}
              onChange={(e) => setInventarioBaseId(Number(e.target.value))}
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
            <label>Inventario comparado</label>
            <select
              value={inventarioComparadoId}
              onChange={(e) => setInventarioComparadoId(Number(e.target.value))}
            >
              <option value="">Selecciona</option>
              {inventarios.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre} - {item.fecha}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label>Zona base (opcional)</label>
            <select
              value={zonaBaseId}
              onChange={(e) => setZonaBaseId(Number(e.target.value) || '')}
            >
              <option value="">Todas las zonas</option>
              {zonasBaseFiltradas.map((zona) => (
                <option key={zona.id} value={zona.id}>
                  {getZonaLabel(zona)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Zona comparada (opcional)</label>
            <select
              value={zonaComparadaId}
              onChange={(e) => setZonaComparadaId(Number(e.target.value) || '')}
            >
              <option value="">Todas las zonas</option>
              {zonasComparadoFiltradas.map((zona) => (
                <option key={zona.id} value={zona.id}>
                  {getZonaLabel(zona)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? <div className="alert-error">{error}</div> : null}

        <div className="form-actions">
          <button className="btn btn-primary" onClick={handleComparar} disabled={comparing}>
            <GitCompareArrows size={16} />
            <span>{comparing ? 'Comparando...' : 'Comparar'}</span>
          </button>

          <button
            className="btn btn-outline"
            onClick={handleExportar}
            disabled={!data || exporting}
          >
            <Download size={16} />
            <span>{exporting ? 'Exportando...' : 'Exportar Excel'}</span>
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-icon">
            <FileSpreadsheet size={24} />
          </div>
          <div className="kpi-content">
            <p className="kpi-title">Comparados</p>
            <h3 className="kpi-value">{resumen.totalComparados}</h3>
          </div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-icon">
            <GitCompareArrows size={24} />
          </div>
          <div className="kpi-content">
            <p className="kpi-title">Coinciden</p>
            <h3 className="kpi-value">{resumen.totalCoinciden}</h3>
          </div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-icon">
            <GitCompareArrows size={24} />
          </div>
          <div className="kpi-content">
            <p className="kpi-title">Difieren</p>
            <h3 className="kpi-value">{resumen.totalDifieren}</h3>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="form-actions" style={{ marginBottom: '16px' }}>
          <button
            className={`btn ${tab === 'diferencias' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTab('diferencias')}
          >
            Ver diferencias
          </button>

          <button
            className={`btn ${tab === 'coinciden' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTab('coinciden')}
          >
            Ver coincidencias
          </button>
        </div>

        {!data ? (
          <p className="muted">Selecciona dos inventarios y compara.</p>
        ) : rowsActivos.length === 0 ? (
          <p className="muted">
            {tab === 'coinciden' ? 'No hay coincidencias.' : 'No hay diferencias.'}
          </p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Descripción</th>
                  <th>Base</th>
                  <th>Comparado</th>
                  {tab === 'diferencias' ? <th>Diferencia</th> : null}
                </tr>
              </thead>
              <tbody>
                {rowsActivos.map((row) => (
                  <tr key={row.sku}>
                    <td>{row.sku}</td>
                    <td>{row.descripcion}</td>
                    <td>{row.cantidadBase}</td>
                    <td>{row.cantidadComparada}</td>
                    {tab === 'diferencias' ? <td>{row.diferencia}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data ? (
        <>
          <div className="grid-2">
            <div className="card">
              <h3 className="section-title">
                <Users size={18} />
                <span>Totales por grupo - Base</span>
              </h3>

              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Grupo</th>
                      <th>Zona</th>
                      <th>Escaneos</th>
                      <th>Productos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gruposBaseTotales.map((item, index) => (
                      <tr key={`gb-${item.id ?? index}`}>
                        <td>{item.nombre || 'N/A'}</td>
                        <td>{item.zona || 'N/A'}</td>
                        <td>{getEscaneos(item)}</td>
                        <td>{getProductos(item)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h3 className="section-title">
                <Users size={18} />
                <span>Totales por grupo - Comparado</span>
              </h3>

              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Grupo</th>
                      <th>Zona</th>
                      <th>Escaneos</th>
                      <th>Productos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gruposComparadoTotales.map((item, index) => (
                      <tr key={`gc-${item.id ?? index}`}>
                        <td>{item.nombre || 'N/A'}</td>
                        <td>{item.zona || 'N/A'}</td>
                        <td>{getEscaneos(item)}</td>
                        <td>{getProductos(item)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <h3 className="section-title">
                <MapPin size={18} />
                <span>Totales por zona - Base</span>
              </h3>

              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Zona</th>
                      <th>Código</th>
                      <th>Escaneos</th>
                      <th>Productos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zonasBase.map((item, index) => (
                      <tr key={`zb-${item.id ?? index}`}>
                        <td>{item.nombre || 'N/A'}</td>
                        <td>{item.codigo || 'N/A'}</td>
                        <td>{getEscaneos(item)}</td>
                        <td>{getProductos(item)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h3 className="section-title">
                <MapPin size={18} />
                <span>Totales por zona - Comparado</span>
              </h3>

              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Zona</th>
                      <th>Código</th>
                      <th>Escaneos</th>
                      <th>Productos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zonasComparado.map((item, index) => (
                      <tr key={`zc-${item.id ?? index}`}>
                        <td>{item.nombre || 'N/A'}</td>
                        <td>{item.codigo || 'N/A'}</td>
                        <td>{getEscaneos(item)}</td>
                        <td>{getProductos(item)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <h3 className="section-title">
                <User size={18} />
                <span>Totales por miembro - Base</span>
              </h3>

              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Miembro</th>
                      <th>Grupo</th>
                      <th>Zona</th>
                      <th>Escaneos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {miembrosBase.map((item, index) => (
                      <tr key={`mb-${item.id ?? index}`}>
                        <td>{item.nombre || 'N/A'}</td>
                        <td>{item.grupo || 'N/A'}</td>
                        <td>{item.zona || 'N/A'}</td>
                        <td>{getEscaneos(item)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h3 className="section-title">
                <User size={18} />
                <span>Totales por miembro - Comparado</span>
              </h3>

              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Miembro</th>
                      <th>Grupo</th>
                      <th>Zona</th>
                      <th>Escaneos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {miembrosComparado.map((item, index) => (
                      <tr key={`mc-${item.id ?? index}`}>
                        <td>{item.nombre || 'N/A'}</td>
                        <td>{item.grupo || 'N/A'}</td>
                        <td>{item.zona || 'N/A'}</td>
                        <td>{getEscaneos(item)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}