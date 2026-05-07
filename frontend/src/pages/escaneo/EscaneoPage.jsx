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
  Edit3,
  X,
  Plus
} from 'lucide-react';
import {
  scanLecturaRonda,
  anularLectura,
  getResumenLecturas,
  getHistorialLecturas,
  getEstadisticasGrupo,
  exportarResultadosGrupo,
  agregarLecturaManual
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

  // Estado para el modal de entrada manual
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualSku, setManualSku] = useState('');
  const [manualCantidad, setManualCantidad] = useState(1);
  const [manualRepeticiones, setManualRepeticiones] = useState(1); // ← Cambiado de manualVeces
  const [loadingManual, setLoadingManual] = useState(false);

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

  const onlyPendingDiscrepancias = (rows) => {
    return (rows || []).filter((item) => {
      const estado = String(item?.estado || '').toLowerCase();
      const diferencia = Number(item?.diferencia ?? item?.diferenciaOriginal ?? 0);

      return (
        diferencia !== 0 &&
        estado !== 'resuelta' &&
        estado !== 'cerrada' &&
        estado !== 'anulada'
      );
    });
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

      const preferred =
        data.find((item) => Number(item.id) === Number(rondaIdFromUrl)) ||
        data.find((item) => Number(item.id) === Number(currentSelectedId)) ||
        data.find((item) => item.tipoRonda === 'reconteo' && item.estado === 'activa') ||
        data.find((item) => item.tipoRonda === 'reconteo' && item.estado === 'pausada') ||
        data.find((item) => item.tipoRonda === 'reconteo' && item.estado === 'borrador') ||
        data.find((item) => item.estado === 'activa') ||
        data.find((item) => item.estado === 'pausada') ||
        data.find((item) => item.estado === 'borrador') ||
        data[0] ||
        null;

      setSelectedRondaId(preferred?.id || '');
    } catch (err) {
      setFlashMessage(
        err.response?.data?.message || 'No se pudieron cargar tus rondas',
        'error'
      );
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
        ronda.tipoRonda === 'reconteo'
          ? getPendientesRonda(ronda.id)
          : Promise.resolve({ pendientes: [] }),
        ronda.asignacion?.grupoId || ronda.asignacion?.grupo?.id
          ? getEstadisticasGrupo({
            rondaId: ronda.id,
            grupoId: ronda.asignacion?.grupoId || ronda.asignacion?.grupo?.id
          })
          : Promise.resolve(null)
      ];

      const [resumenRes, historyRes, pendientesRes, statsRes] =
        await Promise.allSettled(requests);

      const resumenRows =
        resumenRes.status === 'fulfilled'
          ? extractArray(resumenRes.value, ['resumen', 'items'])
          : [];

      const historyRows =
        historyRes.status === 'fulfilled'
          ? onlyValidLecturas(extractArray(historyRes.value, ['historial', 'lecturas', 'history']))
          : [];

      const pendientesRows =
        pendientesRes.status === 'fulfilled'
          ? onlyPendingDiscrepancias(extractArray(pendientesRes.value, ['pendientes']))
          : [];

      setResumen(resumenRows);
      setHistory(historyRows);
      setPendientes(pendientesRows);
      setStats(statsRes.status === 'fulfilled' ? extractObject(statsRes.value) : null);

      if (pendientesRes.status === 'rejected' && ronda.tipoRonda === 'reconteo') {
        setFlashMessage(
          pendientesRes.reason?.response?.data?.message ||
          'No se pudieron cargar los pendientes del reconteo',
          'warning'
        );
      }

      if (resumenRes.status === 'rejected' || historyRes.status === 'rejected') {
        setFlashMessage(
          'Se cargó la ronda, pero algunas secciones no pudieron sincronizarse',
          'warning'
        );
      }
    } catch (err) {
      setFlashMessage('No se pudo sincronizar la información de la ronda', 'error');
    } finally {
      setSyncing(false);
    }
  }, [setFlashMessage]);

  useEffect(() => {
    loadInventariosData();
  }, []);

  useEffect(() => {
    if (inventarioIdFromUrl) {
      setSelectedInventario(inventarioIdFromUrl);
    }
  }, [inventarioIdFromUrl]);

  useEffect(() => {
    if (selectedInventario) {
      loadRondasData(selectedInventario, rondaIdFromUrl || null);
    }
  }, [selectedInventario, rondaIdFromUrl, loadRondasData]);

  useEffect(() => {
    if (selectedRonda) {
      loadRoundContext(selectedRonda);
    } else {
      setPendientes([]);
      setResumen([]);
      setHistory([]);
      setStats(null);
    }
  }, [selectedRonda, loadRoundContext]);

  useEffect(() => {
    if (!selectedRonda?.id || selectedRonda.estado !== 'activa') return;

    const interval = setInterval(() => {
      loadRoundContext(selectedRonda);
    }, 4000);

    return () => clearInterval(interval);
  }, [selectedRonda, loadRoundContext]);

  useEffect(() => {
    if (!bootLoading) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [bootLoading, selectedRondaId]);

  const handleRefresh = async () => {
    if (!selectedInventario) return;
    await loadRondasData(selectedInventario, selectedRondaId || rondaIdFromUrl || null);
  };

  const handleRondaAction = async (action) => {
    if (!selectedRonda?.id) return;

    try {
      if (action === 'iniciar') {
        await iniciarRonda(selectedRonda.id);
        setFlashMessage('Ronda iniciada. Ya puedes escanear.', 'success');
      } else if (action === 'pausar') {
        await pausarRonda(selectedRonda.id);
        setFlashMessage('Ronda pausada.', 'warning');
      } else if (action === 'reanudar') {
        await reanudarRonda(selectedRonda.id);
        setFlashMessage('Ronda reanudada.', 'success');
      }

      await loadRondasData(selectedInventario, selectedRonda.id);
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (err) {
      setFlashMessage(
        err.response?.data?.message || 'No se pudo actualizar el estado de la ronda',
        'error'
      );
    }
  };

  const handleScan = async (e) => {
    e.preventDefault();

    const codigoLimpio = codigo.trim();

    if (!codigoLimpio) return;

    if (!/^\d{5,7}$/.test(codigoLimpio)) {
      setFlashMessage(
        'Código inválido. Debe tener entre 5 y 7 dígitos numéricos.',
        'warning'
      );
      setCodigo('');
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }

    const now = Date.now();

    if (
      lastSentRef.current.code === codigoLimpio &&
      now - lastSentRef.current.at < 700
    ) {
      setCodigo('');
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }

    lastSentRef.current = {
      code: codigoLimpio,
      at: now
    };

    if (!selectedRonda?.id) {
      setFlashMessage('Debes seleccionar una ronda.', 'error');
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }

    if (selectedRonda.estado !== 'activa') {
      setFlashMessage('La ronda debe estar activa para escanear.', 'warning');
      setCodigo('');
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }

    if (!grupoAsignado?.id) {
      setFlashMessage('Esta ronda no tiene un grupo asignado.', 'error');
      setCodigo('');
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }

    setLoadingScan(true);

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

      playBeep();
      setLastScan(payload);
      setFlashMessage(message, warning ? 'warning' : 'success');

      setCodigo('');
      await loadRoundContext(selectedRonda);
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (err) {
      setFlashMessage(
        err.response?.data?.message || 'Error al registrar lectura',
        'error'
      );
      setCodigo('');
      setTimeout(() => inputRef.current?.focus(), 50);
    } finally {
      setLoadingScan(false);
    }
  };

  // NUEVA FUNCIÓN: Agregar producto manualmente con cantidad y veces
  const handleAgregarManual = async () => {
    if (!manualSku.trim()) {
      setFlashMessage('Debes ingresar un SKU', 'error');
      return;
    }

    if (!/^\d{5,7}$/.test(manualSku.trim())) {
      setFlashMessage('SKU inválido. Debe tener entre 5 y 7 dígitos numéricos.', 'warning');
      return;
    }

    if (manualCantidad <= 0) {
      setFlashMessage('La cantidad debe ser mayor a 0', 'error');
      return;
    }

    if (manualRepeticiones <= 0 || manualRepeticiones > 100) {
      setFlashMessage('Las repeticiones deben ser entre 1 y 100', 'error');
      return;
    }

    if (!selectedRonda?.id) {
      setFlashMessage('Debes seleccionar una ronda', 'error');
      return;
    }

    if (selectedRonda.estado !== 'activa') {
      setFlashMessage('La ronda debe estar activa para agregar productos', 'warning');
      return;
    }

    if (!grupoAsignado?.id) {
      setFlashMessage('Esta ronda no tiene un grupo asignado', 'error');
      return;
    }

    setLoadingManual(true);

    try {
      let totalAgregados = 0;
      let errores = [];

      // Agregar la cantidad de repeticiones seleccionada
      for (let i = 0; i < manualRepeticiones; i++) {
        try {
          await agregarLecturaManual({
            rondaId: selectedRonda.id,
            grupoId: grupoAsignado.id,
            sku: manualSku.trim(),
            cantidad: manualCantidad
          });

          totalAgregados++;
          playBeep();
        } catch (err) {
          errores.push(`Intento ${i + 1}: ${err.response?.data?.message || err.message}`);
        }

        // Pequeña pausa entre agregados
        if (i < manualRepeticiones - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      if (totalAgregados > 0) {
        const unidadesTotales = manualRepeticiones * manualCantidad;
        const mensaje = `✅ Se agregaron ${totalAgregados} registros de ${manualSku.trim()} (${unidadesTotales} unidades totales)`;
        setFlashMessage(mensaje, errores.length > 0 ? 'warning' : 'success');

        // Cerrar modal y limpiar
        setShowManualModal(false);
        setManualSku('');
        setManualCantidad(1);
        setManualRepeticiones(1);

        // Recargar datos
        await loadRoundContext(selectedRonda);
      }

      if (errores.length > 0) {
        console.error('Errores en agregados manuales:', errores);
        setFlashMessage(`⚠️ ${errores.length} errores. Último: ${errores[0]}`, 'warning');
      }

    } catch (err) {
      setFlashMessage(
        err.response?.data?.message || 'Error al agregar producto manualmente',
        'error'
      );
    } finally {
      setLoadingManual(false);
    }
  };

  const handleAnularLectura = async (lecturaId) => {
    const ok = window.confirm('¿Anular esta lectura?');
    if (!ok) return;

    try {
      await anularLectura(lecturaId);
      setHistory((prev) => prev.filter((lectura) => Number(lectura.id) !== Number(lecturaId)));
      setFlashMessage('Lectura anulada correctamente', 'success');
      await loadRoundContext(selectedRonda);
    } catch (err) {
      setFlashMessage(
        err.response?.data?.message || 'No se pudo anular la lectura',
        'error'
      );
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

      const csv = rows
        .map((row) =>
          row
            .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
            .join(',')
        )
        .join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.setAttribute(
        'download',
        `grupo-${data?.grupo?.nombre || 'resultado'}-ronda-${data?.ronda?.numeroRonda || 'x'}.csv`
      );

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setFlashMessage('Exportación del grupo generada correctamente', 'success');
    } catch (err) {
      setFlashMessage(
        err.response?.data?.message || 'No se pudo exportar el grupo',
        'error'
      );
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
    <div className="dashboard-container escaneo-page">
      <audio ref={audioRef} src="/beep.mp3" preload="auto" />

      <div className="card filters-card escaneo-toolbar">
        <div className="filters-header">
          <div className="filters-form">
            <div className="form-group">
              <label>Inventario</label>
              <select
                value={selectedInventario}
                onChange={(e) => setSelectedInventario(Number(e.target.value))}
              >
                {inventarios.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.nombre} - {inv.fecha}
                  </option>
                ))}
              </select>
            </div>

            {!isContador && (
              <div className="form-group">
                <label>Ronda de trabajo</label>
                <select
                  value={selectedRondaId || ''}
                  onChange={(e) => setSelectedRondaId(e.target.value ? Number(e.target.value) : '')}
                  disabled={rondas.length === 0}
                >
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
                <input
                  value={
                    selectedRonda
                      ? `Ronda ${selectedRonda.numeroRonda} · ${selectedRonda.tipoRonda} · ${selectedRonda.estado}`
                      : 'No tienes ronda activa en este inventario'
                  }
                  disabled
                />
              </div>
            )}
          </div>

          <div className="filters-actions">
            <div className="last-update">
              <Clock size={14} />
              <span>{syncing ? 'Sincronizando...' : 'Vista sincronizada'}</span>
            </div>

            <button className="btn btn-outline" onClick={handleRefresh}>
              <RefreshCw size={16} className={syncing ? 'spin' : ''} />
              <span>Actualizar</span>
            </button>
          </div>
        </div>

        {selectedRonda ? (
          <div className="escaneo-meta-grid">
            <div className="escaneo-meta-item">
              <span className="meta-label">Grupo</span>
              <strong>{grupoAsignado?.nombre || 'Sin grupo'}</strong>
            </div>

            <div className="escaneo-meta-item">
              <span className="meta-label">Zona</span>
              <strong>
                {zonaRonda?.nombre || 'Sin zona'}
                {zonaRonda?.codigo ? ` (${zonaRonda.codigo})` : ''}
              </strong>
            </div>

            <div className="escaneo-meta-item">
              <span className="meta-label">Tipo</span>
              <strong>
                {selectedRonda.tipoRonda === 'reconteo' ? 'Reconteo' : 'Completa'}
              </strong>
            </div>

            <div className="escaneo-meta-item">
              <span className="meta-label">Estado</span>
              <span className={`status-chip ${selectedRonda.estado}`}>
                {selectedRonda.estado}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {flash.text ? (
        <div
          className={`alert-${flash.type === 'error'
            ? 'error'
            : flash.type === 'warning'
              ? 'warning'
              : 'success'
            }`}
        >
          {flash.text}
        </div>
      ) : null}

      {selectedRonda ? (
        <>
          <div className="kpi-grid">
            <div className="card kpi-card">
              <div className="kpi-icon">
                <Boxes size={24} />
              </div>
              <div className="kpi-content">
                <p className="kpi-title">Total escaneos</p>
                <h3 className="kpi-value">{totalEscaneos}</h3>
              </div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-icon">
                <Layers3 size={24} />
              </div>
              <div className="kpi-content">
                <p className="kpi-title">Productos distintos</p>
                <h3 className="kpi-value">{productosUnicos}</h3>
              </div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-icon">
                <AlertTriangle size={24} />
              </div>
              <div className="kpi-content">
                <p className="kpi-title">Pendientes</p>
                <h3 className="kpi-value">{isReconteo ? pendientes.length : 0}</h3>
              </div>
            </div>
          </div>

          <div className="scan-layout">
            <div className="card scanner-shell">
              <div className="list-header">
                <h2 className="section-title">
                  <ScanLine size={20} />
                  <span>Escanear producto</span>
                </h2>

                <div className="scanner-actions">
                  <button
                    className="btn btn-outline"
                    onClick={() => setShowManualModal(true)}
                    disabled={!canScan}
                  >
                    <Edit3 size={16} />
                    <span>Agregar Manual</span>
                  </button>

                  {selectedRonda.estado === 'borrador' ? (
                    <button className="btn btn-primary" onClick={() => handleRondaAction('iniciar')}>
                      <Play size={16} />
                      <span>Iniciar</span>
                    </button>
                  ) : null}

                  {selectedRonda.estado === 'activa' ? (
                    <button className="btn btn-outline" onClick={() => handleRondaAction('pausar')}>
                      <Pause size={16} />
                      <span>Pausar</span>
                    </button>
                  ) : null}

                  {selectedRonda.estado === 'pausada' ? (
                    <button className="btn btn-primary" onClick={() => handleRondaAction('reanudar')}>
                      <Play size={16} />
                      <span>Reanudar</span>
                    </button>
                  ) : null}

                  <button
                    className="btn btn-outline"
                    onClick={handleExportGrupo}
                    disabled={!grupoAsignado?.id || exporting}
                  >
                    <Download size={16} />
                    <span>{exporting ? 'Exportando...' : 'Exportar grupo'}</span>
                  </button>
                </div>
              </div>

              <form onSubmit={handleScan}>
                <div className="scanner-input-row">
                  <input
                    ref={inputRef}
                    type="text"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    placeholder="Escanea o escribe el código"
                    autoComplete="off"
                    disabled={!canScan || loadingScan}
                  />
                  <button className="btn btn-primary" type="submit" disabled={!canScan || loadingScan}>
                    {loadingScan ? '...' : 'Escanear'}
                  </button>
                </div>
              </form>

              <p className="scan-helper">
                Solo se aceptan códigos numéricos de 5 a 7 dígitos. También puedes agregar productos manualmente con el botón "Agregar Manual".
              </p>

              {lastScan ? (
                <div className="last-scan-card">
                  <div className="last-scan-header">
                    <CheckCircle size={18} className="text-success" />
                    <span>Último escaneo</span>
                  </div>

                  <div className="last-scan-grid">
                    <div>
                      <span className="meta-label">SKU</span>
                      <strong>{lastScan.producto?.sku || 'No reconocido'}</strong>
                    </div>

                    <div>
                      <span className="meta-label">Descripción</span>
                      <strong>{lastScan.producto?.descripcion || 'Sin descripción'}</strong>
                    </div>

                    <div>
                      <span className="meta-label">Acumulado del SKU</span>
                      <strong>{lastScan.acumuladoSku || 0}</strong>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="card round-summary-card">
              <h2 className="section-title">
                <Zap size={20} />
                <span>Estado de la ronda</span>
              </h2>

              <div className="round-summary-grid">
                <div className="summary-box">
                  <span>Inicio</span>
                  <strong>{formatDateTime(selectedRonda.tiempoInicio)}</strong>
                </div>

                <div className="summary-box">
                  <span>Fin</span>
                  <strong>{formatDateTime(selectedRonda.tiempoFin)}</strong>
                </div>

                <div className="summary-box">
                  <span>Primera lectura</span>
                  <strong>{formatDateTime(stats?.primeraLectura)}</strong>
                </div>

                <div className="summary-box">
                  <span>Última lectura</span>
                  <strong>{formatDateTime(stats?.ultimaLectura)}</strong>
                </div>

                <div className="summary-box full">
                  <span>Tiempo activo</span>
                  <strong>{stats?.tiempoFormateado || '—'}</strong>
                </div>
              </div>

              {isReconteo ? (
                <div className="pending-panel">
                  <div className="pending-header">
                    <AlertTriangle size={16} />
                    <span>SKU pendientes para reconteo ({pendientes.length})</span>
                  </div>

                  {pendientes.length === 0 ? (
                    <div className="escaneo-empty">
                      No hay pendientes para esta ronda.
                      <br />
                      <small>Ronda #{selectedRonda.id} · Zona {selectedRonda.zonaId || zonaRonda?.id || '—'}</small>
                    </div>
                  ) : (
                    <div className="pending-list">
                      {pendientes.map((item) => (
                        <div key={`${item.sku}-${item.id}`} className="pending-item">
                          <div>
                            <strong>{item.sku}</strong>
                            <p className="pending-sku-desc">{item.descripcionSnapshot || 'Sin descripción'}</p>
                          </div>
                          <div className="pending-diff">
                            <span className={`diff-badge ${item.diferencia > 0 ? 'positive' : 'negative'}`}>
                              {item.diferencia > 0 ? `+${item.diferencia}` : item.diferencia}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid-2">
            <div className="card resumen-card">
              <div className="list-header">
                <h2 className="section-title">
                  <Boxes size={20} />
                  <span>Resumen por producto</span>
                </h2>
              </div>

              {resumen.length === 0 ? (
                <div className="escaneo-empty">Aún no hay escaneos registrados.</div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Descripción</th>
                        <th>Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumen.map((item, index) => (
                        <tr key={`${item.sku || 'sku'}-${index}`}>
                          <td>
                            <strong>{item.sku}</strong>
                          </td>
                          <td>{item.descripcionSnapshot || 'Sin descripción'}</td>
                          <td>{item.cantidadTotal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card historial-card">
              <div className="list-header">
                <h2 className="section-title">
                  <History size={20} />
                  <span>Historial reciente</span>
                </h2>
              </div>

              {history.length === 0 ? (
                <div className="escaneo-empty">No hay lecturas recientes.</div>
              ) : (
                <div className="history-list">
                  {history.slice(0, 20).map((lectura) => (
                    <div
                      key={lectura.id}
                      className={`history-item ${lectura.estado === 'anulada' ? 'anulada' : ''}`}
                    >
                      <div className="history-main">
                        <strong>{lectura.codigoLeido}</strong>
                        <p>{lectura.sku || 'No reconocido'}</p>
                        {lectura.esManual && (
                          <span className="manual-badge">✏️ Manual</span>
                        )}
                      </div>

                      <div className="history-meta">
                        <span className="tag-muted">{formatOnlyTime(lectura.fechaHora)}</span>
                        <span className={`status-chip mini ${lectura.estado}`}>
                          {lectura.estado}
                        </span>
                        {lectura.estado !== 'anulada' ? (
                          <button
                            className="icon-btn"
                            onClick={() => handleAnularLectura(lectura.id)}
                            title="Anular lectura"
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="card">
          <p className="muted">Selecciona un inventario que tenga rondas disponibles.</p>
        </div>
      )}

      {/* Modal para entrada manual */}
      {showManualModal && (
        <div className="modal-overlay" onClick={() => setShowManualModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Plus size={18} />
                Agregar Producto Manualmente
              </h3>
              <button className="icon-btn" onClick={() => setShowManualModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Código SKU *</label>
                <input
                  type="text"
                  value={manualSku}
                  onChange={(e) => setManualSku(e.target.value.toUpperCase())}
                  placeholder="Ej: 123456"
                  autoFocus
                  className="manual-sku-input"
                />
                <small>Ingresa el código numérico de 5 a 7 dígitos</small>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Cantidad por registro *</label>
                  <input
                    type="number"
                    value={manualCantidad}
                    onChange={(e) => setManualCantidad(parseInt(e.target.value) || 1)}
                    min="1"
                    max="999999"
                    step="1"
                  />
                  <small>Unidades por cada registro</small>
                </div>

                <div className="form-group">
                  <label>Número de repeticiones *</label>
                  <input
                    type="number"
                    value={manualRepeticiones}
                    onChange={(e) => setManualRepeticiones(parseInt(e.target.value) || 1)}
                    min="1"
                    max="100"
                    step="1"
                  />
                  <small>¿Cuántas veces quieres agregar este producto? (1-100)</small>
                </div>
              </div>

              <div className="manual-summary">
                <p>
                  <strong>Resumen:</strong>
                </p>
                <p>
                  • {manualRepeticiones} registro(s) de {manualSku || 'SKU'}
                </p>
                <p>
                  • {manualCantidad} unidad(es) por registro
                </p>
                <p className="total-unidades">
                  📦 Total de unidades: <strong>{manualRepeticiones * manualCantidad}</strong>
                </p>
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="btn btn-outline"
                onClick={() => setShowManualModal(false)}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={handleAgregarManual}
                disabled={loadingManual || !manualSku.trim()}
              >
                {loadingManual ? 'Agregando...' : `Agregar (${manualRepeticiones} × ${manualCantidad})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}