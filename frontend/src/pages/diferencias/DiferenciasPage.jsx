import { useEffect, useMemo, useState } from 'react';
import {
  GitCompareArrows,
  AlertTriangle,
  CheckCircle,
  Download,
  RefreshCw,
  FileSpreadsheet,
  Users,
  MapPin,
  User,
  Repeat,
  Search
} from 'lucide-react';
import { getInventarios } from '../../services/inventarios.service';
import { getGrupos } from '../../services/grupos.service';
import {
  compareInventariosDiferencias,
  exportarDiferenciasExcel
} from '../../services/diferencias.service';
import api from '../../services/api';

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

function getParejaDelInventarioFromList(parejas, inventarioId) {
  const pareja = (parejas || []).find(
    (p) =>
      Number(p.inventarioBaseId) === Number(inventarioId) ||
      Number(p.inventarioComparadoId) === Number(inventarioId)
  );

  if (!pareja) return null;

  const esBase = Number(pareja.inventarioBaseId) === Number(inventarioId);
  const inventarioPareja = esBase ? pareja.inventarioComparado : pareja.inventarioBase;

  return {
    id: pareja.id,
    inventarioId: inventarioPareja?.id,
    nombre: inventarioPareja?.nombre,
    fecha: inventarioPareja?.fecha,
    estado: pareja.estado
  };
}

export default function DiferenciasPage() {
  const [inventarios, setInventarios] = useState([]);
  const [parejas, setParejas] = useState([]);
  const [inventarioBaseId, setInventarioBaseId] = useState('');
  const [inventarioComparadoId, setInventarioComparadoId] = useState('');

  const [gruposBase, setGruposBase] = useState([]);
  const [gruposComparado, setGruposComparado] = useState([]);

  const [zonaBaseId, setZonaBaseId] = useState('');
  const [zonaComparadaId, setZonaComparadaId] = useState('');

  // Permite decidir dónde se crea la ronda de reconteo.
  // Valores permitidos por el backend: "base" o "comparado".
  const [reconteoDestino, setReconteoDestino] = useState('comparado');
  const [alcanceReconteo, setAlcanceReconteo] = useState('pendientes');

  const [data, setData] = useState(null);
  const [tab, setTab] = useState('diferencias');
  const [searchTerm, setSearchTerm] = useState('');

  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [cantidadesEditables, setCantidadesEditables] = useState({});

  const zonasBaseOptions = useMemo(() => buildZoneOptions(gruposBase), [gruposBase]);
  const zonasComparadoOptions = useMemo(() => buildZoneOptions(gruposComparado), [gruposComparado]);

  const inventarioBaseSeleccionado = useMemo(
    () => inventarios.find((item) => Number(item.id) === Number(inventarioBaseId)) || null,
    [inventarios, inventarioBaseId]
  );

  const inventarioComparadoSeleccionado = useMemo(
    () => inventarios.find((item) => Number(item.id) === Number(inventarioComparadoId)) || null,
    [inventarios, inventarioComparadoId]
  );

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

  const getParejaDelInventario = (inventarioId) => {
    return getParejaDelInventarioFromList(parejas, inventarioId);
  };

  const handleInventarioBaseChange = (id) => {
    setInventarioBaseId(id);

    const pareja = getParejaDelInventario(Number(id));

    if (pareja && pareja.inventarioId) {
      setInventarioComparadoId(pareja.inventarioId);
      setMessage(`Pareja automática: ${pareja.nombre}`);
      setTimeout(() => setMessage(''), 3000);
    } else if (id) {
      setInventarioComparadoId('');
      setError('Este inventario no tiene una pareja asignada. Ve a Inventarios para asignarla.');
      setTimeout(() => setError(''), 5000);
    }
  };

  useEffect(() => {
    if (data?.diferencias) {
      const inicial = {};
      data.diferencias.forEach((row) => {
        inicial[row.sku] = row.cantidadComparada;
      });
      setCantidadesEditables(inicial);
    }
  }, [data]);

  const handleCantidadChange = (sku, value) => {
    const nuevaCantidad = parseInt(value, 10) || 0;
    setCantidadesEditables((prev) => ({
      ...prev,
      [sku]: nuevaCantidad
    }));
  };

  const resumen = data?.resumen || {
    totalItemsComparados: 0,
    totalDiferencias: 0,
    totalDiferenciaUnidades: 0
  };

  const totalCoinciden = Math.max(
    Number(resumen.totalItemsComparados || 0) - Number(resumen.totalDiferencias || 0),
    0
  );

  const puedeGenerarReconteo =
    Boolean(data) &&
    Boolean(zonaBaseId) &&
    Boolean(zonaComparadaId) &&
    Boolean(zonaBaseSeleccionada) &&
    Boolean(zonaComparadaSeleccionada) &&
    zonesAreEquivalent(zonaBaseSeleccionada, zonaComparadaSeleccionada) &&
    Number(resumen.totalDiferencias || 0) > 0;

  const rowsActivos = useMemo(() => {
    if (!data) return [];

    let rows = [];

    if (tab === 'coinciden') {
      rows = (data.comparacion || []).filter((row) => Number(row.diferencia || 0) === 0);
    } else if (tab === 'todos') {
      rows = data.comparacion || [];
    } else {
      rows = data.diferencias || [];
    }

    const term = normalizeZoneText(searchTerm);

    if (!term) return rows;

    return rows.filter((row) => {
      const sku = normalizeZoneText(row.sku);
      const descripcion = normalizeZoneText(row.descripcion);
      const fuenteBase = normalizeZoneText(row.fuenteBase);
      const fuenteComparada = normalizeZoneText(row.fuenteComparada);
      const cantidadBase = normalizeZoneText(row.cantidadBase);
      const cantidadComparada = normalizeZoneText(row.cantidadComparada);

      return (
        sku.includes(term) ||
        descripcion.includes(term) ||
        fuenteBase.includes(term) ||
        fuenteComparada.includes(term) ||
        cantidadBase.includes(term) ||
        cantidadComparada.includes(term)
      );
    });
  }, [data, tab, searchTerm]);

  const gruposBaseTotales = data?.totales?.base?.grupos || [];
  const gruposComparadoTotales = data?.totales?.comparado?.grupos || [];
  const zonasBase = data?.totales?.base?.zonas || [];
  const zonasComparado = data?.totales?.comparado?.zonas || [];
  const miembrosBase = data?.totales?.base?.miembros || [];
  const miembrosComparado = data?.totales?.comparado?.miembros || [];

  async function loadInventariosData() {
    try {
      const [rows, parejasResponse] = await Promise.all([
        getInventarios(),
        api.get('/diferencias/parejas')
      ]);

      const inventariosData = rows || [];
      const parejasData = parejasResponse.data.data || [];

      setInventarios(inventariosData);
      setParejas(parejasData);

      if (inventariosData.length >= 2) {
        const primerInventario = inventariosData[0];

        setInventarioBaseId(primerInventario.id);

        const pareja = getParejaDelInventarioFromList(parejasData, primerInventario.id);

        if (pareja && pareja.inventarioId) {
          setInventarioComparadoId(pareja.inventarioId);
        } else {
          setInventarioComparadoId(inventariosData[1].id);
        }
      } else if (inventariosData.length === 1) {
        setInventarioBaseId(inventariosData[0].id);
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
    setData(null);
    setSearchTerm('');
    setMessage('');
  }, [inventarioBaseId]);

  useEffect(() => {
    loadGruposComparado(inventarioComparadoId);
    setZonaComparadaId('');
    setData(null);
    setSearchTerm('');
    setMessage('');
  }, [inventarioComparadoId]);

  async function handleComparar() {
    try {
      setComparing(true);
      setError('');
      setMessage('');

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

      const params = {
        inventarioBaseId,
        inventarioComparadoId,
        zonaBaseId: zonaBaseId || null,
        zonaComparadaId: zonaComparadaId || null,
        cantidadesAceptadas: cantidadesEditables
      };

      if (
        zonaBaseId &&
        zonaComparadaId &&
        zonaBaseSeleccionada &&
        zonaComparadaSeleccionada &&
        zonesAreEquivalent(zonaBaseSeleccionada, zonaComparadaSeleccionada)
      ) {
        params.zonaId = Number(zonaBaseId);
      }

      const response = await compareInventariosDiferencias(params);
      setData(response || null);
      setSearchTerm('');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo comparar los inventarios');
      setData(null);
    } finally {
      setComparing(false);
    }
  }

  async function handleExportar() {
    try {
      setExporting(true);
      setError('');
      setMessage('');

      if (!inventarioBaseId || !inventarioComparadoId) {
        setError('Debes seleccionar ambos inventarios');
        return;
      }

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

      const params = {
        inventarioBaseId,
        inventarioComparadoId,
        zonaBaseId: zonaBaseId || null,
        zonaComparadaId: zonaComparadaId || null,
        cantidadesAceptadas: cantidadesEditables
      };

      if (
        zonaBaseId &&
        zonaComparadaId &&
        zonaBaseSeleccionada &&
        zonaComparadaSeleccionada &&
        zonesAreEquivalent(zonaBaseSeleccionada, zonaComparadaSeleccionada)
      ) {
        params.zonaId = Number(zonaBaseId);
      }

      await exportarDiferenciasExcel(params);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'No se pudo exportar el Excel');
    } finally {
      setExporting(false);
    }
  }

  async function handleGenerarReconteo() {
    try {
      setGenerating(true);
      setError('');
      setMessage('');

      if (!inventarioBaseId || !inventarioComparadoId) {
        setError('Debes seleccionar ambos inventarios');
        return;
      }

      if (!zonaBaseId || !zonaComparadaId) {
        setError('Para generar el reconteo debes seleccionar la zona base y la zona comparada.');
        return;
      }

      if (!zonaBaseSeleccionada || !zonaComparadaSeleccionada) {
        setError('No se pudo resolver la zona seleccionada.');
        return;
      }

      if (!zonesAreEquivalent(zonaBaseSeleccionada, zonaComparadaSeleccionada)) {
        setError('No puedes generar reconteo entre zonas distintas.');
        return;
      }

      if (!data || Number(resumen.totalDiferencias || 0) === 0) {
        setError('No hay diferencias para generar reconteo.');
        return;
      }

      const zonaBaseFinalId = Number(data?.filtros?.zonaBase?.id || zonaBaseId || 0);
      const zonaComparadaFinalId = Number(data?.filtros?.zonaComparada?.id || zonaComparadaId || 0);

      const payload = {
        inventarioBaseId: Number(inventarioBaseId),
        inventarioComparadoId: Number(inventarioComparadoId),
        zonaBaseId: zonaBaseFinalId || null,
        zonaComparadaId: zonaComparadaFinalId || null,
        reconteoDestino,
        alcanceReconteo
      };

      console.log('🚨 Generando reconteo con payload:', payload);

      const rawResponse = await api.post('/diferencias/reconteo', payload);

      const response =
        rawResponse?.data?.data ||
        rawResponse?.data ||
        rawResponse;

      console.log('✅ Respuesta generar reconteo:', response);

      const rondaId = response?.ronda?.id;
      const rondaNumero = response?.ronda?.numeroRonda;

      const inventarioObjetivoId =
        response?.inventarioObjetivoId ||
        response?.ronda?.inventarioId ||
        (reconteoDestino === 'base'
          ? Number(inventarioBaseId)
          : Number(inventarioComparadoId));

      const zonaObjetivoId =
        response?.zonaObjetivoId ||
        response?.ronda?.zonaId ||
        (reconteoDestino === 'base'
          ? Number(zonaBaseFinalId)
          : Number(zonaComparadaFinalId));

      const totalDiferencias = response?.totalDiferencias ?? 0;

      if (!rondaId || !inventarioObjetivoId) {
        setError('El backend respondió, pero no devolvió ID de ronda o inventario objetivo.');
        return;
      }

      setMessage(
        `✅ Ronda creada correctamente · ID ${rondaId} · Ronda ${rondaNumero} · Inventario ${inventarioObjetivoId} · Zona ${zonaObjetivoId} · ${totalDiferencias} SKUs pendientes`
      );
    } catch (err) {
      console.error('❌ Error generando reconteo:', err);

      setError(
        err.response?.data?.message ||
        err.message ||
        'No se pudo generar la ronda de reconteo'
      );
    } finally {
      setGenerating(false);
    }
  }

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
              onChange={(e) => handleInventarioBaseChange(Number(e.target.value))}
            >
              <option value="">Selecciona</option>
              {inventarios.map((item) => {
                const parejaInfo = getParejaDelInventario(item.id);
                return (
                  <option key={item.id} value={item.id}>
                    {item.nombre} - {item.fecha}
                    {parejaInfo ? ` (Pareja: ${parejaInfo.nombre})` : ' (Sin pareja)'}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="form-group">
            <label>Inventario comparado</label>
            <select
              value={inventarioComparadoId}
              onChange={(e) => setInventarioComparadoId(Number(e.target.value))}
            >
              <option value="">Selecciona</option>
              {inventarios
                .filter((item) => Number(item.id) !== Number(inventarioBaseId))
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre} - {item.fecha}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label>Zona base (obligatoria para generar reconteo)</label>
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
            <label>Zona comparada (obligatoria para generar reconteo)</label>
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

        <div className="grid-2">
          <div className="form-group">
            <label>Crear reconteo en</label>
            <select
              value={reconteoDestino}
              onChange={(e) => setReconteoDestino(e.target.value)}
            >
              <option value="comparado">
                Inventario comparado
                {inventarioComparadoSeleccionado?.nombre
                  ? ` · ${inventarioComparadoSeleccionado.nombre}`
                  : ''}
              </option>
              <option value="base">
                Inventario base
                {inventarioBaseSeleccionado?.nombre
                  ? ` · ${inventarioBaseSeleccionado.nombre}`
                  : ''}
              </option>
            </select>
            <small className="muted">
              La ronda de reconteo se creará en el inventario seleccionado aquí.
            </small>
          </div>

              <div className="form-group">
                <label>Modo de reconteo</label>
                <select
                  value={alcanceReconteo}
                  onChange={(e) => setAlcanceReconteo(e.target.value)}
                >
                  <option value="pendientes">Solo productos con diferencia</option>
                  <option value="inventario_base">Recontar inventario base completo</option>
                </select>
                <small className="text-muted">
                  “Inventario base completo” permite escanear todos los productos del inventario base
                  de la zona y hace que el reconteo reemplace lógicamente la ronda anterior.
                </small>
              </div>
        </div>

        {error ? <div className="alert-error">{error}</div> : null}
        {message ? <div className="alert-success">{message}</div> : null}

        <div className="form-actions">
          <button className="btn btn-primary" onClick={handleComparar} disabled={comparing}>
            <RefreshCw size={16} className={comparing ? 'spin' : ''} />
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

          <button
            className="btn btn-primary"
            onClick={handleGenerarReconteo}
            disabled={!puedeGenerarReconteo || generating}
          >
            <Repeat size={16} />
            <span>{generating ? 'Generando...' : 'Generar reconteo'}</span>
          </button>
        </div>

        {!zonaBaseId || !zonaComparadaId ? (
          <div className="alert-warning" style={{ marginTop: '12px' }}>
            <AlertTriangle size={16} />
            <span>Para generar reconteo debes comparar una zona específica contra su misma zona.</span>
          </div>
        ) : null}

        {zonaBaseSeleccionada &&
          zonaComparadaSeleccionada &&
          !zonesAreEquivalent(zonaBaseSeleccionada, zonaComparadaSeleccionada) ? (
          <div className="alert-warning" style={{ marginTop: '12px' }}>
            <AlertTriangle size={16} />
            <span>No puedes comparar ni generar reconteo entre zonas distintas.</span>
          </div>
        ) : null}
      </div>

      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-icon">
            <FileSpreadsheet size={24} />
          </div>
          <div className="kpi-content">
            <p className="kpi-title">Comparados</p>
            <h3 className="kpi-value">{resumen.totalItemsComparados}</h3>
          </div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-icon">
            <CheckCircle size={24} />
          </div>
          <div className="kpi-content">
            <p className="kpi-title">Coinciden</p>
            <h3 className="kpi-value">{totalCoinciden}</h3>
          </div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-icon">
            <AlertTriangle size={24} />
          </div>
          <div className="kpi-content">
            <p className="kpi-title">Difieren</p>
            <h3 className="kpi-value">{resumen.totalDiferencias}</h3>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="form-actions" style={{ marginBottom: '16px' }}>
          <button
            className={`btn ${tab === 'diferencias' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTab('diferencias')}
          >
            <AlertTriangle size={16} />
            <span>Ver diferencias ({resumen.totalDiferencias})</span>
          </button>

          <button
            className={`btn ${tab === 'coinciden' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTab('coinciden')}
          >
            <CheckCircle size={16} />
            <span>Ver coincidencias ({totalCoinciden})</span>
          </button>

          <button
            className={`btn ${tab === 'todos' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTab('todos')}
          >
            <FileSpreadsheet size={16} />
            <span>Ver todos ({resumen.totalItemsComparados})</span>
          </button>
        </div>

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label>Buscar SKU, descripción o fuente</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Search size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Ej: 11342, teclado, reconteo..."
            />
          </div>
          {searchTerm ? (
            <small className="muted">
              Mostrando {rowsActivos.length} resultado(s) para "{searchTerm}".
            </small>
          ) : null}
        </div>

        {!data ? (
          <p className="muted">Selecciona dos inventarios y compara.</p>
        ) : rowsActivos.length === 0 ? (
          <p className="muted">No hay registros para mostrar con los filtros actuales.</p>
        ) : (
          <div className="table-container">
            <table className="data-table diferencias-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Descripción</th>
                  <th>Base</th>
                  <th>Comparado</th>
                  {(tab === 'diferencias' || tab === 'todos') ? <th>Diferencia</th> : null}
                  <th>Fuente base</th>
                  <th>Fuente comparada</th>
                  <th className="cantidad-aceptada-col">Cantidad aceptada</th>
                </tr>
              </thead>
              <tbody>
                {rowsActivos.map((row, index) => {
                  const diferencia = Number(row.diferencia || 0);

                  return (
                    <tr
                      key={`${row.sku}-${index}`}
                      className={diferencia === 0 ? 'row-success' : 'row-warning'}
                    >
                      <td>{row.sku}</td>
                      <td>{row.descripcion || 'Sin descripción'}</td>
                      <td className="text-center cantidad-base">{row.cantidadBase}</td>
                      <td className="text-center cantidad-comparada">{row.cantidadComparada}</td>
                      {(tab === 'diferencias' || tab === 'todos') && (
                        <td
                          className={`text-center diferencia ${
                            diferencia > 0
                              ? 'text-danger'
                              : diferencia < 0
                                ? 'text-success'
                                : ''
                          }`}
                        >
                          {diferencia > 0 ? `+${diferencia}` : `${diferencia}`}
                        </td>
                      )}
                      <td className="text-center">
                        {row.fuenteBase || 'completa'}
                      </td>
                      <td className="text-center">
                        {row.fuenteComparada || 'completa'}
                      </td>
                      <td className="text-center cantidad-aceptada-cell">
                        <input
                          type="number"
                          min="0"
                          value={cantidadesEditables[row.sku] ?? row.cantidadComparada}
                          onChange={(e) => handleCantidadChange(row.sku, e.target.value)}
                          className="cantidad-aceptada-input"
                        />
                      </td>
                    </tr>
                  );
                })}
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
                    {gruposBaseTotales.map((item, idx) => (
                      <tr key={`gb-${item.id ?? item.nombre ?? 'grupo'}-${idx}`}>
                        <td>{item.nombre || 'N/A'}</td>
                        <td>{item.zona || 'N/A'}</td>
                        <td className="text-center">{item.totalEscaneos || 0}</td>
                        <td className="text-center">{item.productosUnicos || 0}</td>
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
                    {gruposComparadoTotales.map((item, idx) => (
                      <tr key={`gc-${item.id ?? item.nombre ?? 'grupo'}-${idx}`}>
                        <td>{item.nombre || 'N/A'}</td>
                        <td>{item.zona || 'N/A'}</td>
                        <td className="text-center">{item.totalEscaneos || 0}</td>
                        <td className="text-center">{item.productosUnicos || 0}</td>
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
                    {zonasBase.map((item, idx) => (
                      <tr key={`zb-${item.id ?? item.nombre ?? 'zona'}-${idx}`}>
                        <td>{item.nombre || 'N/A'}</td>
                        <td>{item.codigo || 'N/A'}</td>
                        <td className="text-center">{item.totalEscaneos || 0}</td>
                        <td className="text-center">{item.productosUnicos || 0}</td>
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
                    {zonasComparado.map((item, idx) => (
                      <tr key={`zc-${item.id ?? item.nombre ?? 'zona'}-${idx}`}>
                        <td>{item.nombre || 'N/A'}</td>
                        <td>{item.codigo || 'N/A'}</td>
                        <td className="text-center">{item.totalEscaneos || 0}</td>
                        <td className="text-center">{item.productosUnicos || 0}</td>
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
                    {miembrosBase.map((item, idx) => (
                      <tr key={`mb-${item.id ?? item.nombre ?? 'miembro'}-${idx}`}>
                        <td>{item.nombre || 'N/A'}</td>
                        <td>{item.grupo || 'N/A'}</td>
                        <td>{item.zona || 'N/A'}</td>
                        <td className="text-center">{item.totalEscaneos || 0}</td>
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
                    {miembrosComparado.map((item, idx) => (
                      <tr key={`mc-${item.id ?? item.nombre ?? 'miembro'}-${idx}`}>
                        <td>{item.nombre || 'N/A'}</td>
                        <td>{item.grupo || 'N/A'}</td>
                        <td>{item.zona || 'N/A'}</td>
                        <td className="text-center">{item.totalEscaneos || 0}</td>
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