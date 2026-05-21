import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  ScanLine,
  Play,
  Pause,
  RefreshCw,
  Trash2,
  Download,
  History,
  CheckCircle,
  AlertTriangle,
  Zap,
  Clock,
  Boxes,
  Layers3,
  X,
  Maximize2,
  Minimize2
} from 'lucide-react';
import {
  scanLecturaRonda,
  anularLectura,
  getResumenLecturas,
  getHistorialLecturas,
  getEstadisticasGrupo,
  exportarResultadosGrupo
} from '../../services/lecturas.service';
import {
  getMisRondasParaEscaneo,
  pausarRonda,
  reanudarRonda,
  iniciarRonda,
  getPendientesRonda
} from '../../services/rondas.service';
import { getInventarios } from '../../services/inventarios.service';

export default function EscaneoPage() {
  const [searchParams] = useSearchParams();

  const inventarioIdFromUrl = Number(searchParams.get('inventarioId') || 0);
  const rondaIdFromUrl = Number(searchParams.get('rondaId') || 0);

  const lastSentRef = useRef({ code: '', at: 0 });
  const inputRef = useRef(null);
  const audioRef = useRef(null);
  const processingRef = useRef(false);

  const [inventarios, setInventarios] = useState([]);
  const [selectedInventario, setSelectedInventario] = useState('');
  const [rondas, setRondas] = useState([]);
  const [selectedRondaId, setSelectedRondaId] = useState('');

  const [pendientes, setPendientes] = useState([]);
  const [resumen, setResumen] = useState([]);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);

  const [codigo, setCodigo] = useState('');
  const [lastScan, setLastScan] = useState(null);

  const [bootLoading, setBootLoading] = useState(true);
  const [loadingScan, setLoadingScan] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);

  const [showZoneWarning, setShowZoneWarning] = useState(false);
  const [zoneWarningInfo, setZoneWarningInfo] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const auth = useAuth();
  const rol = String(auth?.user?.rol || auth?.user?.rol?.nombre || '').toLowerCase();
  const isContador = rol === 'contador';
  const [flash, setFlash] = useState({ type: '', text: '' });

  const setFlashMessage = useCallback((text, type = 'success') => {
    setFlash({ text, type });
  }, []);

  useEffect(() => {
    if (!flash.text) return;
    const timeout = setTimeout(() => {
      setFlash({ type: '', text: '' });
    }, 3000);
    return () => clearTimeout(timeout);
  }, [flash]);

  const playBeep = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => { });
  };

  const selectedRonda = useMemo(() => {
    return rondas.find((item) => Number(item.id) === Number(selectedRondaId)) || null;
  }, [rondas, selectedRondaId]);

  const grupoAsignado = selectedRonda?.asignacion?.grupo || null;
  const zonaRonda = selectedRonda?.zona || null;
  const isReconteo = selectedRonda?.tipoRonda === 'reconteo';
  const canScan = selectedRonda?.estado === 'activa' && Boolean(grupoAsignado?.id);

  const totalEscaneos = Number(stats?.totalEscaneos || 0);
  const productosUnicos = Number(stats?.productosUnicos || resumen.length || 0);

  const formatDateTime = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  };

  const formatOnlyTime = (value) => {
    if (!value) return '—';
    return new Date(value).toLocaleTimeString();
  };

  const unwrapData = (value) => {
    if (value?.data?.data !== undefined) return value.data.data;
    if (value?.data !== undefined) return value.data;
    return value;
  };

  const extractArray = (value, keys = []) => {
    const unwrapped = unwrapData(value);
    if (Array.isArray(unwrapped)) return unwrapped;
    for (const key of keys) {
      if (Array.isArray(unwrapped?.[key])) return unwrapped[key];
    }
    return [];
  };

  const extractObject = (value) => {
    const unwrapped = unwrapData(value);
    return unwrapped && typeof unwrapped === 'object' ? unwrapped : null;
  };

  const onlyValidLecturas = (rows) => {
    return (rows || []).filter((item) => item?.estado !== 'anulada');
  };

  async function loadInventariosData() {
    try {
      const data = await getInventarios();
      setInventarios(data || []);
      if (inventarioIdFromUrl) {
        setSelectedInventario(inventarioIdFromUrl);
      } else if (data?.length > 0) {
        setSelectedInventario((prev) => prev || data[0].id);
      }
    } catch (err) {
      setFlashMessage('No se pudieron cargar los inventarios', 'error');
    } finally {
      setBootLoading(false);
    }
  }

  const loadRondasData = useCallback(async (inventarioId, currentSelectedId = null) => {
    try {
      if (!inventarioId) {
        setRondas([]);
        setSelectedRondaId('');
        return;
      }

      const raw = await getMisRondasParaEscaneo(inventarioId);
      const data = extractArray(raw);
      setRondas(data);

      const preferred = data.find((item) => Number(item.id) === Number(rondaIdFromUrl)) ||
        data.find((item) => Number(item.id) === Number(currentSelectedId)) ||
        data.find((item) => item.tipoRonda === 'reconteo' && item.estado === 'activa') ||
        data.find((item) => item.tipoRonda === 'reconteo' && item.estado === 'pausada') ||
        data.find((item) => item.tipoRonda === 'reconteo' && item.estado === 'borrador') ||
        data.find((item) => item.estado === 'activa') ||
        data.find((item) => item.estado === 'pausada') ||
        data.find((item) => item.estado === 'borrador') ||
        data[0] || null;

      setSelectedRondaId(preferred?.id || '');
    } catch (err) {
      setFlashMessage(err.response?.data?.message || 'No se pudieron cargar tus rondas', 'error');
      setRondas([]);
      setSelectedRondaId('');
    }
  }, [setFlashMessage, rondaIdFromUrl]);

  const loadRoundContext = useCallback(async (ronda) => {
    if (!ronda?.id) {
      setPendientes([]);
      setResumen([]);
      setHistory([]);
      setStats(null);
      return;
    }

    setSyncing(true);

    try {
      const requests = [
        getResumenLecturas({ rondaId: ronda.id }),
        getHistorialLecturas({ rondaId: ronda.id, limit: 50 }),
        ronda.tipoRonda === 'reconteo' ? getPendientesRonda(ronda.id) : Promise.resolve({ pendientes: [] }),
        ronda.asignacion?.grupoId || ronda.asignacion?.grupo?.id
          ? getEstadisticasGrupo({ rondaId: ronda.id, grupoId: ronda.asignacion?.grupoId || ronda.asignacion?.grupo?.id })
          : Promise.resolve(null)
      ];

      const [resumenRes, historyRes, pendientesRes, statsRes] = await Promise.allSettled(requests);

      const resumenRows = resumenRes.status === 'fulfilled' ? extractArray(resumenRes.value, ['resumen', 'items']) : [];
      const historyRows = historyRes.status === 'fulfilled' ? onlyValidLecturas(extractArray(historyRes.value, ['historial', 'lecturas', 'history'])) : [];
      let pendientesRows = [];

      if (pendientesRes.status === 'fulfilled') {
        const rawPendientesValue = pendientesRes.value;
        pendientesRows = rawPendientesValue?.pendientes ||
          rawPendientesValue?.data?.pendientes ||
          rawPendientesValue?.data?.data?.pendientes ||
          extractArray(rawPendientesValue, ['pendientes']) ||
          [];
        pendientesRows = Array.isArray(pendientesRows) ? pendientesRows : [];
      }

      setResumen(resumenRows);
      setHistory(historyRows);
      setPendientes(pendientesRows);
      setStats(statsRes.status === 'fulfilled' ? extractObject(statsRes.value) : null);
    } catch (err) {
      console.error('Error en loadRoundContext:', err);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    loadInventariosData();
  }, []);

  useEffect(() => {
    if (inventarioIdFromUrl) setSelectedInventario(inventarioIdFromUrl);
  }, [inventarioIdFromUrl]);

  useEffect(() => {
    if (selectedInventario) loadRondasData(selectedInventario, rondaIdFromUrl || null);
  }, [selectedInventario, rondaIdFromUrl, loadRondasData]);

  useEffect(() => {
    if (selectedRonda) loadRoundContext(selectedRonda);
    else {
      setPendientes([]);
      setResumen([]);
      setHistory([]);
      setStats(null);
    }
  }, [selectedRonda, loadRoundContext]);

  useEffect(() => {
    if (!bootLoading && canScan) {
      inputRef.current?.focus();
    }
  }, [bootLoading, canScan, loadingScan]);

  // Cerrar menú móvil al cambiar de ronda
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [selectedRondaId]);

  const handleRefresh = async () => {
    if (!selectedInventario) return;
    await loadRondasData(selectedInventario, selectedRondaId || rondaIdFromUrl || null);
  };

  const handleRondaAction = async (action) => {
    if (!selectedRonda?.id) return;
    try {
      if (action === 'iniciar') {
        await iniciarRonda(selectedRonda.id);
        setFlashMessage('Ronda iniciada', 'success');
      } else if (action === 'pausar') {
        await pausarRonda(selectedRonda.id);
        setFlashMessage('Ronda pausada', 'warning');
      } else if (action === 'reanudar') {
        await reanudarRonda(selectedRonda.id);
        setFlashMessage('Ronda reanudada', 'success');
      }
      await loadRondasData(selectedInventario, selectedRonda.id);
      inputRef.current?.focus();
    } catch (err) {
      setFlashMessage(err.response?.data?.message || 'Error', 'error');
    }
  };

  const procesarEscaneo = useCallback(async (codigoLimpio) => {
    if (processingRef.current) return;
    if (!/^\d{5,6}$/.test(codigoLimpio)) return;

    const now = Date.now();
    if (lastSentRef.current.code === codigoLimpio && now - lastSentRef.current.at < 100) {
      return;
    }

    lastSentRef.current = { code: codigoLimpio, at: now };
    processingRef.current = true;

    if (!selectedRonda?.id || selectedRonda.estado !== 'activa' || !grupoAsignado?.id) {
      processingRef.current = false;
      return;
    }

    try {
      const raw = await scanLecturaRonda({
        rondaId: selectedRonda.id,
        grupoId: grupoAsignado.id,
        codigo: codigoLimpio
      });

      const backend = raw?.ok !== undefined ? raw : raw?.data?.ok !== undefined ? raw.data : null;
      const payload = backend?.data || raw?.data || raw || null;
      const message = backend?.message || raw?.message || 'Lectura registrada';
      const warning = Boolean(backend?.warning || raw?.warning);
      const warningData = payload?.warning || null;

      playBeep();
      setLastScan(payload);

      if (warningData?.type === 'producto_en_otra_zona') {
        setShowZoneWarning(true);
        setZoneWarningInfo(warningData);
        setFlashMessage(warningData.message, 'warning');
      } else {
        setFlashMessage(message, warning ? 'warning' : 'success');
      }

      loadRoundContext(selectedRonda);
    } catch (err) {
      setFlashMessage(err.response?.data?.message || 'Error', 'error');
    } finally {
      processingRef.current = false;
    }
  }, [selectedRonda, grupoAsignado, loadRoundContext]);

  const handleCodigoChange = useCallback((e) => {
    const value = e.target.value;
    const numeros = value.replace(/[^0-9]/g, '').slice(0, 6);
    
    setCodigo(numeros);
    
    if (numeros.length === 5 || numeros.length === 6) {
      procesarEscaneo(numeros);
      setCodigo('');
    }
  }, [procesarEscaneo]);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (codigo.length === 5 || codigo.length === 6) {
      procesarEscaneo(codigo);
      setCodigo('');
    }
  }, [codigo, procesarEscaneo]);

  const handleAnularLectura = async (lecturaId) => {
    if (!window.confirm('¿Anular esta lectura?')) return;
    try {
      await anularLectura(lecturaId);
      setHistory((prev) => prev.filter((l) => Number(l.id) !== Number(lecturaId)));
      setFlashMessage('Lectura anulada', 'success');
      loadRoundContext(selectedRonda);
    } catch (err) {
      setFlashMessage(err.response?.data?.message || 'Error', 'error');
    }
  };

  const handleExportGrupo = async () => {
    if (!selectedRonda?.id || !grupoAsignado?.id) return;
    setExporting(true);
    try {
      const payload = await exportarResultadosGrupo({
        rondaId: selectedRonda.id,
        grupoId: grupoAsignado.id,
        inventarioId: selectedRonda.inventarioId
      });
      const data = payload?.data;
      const resultados = data?.resultados || [];
      const rows = [
        ['Grupo', data?.grupo?.nombre || ''],
        ['Ronda', data?.ronda?.numeroRonda || ''],
        ['Tipo', data?.ronda?.tipoRonda || ''],
        ['Zona', data?.ronda?.zona || ''],
        [],
        ['SKU', 'Descripción', 'Cantidad Total'],
        ...resultados.map((item) => [
          item.sku || '',
          (item.descripcion || '').replace(/\n/g, ' '),
          item.cantidadTotal || 0
        ])
      ];
      const csv = rows.map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `grupo-${data?.grupo?.nombre || 'resultado'}-ronda-${data?.ronda?.numeroRonda || 'x'}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setFlashMessage('Exportación generada', 'success');
    } catch (err) {
      setFlashMessage(err.response?.data?.message || 'Error', 'error');
    } finally {
      setExporting(false);
    }
  };

  if (bootLoading) {
    return (
      <div className="card loading-card">
        <div className="loading-spinner" />
        <p>Cargando módulo de escaneo...</p>
      </div>
    );
  }

  return (
    <div className={`dashboard-container escaneo-page ${fullScreen ? 'fullscreen-mode' : ''}`}>
      <audio ref={audioRef} src="/beep.mp3" preload="auto" />

      {/* Header móvil con menú hamburguesa */}
      <div className="escaneo-mobile-header">
        <button 
          className="mobile-menu-btn-escaneo"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X size={24} /> : <ScanLine size={24} />}
        </button>
        <h2 className="mobile-title">Escaneo</h2>
        <button 
          className="fullscreen-btn"
          onClick={() => setFullScreen(!fullScreen)}
        >
          {fullScreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
        </button>
      </div>

      {/* Panel móvil desplegable */}
      <div className={`escaneo-mobile-panel ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="form-group">
          <label>Inventario</label>
          <select value={selectedInventario} onChange={(e) => setSelectedInventario(Number(e.target.value))}>
            {inventarios.map((inv) => (
              <option key={inv.id} value={inv.id}>{inv.nombre}</option>
            ))}
          </select>
        </div>

        {!isContador && (
          <div className="form-group">
            <label>Ronda de trabajo</label>
            <select value={selectedRondaId || ''} onChange={(e) => setSelectedRondaId(e.target.value ? Number(e.target.value) : '')} disabled={rondas.length === 0}>
              <option value="">Selecciona una ronda</option>
              {rondas.map((ronda) => (
                <option key={ronda.id} value={ronda.id}>
                  Ronda {ronda.numeroRonda} - {ronda.estado}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="last-update-mobile">
          <Clock size={14} />
          <span>{syncing ? 'Sincronizando...' : 'Listo'}</span>
        </div>

        <button className="btn btn-outline" onClick={handleRefresh}>
          <RefreshCw size={16} className={syncing ? 'spin' : ''} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Toolbar desktop */}
      <div className="card filters-card escaneo-toolbar desktop-only">
        <div className="filters-header">
          <div className="filters-form">
            <div className="form-group">
              <label>Inventario</label>
              <select value={selectedInventario} onChange={(e) => setSelectedInventario(Number(e.target.value))}>
                {inventarios.map((inv) => (
                  <option key={inv.id} value={inv.id}>{inv.nombre} - {inv.fecha}</option>
                ))}
              </select>
            </div>

            {!isContador && (
              <div className="form-group">
                <label>Ronda de trabajo</label>
                <select value={selectedRondaId || ''} onChange={(e) => setSelectedRondaId(e.target.value ? Number(e.target.value) : '')} disabled={rondas.length === 0}>
                  <option value="">Selecciona una ronda</option>
                  {rondas.map((ronda) => (
                    <option key={ronda.id} value={ronda.id}>
                      Ronda {ronda.numeroRonda} · {ronda.tipoRonda} · {ronda.estado}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isContador && (
              <div className="form-group">
                <label>Ronda asignada</label>
                <input value={selectedRonda ? `Ronda ${selectedRonda.numeroRonda} · ${selectedRonda.tipoRonda} · ${selectedRonda.estado}` : 'No tienes ronda activa'} disabled />
              </div>
            )}
          </div>

          <div className="filters-actions">
            <div className="last-update">
              <Clock size={14} />
              <span>{syncing ? 'Sincronizando...' : 'Listo'}</span>
            </div>
            <button className="btn btn-outline" onClick={handleRefresh}>
              <RefreshCw size={16} className={syncing ? 'spin' : ''} />
              <span>Actualizar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Información de la ronda - siempre visible */}
      {selectedRonda && (
        <div className="escaneo-meta-grid">
          <div className="escaneo-meta-item">
            <span className="meta-label">Grupo</span>
            <strong>{grupoAsignado?.nombre || 'Sin grupo'}</strong>
          </div>
          <div className="escaneo-meta-item">
            <span className="meta-label">Zona</span>
            <strong>{zonaRonda?.nombre || 'Sin zona'}{zonaRonda?.codigo ? ` (${zonaRonda.codigo})` : ''}</strong>
          </div>
          <div className="escaneo-meta-item">
            <span className="meta-label">Tipo</span>
            <strong>{selectedRonda.tipoRonda === 'reconteo' ? 'Reconteo' : 'Completa'}</strong>
          </div>
          <div className="escaneo-meta-item">
            <span className="meta-label">Estado</span>
            <span className={`status-chip ${selectedRonda.estado}`}>{selectedRonda.estado}</span>
          </div>
        </div>
      )}

      {flash.text && (
        <div className={`alert-${flash.type === 'error' ? 'error' : flash.type === 'warning' ? 'warning' : 'success'}`}>
          {flash.text}
        </div>
      )}

      {selectedRonda ? (
        <>
          {/* KPIs - responsive */}
          <div className="kpi-grid">
            <div className="card kpi-card">
              <div className="kpi-icon"><Boxes size={24} /></div>
              <div className="kpi-content">
                <p className="kpi-title">Total escaneos</p>
                <h3 className="kpi-value">{totalEscaneos}</h3>
              </div>
            </div>
            <div className="card kpi-card">
              <div className="kpi-icon"><Layers3 size={24} /></div>
              <div className="kpi-content">
                <p className="kpi-title">Productos distintos</p>
                <h3 className="kpi-value">{productosUnicos}</h3>
              </div>
            </div>
            <div className="card kpi-card">
              <div className="kpi-icon"><AlertTriangle size={24} /></div>
              <div className="kpi-content">
                <p className="kpi-title">Pendientes</p>
                <h3 className="kpi-value">{isReconteo ? pendientes.length : 0}</h3>
              </div>
            </div>
          </div>

          {/* Scanner y estado - responsive */}
          <div className="scan-layout">
            <div className="card scanner-shell">
              <div className="list-header">
                <h2 className="section-title"><ScanLine size={20} /><span>Escanear producto</span></h2>
                <div className="scanner-actions">
                  {selectedRonda.estado === 'borrador' && (
                    <button className="btn btn-primary" onClick={() => handleRondaAction('iniciar')}>
                      <Play size={16} /><span>Iniciar</span>
                    </button>
                  )}
                  {selectedRonda.estado === 'activa' && (
                    <button className="btn btn-outline" onClick={() => handleRondaAction('pausar')}>
                      <Pause size={16} /><span>Pausar</span>
                    </button>
                  )}
                  {selectedRonda.estado === 'pausada' && (
                    <button className="btn btn-primary" onClick={() => handleRondaAction('reanudar')}>
                      <Play size={16} /><span>Reanudar</span>
                    </button>
                  )}
                  <button className="btn btn-outline" onClick={handleExportGrupo} disabled={!grupoAsignado?.id || exporting}>
                    <Download size={16} /><span>{exporting ? 'Exportando...' : 'Exportar'}</span>
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="scanner-input-row">
                  <input 
                    ref={inputRef} 
                    type="text" 
                    value={codigo} 
                    onChange={handleCodigoChange}
                    placeholder="Escanea el código"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    disabled={!canScan}
                  />
                  <button className="btn btn-primary" type="submit" disabled={!canScan}>
                    {loadingScan ? '...' : 'Escanear'}
                  </button>
                </div>
              </form>

              <p className="scan-helper">
                Códigos válidos: 5 o 6 dígitos numéricos
              </p>

              {lastScan && (
                <div className="last-scan-card">
                  <div className="last-scan-header"><CheckCircle size={18} className="text-success" /><span>Último escaneo</span></div>
                  <div className="last-scan-grid">
                    <div><span className="meta-label">SKU</span><strong>{lastScan.producto?.sku || 'No reconocido'}</strong></div>
                    <div><span className="meta-label">Descripción</span><strong>{lastScan.producto?.descripcion || 'Sin descripción'}</strong></div>
                    <div><span className="meta-label">Acumulado</span><strong>{lastScan.acumuladoSku || 0}</strong></div>
                  </div>
                </div>
              )}
            </div>

            <div className="card round-summary-card">
              <h2 className="section-title"><Zap size={20} /><span>Estado de la ronda</span></h2>
              <div className="round-summary-grid">
                <div className="summary-box"><span>Inicio</span><strong>{formatDateTime(selectedRonda.tiempoInicio)}</strong></div>
                <div className="summary-box"><span>Fin</span><strong>{formatDateTime(selectedRonda.tiempoFin)}</strong></div>
                <div className="summary-box"><span>Primera lectura</span><strong>{formatDateTime(stats?.primeraLectura)}</strong></div>
                <div className="summary-box"><span>Última lectura</span><strong>{formatDateTime(stats?.ultimaLectura)}</strong></div>
                <div className="summary-box full"><span>Tiempo activo</span><strong>{stats?.tiempoFormateado || '—'}</strong></div>
              </div>

              {isReconteo && (
                <div className="pending-panel">
                  <div className="pending-header"><AlertTriangle size={16} /><span>SKU pendientes ({pendientes.length})</span></div>
                  {pendientes.length === 0 ? (
                    <div className="escaneo-empty">No hay pendientes</div>
                  ) : (
                    <div className="pending-list">
                      {pendientes.slice(0, 10).map((item) => (
                        <div key={`${item.sku}-${item.id}`} className="pending-item">
                          <div><strong>{item.sku}</strong><p className="pending-sku-desc">{item.descripcionSnapshot || 'Sin descripción'}</p></div>
                        </div>
                      ))}
                      {pendientes.length > 10 && (
                        <div className="pending-more">+{pendientes.length - 10} más</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Resumen e historial - responsive */}
          <div className="grid-2">
            <div className="card resumen-card">
              <div className="list-header"><h2 className="section-title"><Boxes size={20} /><span>Resumen por producto</span></h2></div>
              {resumen.length === 0 ? <div className="escaneo-empty">No hay escaneos</div> : (
                <div className="table-responsive-container">
                  <table className="data-table resumen-table">
                    <thead>
                      <tr><th>SKU</th><th>Descripción</th><th>Cantidad</th></tr>
                    </thead>
                    <tbody>
                      {resumen.slice(0, 15).map((item, index) => (
                        <tr key={`${item.sku || 'sku'}-${index}`}>
                          <td data-label="SKU"><strong>{item.sku}</strong></td>
                          <td data-label="Descripción">{item.descripcionSnapshot || 'Sin descripción'}</td>
                          <td data-label="Cantidad" className="text-center">{item.cantidadTotal}</td>
                        <tr>
                      ))}
                      {resumen.length > 15 && (
                        <tr className="more-items">
                          <td colSpan="3" className="text-center">+{resumen.length - 15} productos más</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card historial-card">
              <div className="list-header"><h2 className="section-title"><History size={20} /><span>Historial reciente</span></h2></div>
              {history.length === 0 ? <div className="escaneo-empty">No hay lecturas</div> : (
                <div className="history-list">
                  {history.slice(0, 15).map((lectura) => (
                    <div key={lectura.id} className={`history-item ${lectura.estado === 'anulada' ? 'anulada' : ''}`}>
                      <div className="history-main">
                        <strong>{lectura.codigoLeido}</strong>
                        <p>{lectura.sku || 'No reconocido'}</p>
                      </div>
                      <div className="history-meta">
                        <span className="tag-muted">{formatOnlyTime(lectura.fechaHora)}</span>
                        <span className={`status-chip mini ${lectura.estado}`}>{lectura.estado === 'valida' ? 'OK' : '❌'}</span>
                        {lectura.estado !== 'anulada' && (
                          <button className="icon-btn" onClick={() => handleAnularLectura(lectura.id)} title="Anular"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="card"><p className="muted">Selecciona un inventario con rondas disponibles</p></div>
      )}

      {/* Modal de advertencia */}
      {showZoneWarning && zoneWarningInfo && (
        <div className="modal-overlay" onClick={() => setShowZoneWarning(false)}>
          <div className="modal modal-warning" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><AlertTriangle size={20} color="#f59e0b" /><span>Producto en otra zona</span></h3>
              <button className="icon-btn" onClick={() => setShowZoneWarning(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p className="warning-text">
                El producto <strong>{zoneWarningInfo.sku}</strong> ya fue escaneado en <strong>{zoneWarningInfo.zona?.nombre}</strong> con <strong>{zoneWarningInfo.cantidadEnOtraZona} unidades</strong>.
              </p>
              <div className="alert-destino">
                <p className="destino-title">Llevar a:</p>
                <p className="destino-zona"><strong>{zoneWarningInfo.zona?.nombre}</strong></p>
                <p className="destino-grupo">Grupo: <strong>{zoneWarningInfo.grupo?.nombre}</strong></p>
              </div>
              <p className="warning-text">Escaneo bloqueado. Lleva el producto a la zona indicada.</p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setShowZoneWarning(false)}>Entendido</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}