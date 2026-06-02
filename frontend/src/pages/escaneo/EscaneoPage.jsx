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
  Minimize2,
  Database,
  GitCompareArrows,
  Edit3,
  Plus,
  Edit2
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
import api from '../../services/api';
import {
  savePendingScan,
  getPendingStats,
  syncAllPendingScans,
  isOnline as checkOnline
} from '../../services/offlineStorage';
import ModalErrorLectura from '../../pages/escaneo/ModalErrorLectura';
import alertaSound from '../../sound/alerta.mp3';

function SkuEtiquetaBadge({ etiqueta }) {
  if (!etiqueta) return null;

  return (
    <span
      className="sku-etiqueta-badge"
      style={{
        backgroundColor: etiqueta.color || '#f59e0b',
        color: 'white',
        padding: '3px 8px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        marginRight: '6px',
        marginTop: '6px'
      }}
      title={etiqueta.nota || etiqueta.nombre}
    >
      {etiqueta.nombre}
    </span>
  );
}


function limpiarTextoParaVoz(value, maxLength = 90) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function hablarTexto(texto) {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const textoLimpio = limpiarTextoParaVoz(texto, 60);
    if (!textoLimpio) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(textoLimpio);
    utterance.lang = 'es-CO';
    utterance.rate = 2.0;
    utterance.pitch = 1;
    utterance.volume = 1;

    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.warn('No se pudo reproducir voz:', error);
  }
}

function hablarEscaneoExitoso({ sku, acumulado }) {
  const skuTexto = limpiarTextoParaVoz(sku, 40);
  const totalTexto = Number(acumulado || 0);

  hablarTexto(`${skuTexto}. Total ${totalTexto}`);
}

export default function EscaneoPage() {
  const [searchParams] = useSearchParams();

  const inventarioIdFromUrl = Number(searchParams.get('inventarioId') || 0);
  const rondaIdFromUrl = Number(searchParams.get('rondaId') || 0);

  const inputRef = useRef(null);
  const audioRef = useRef(null);
  const errorAudioRef = useRef(null);
  const scannerTimeoutRef = useRef(null);
  const scanQueueRef = useRef([]);
  const processingQueueRef = useRef(false);
  const refreshTimeoutRef = useRef(null);
  const codigosCruceZonaAutorizadosRef = useRef(new Set());

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
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);

  const [showZoneWarning, setShowZoneWarning] = useState(false);
  const [zoneWarningInfo, setZoneWarningInfo] = useState(null);
  const [scanPendienteBodega, setScanPendienteBodega] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Modal entrada manual
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualSku, setManualSku] = useState('');
  const [manualCantidad, setManualCantidad] = useState(1);
  const [manualRepeticiones, setManualRepeticiones] = useState(1);
  const [loadingManual, setLoadingManual] = useState(false);

  // Modal edición de producto (solo admin)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editProducto, setEditProducto] = useState(null);
  const [editCantidad, setEditCantidad] = useState(0);
  const [loadingEdit, setLoadingEdit] = useState(false);

  // Etiquetas visuales por SKU. No bloquean escaneo ni cambian cantidades.
  const [etiquetasProducto, setEtiquetasProducto] = useState([]);
  const [etiquetaNombre, setEtiquetaNombre] = useState('Muchos stickers');
  const [etiquetaColor, setEtiquetaColor] = useState('#dc2626');
  const [etiquetaNota, setEtiquetaNota] = useState('');
  const [savingEtiqueta, setSavingEtiqueta] = useState(false);

  // Estado para inventario anterior (pareja)
  const [inventarioPareja, setInventarioPareja] = useState(null);
  const [parejaResumen, setParejaResumen] = useState([]);
  const [loadingPareja, setLoadingPareja] = useState(false);
  const [parejaError, setParejaError] = useState(null);

  // Estado para alerta de SKU no encontrado
  const [showSkuWarning, setShowSkuWarning] = useState(false);
  const [skuWarningInfo, setSkuWarningInfo] = useState(null);

  // Estados para modal de error de lectura
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorInfo, setErrorInfo] = useState({
    codigoRechazado: '',
    ultimoExitoso: '',
    motivo: ''
  });

  // Offline state
  const [isOnline, setIsOnline] = useState(checkOnline());
  const [pendingCount, setPendingCount] = useState(0);
  const [offlineSyncing, setOfflineSyncing] = useState(false);

  const auth = useAuth();
  const rol = String(auth?.user?.rol || auth?.user?.rol?.nombre || '').toLowerCase();
  const isContador = rol === 'contador';
  const isSupervisor = rol === 'supervisor';
  const isAdmin = rol === 'admin';

  // Console.log para depurar roles
  console.log('=== INFORMACION DE ROL ===');
  console.log('Usuario autenticado:', auth?.user);
  console.log('Rol obtenido:', rol);
  console.log('Es contador?', isContador);
  console.log('Es supervisor?', isSupervisor);
  console.log('Es admin?', isAdmin);
  console.log('==========================');
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

  const playErrorBeep = () => {
    if (!errorAudioRef.current) return;
    errorAudioRef.current.currentTime = 0;
    errorAudioRef.current.play().catch((err) => {
      console.log('Error reproduciendo sonido de alerta:', err);
    });
  };

  // Desbloquear audio después de la primera interacción
  useEffect(() => {
    const unlockAudio = () => {
      if (errorAudioRef.current) {
        errorAudioRef.current.play().then(() => {
          errorAudioRef.current.pause();
          errorAudioRef.current.currentTime = 0;
        }).catch(() => { });
      }
      if (audioRef.current) {
        audioRef.current.play().then(() => {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }).catch(() => { });
      }
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };

    document.addEventListener('click', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (scannerTimeoutRef.current) {
        clearTimeout(scannerTimeoutRef.current);
      }

      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

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

  // Cargar inventario base de validación y su resumen
  const loadInventarioPareja = useCallback(async (inventarioId, zonaId) => {
    if (!inventarioId) {
      setInventarioPareja(null);
      setParejaResumen([]);
      return;
    }

    const inventarioActual = inventarios.find(
      (item) => Number(item.id) === Number(inventarioId)
    );

    if (!inventarioActual) {
      setInventarioPareja(null);
      setParejaResumen([]);
      return;
    }

    // Si no tiene inventarioBaseId, este inventario ES la base.
    // No debe mostrar tabla de inventario anterior/base.
    if (!inventarioActual.inventarioBaseId) {
      setInventarioPareja(null);
      setParejaResumen([]);
      setParejaError(null);
      return;
    }

    setLoadingPareja(true);
    setParejaError(null);

    try {
      const inventarioBaseId = Number(inventarioActual.inventarioBaseId);

      const inventarioBase = inventarios.find(
        (item) => Number(item.id) === inventarioBaseId
      );

      setInventarioPareja({
        id: inventarioBaseId,
        inventarioParejaId: inventarioBaseId,
        nombre: inventarioBase?.nombre || `Inventario base ${inventarioBaseId}`,
        fecha: inventarioBase?.fecha || '',
        estado: inventarioBase?.estado || '',
        esBaseValidacion: true
      });

      // Esta tabla debe mostrar lo escaneado en el inventario base
      // para la zona actual. La validación de códigos sigue usando
      // conteo_inicial_detalle en el backend.
      const resumenData = await getResumenLecturas({
        inventarioId: inventarioBaseId,
        zonaId: zonaId || null,
        referenciaBase: true,
        fuente: 'lecturas'
      });

      setParejaResumen(resumenData || []);
    } catch (error) {
      console.error('Error cargando inventario base:', error);
      setParejaError('No se pudo cargar el inventario base de validación');
      setInventarioPareja(null);
      setParejaResumen([]);
    } finally {
      setLoadingPareja(false);
    }
  }, [inventarios]);

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

        pendientesRows = pendientesRows.map((p) => {
          const resumenProducto = resumenRows.find(
            (r) => String(r.sku).trim() === String(p.sku).trim()
          );

          const cantidadRecontada = Number(
            resumenProducto?.cantidadTotal ||
            p.cantidadRecontada ||
            0
          );

          return {
            ...p,
            cantidadRecontada,
            recontado: cantidadRecontada > 0
          };
        });
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

  const scheduleRoundContextRefresh = useCallback((ronda) => {
    if (!ronda?.id) return;

    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(() => {
      loadRoundContext(ronda).catch((error) => {
        console.error('Error refrescando contexto de ronda:', error);
      });
    }, 250);
  }, [loadRoundContext]);

  function getCruceZonaAutorizacionKey(codigoValue) {
    const codigoLimpio = String(codigoValue || '').trim();
    const inventarioId = selectedRonda?.inventarioId || selectedInventario || '';
    const zonaId = selectedRonda?.zonaId || '';
    return `${inventarioId}:${zonaId}:${codigoLimpio}`;
  }

  function codigoTienePermisoCruceZona(codigoValue) {
    const key = getCruceZonaAutorizacionKey(codigoValue);

    return (
      codigosCruceZonaAutorizadosRef.current.has(key) ||
      sessionStorage.getItem(`cruce-zona-ok:${key}`) === '1' ||
      // Compatibilidad con autorizaciones guardadas con el nombre anterior.
      sessionStorage.getItem(`bodega-ok:${key}`) === '1'
    );
  }

  function marcarCodigoComoCruceZona(codigoValue) {
    const key = getCruceZonaAutorizacionKey(codigoValue);

    codigosCruceZonaAutorizadosRef.current.add(key);
    sessionStorage.setItem(`cruce-zona-ok:${key}`, '1');
    // Compatibilidad vieja.
    sessionStorage.setItem(`bodega-ok:${key}`, '1');
  }

  // Función para procesar escaneo directamente
  const procesarEscaneoDirecto = useCallback(async (codigo, meta = {}) => {
    console.log('=== INICIANDO ESCANEO ===');
    console.log('Código a enviar:', codigo);
    console.log('Es reconteo:', isReconteo);

    if (isReconteo && selectedRonda?.alcanceReconteo !== 'inventario_base') {
      const productoPermitido = pendientes.find(
        (p) => String(p.sku).trim() === String(codigo).trim()
      );

      console.log('¿Está en lista de reconteo?', Boolean(productoPermitido));

      if (!productoPermitido) {
        playErrorBeep();
        hablarTexto('Error');

        setErrorInfo({
          codigoRechazado: codigo,
          ultimoExitoso: lastScan?.producto?.sku || null,
          motivo: 'En este reconteo solo se permiten productos pendientes de la lista'
        });

        setShowErrorModal(true);
        return;
      }
    }

    if (!selectedRonda?.id || selectedRonda.estado !== 'activa' || !grupoAsignado?.id) {
      playErrorBeep();
      hablarTexto('Error');
      setErrorInfo({
        codigoRechazado: codigo,
        ultimoExitoso: lastScan?.producto?.sku || null,
        motivo: 'La ronda no está activa o no tiene grupo asignado'
      });
      setShowErrorModal(true);
      return;
    }

    const permitidoPorCruceZona =
      meta.permitirConteoBodega === true ||
      meta.permitirConteoCruzadoZona === true ||
      codigoTienePermisoCruceZona(codigo);

    const payload = {
      rondaId: selectedRonda.id,
      grupoId: grupoAsignado.id,
      codigo: codigo,
      requestId: meta.requestId || null,
      scannedAtClient: meta.timestamp || Date.now(),
      // Compatibilidad vieja.
      permitirConteoBodega: permitidoPorCruceZona,
      // Nombre correcto para la lógica nueva.
      permitirConteoCruzadoZona: permitidoPorCruceZona
    };

    try {
      const raw = await scanLecturaRonda(payload);
      playBeep();
      const responseData = raw?.data || raw;
      const productoVoz = responseData?.producto || {};
      const skuVoz = productoVoz?.sku || codigo;
      const acumuladoVoz = responseData?.acumuladoSku || 0;

      setLastScan(responseData);
      setScanPendienteBodega((prev) => {
        if (String(prev?.codigo || '').trim() === String(codigo || '').trim()) return null;
        return prev;
      });
      hablarEscaneoExitoso({
        sku: skuVoz,
        acumulado: acumuladoVoz
      });
      setFlashMessage(`✅ Producto ${skuVoz} registrado correctamente`, 'success');
      scheduleRoundContextRefresh(selectedRonda);
    } catch (err) {
      console.error('Error en escaneo:', err);
      playErrorBeep();

      if (err.response?.status === 409 && err.response?.data?.code === 'PRODUCTO_EN_OTRA_ZONA') {
        const errorData = err.response.data;
        setScanPendienteBodega({
          tipo: 'escaneo',
          codigo,
          rondaId: selectedRonda?.id || null,
          grupoId: grupoAsignado?.id || null
        });
        setShowZoneWarning(true);
        setZoneWarningInfo(errorData.data);
        hablarTexto('Error');
        setFlashMessage(errorData.message, 'error');
        return;
      }

      if (
        err.response?.status === 409 &&
        err.response?.data?.code === 'CODIGO_NO_REGISTRADO_BASE_DATOS'
      ) {
        const errorData = err.response.data;

        setErrorInfo({
          codigoRechazado: codigo,
          ultimoExitoso: lastScan?.producto?.sku || null,
          motivo: 'codigo_no_registrado_base_datos'
        });

        setShowErrorModal(true);
        hablarTexto('Error');
        setFlashMessage(
          errorData.message || 'Este código no está registrado en la base de datos',
          'error'
        );

        return;
      }

      let mensajeError = err.response?.data?.message || err.response?.data?.error || 'Error en el servidor';

      if (mensajeError.includes('reconteo solo se permiten productos reconocidos y pendientes')) {
        mensajeError = '❌ Este producto no está en la lista de pendientes para reconteo';
      }

      setErrorInfo({
        codigoRechazado: codigo,
        ultimoExitoso: lastScan?.producto?.sku || null,
        motivo: mensajeError
      });
      setShowErrorModal(true);
      hablarTexto('Error');
      setFlashMessage(mensajeError, 'error');
    }
  }, [selectedRonda, grupoAsignado, lastScan, scheduleRoundContextRefresh, isReconteo, pendientes]);

  const processScanQueue = useCallback(async () => {
    if (processingQueueRef.current) return;

    processingQueueRef.current = true;

    try {
      while (scanQueueRef.current.length > 0) {
        const nextScan = scanQueueRef.current.shift();

        try {
          await procesarEscaneoDirecto(nextScan.codigo, {
            requestId: nextScan.requestId,
            timestamp: nextScan.timestamp,
            permitirConteoBodega: nextScan.permitirConteoBodega === true,
            permitirConteoCruzadoZona: nextScan.permitirConteoCruzadoZona === true
          });
        } catch (error) {
          console.error('Error procesando cola de escaneos:', error);
        }
      }
    } finally {
      processingQueueRef.current = false;
    }
  }, [procesarEscaneoDirecto]);

  const enqueueScan = useCallback((rawCode) => {
    const cleanCode = String(rawCode || '').replace(/[^0-9]/g, '').trim();

    if (!/^\d{5,6}$/.test(cleanCode)) {
      playErrorBeep();
      hablarTexto('Error');
      setErrorInfo({
        codigoRechazado: cleanCode || String(rawCode || ''),
        ultimoExitoso: lastScan?.producto?.sku || null,
        motivo: 'formato_invalido'
      });
      setShowErrorModal(true);
      return;
    }

    scanQueueRef.current.push({
      codigo: cleanCode,
      timestamp: Date.now(),
      requestId:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`
    });

    processScanQueue();
  }, [lastScan, processScanQueue]);

  // Cargar inventario pareja cuando cambia la ronda
  useEffect(() => {
    if (selectedRonda?.inventarioId && selectedRonda?.zonaId) {
      loadInventarioPareja(selectedRonda.inventarioId, selectedRonda.zonaId);
    } else {
      setInventarioPareja(null);
      setParejaResumen([]);
    }
  }, [selectedRonda, loadInventarioPareja]);

  // Offline: cargar pendientes
  const loadPendingStatsOffline = useCallback(async () => {
    try {
      const stats = await getPendingStats();
      setPendingCount(stats.total);
    } catch (error) {
      console.error('Error cargando pendientes offline:', error);
      setPendingCount(0);
    }
  }, []);

  // Sincronizar pendientes cuando hay internet
  const syncOfflineScans = useCallback(async () => {
    if (!checkOnline()) {
      setFlashMessage('No hay conexión a internet para sincronizar', 'warning');
      return;
    }

    if (offlineSyncing) {
      console.log('Ya hay una sincronización en curso');
      return;
    }

    setOfflineSyncing(true);
    try {
      const result = await syncAllPendingScans(api, (progress) => {
        console.log(`Sincronizando escaneos: ${progress.sincronizados}/${progress.total}`);
        loadPendingStatsOffline();
      });

      if (result.sincronizados > 0) {
        setFlashMessage(`${result.sincronizados} escaneo(s) sincronizado(s) correctamente`, 'success');
        if (selectedRonda) {
          await loadRoundContext(selectedRonda);
        }
      }
    } catch (error) {
      console.error('Error sincronizando offline:', error);
      setFlashMessage('Error al sincronizar escaneos offline', 'error');
    } finally {
      setOfflineSyncing(false);
    }
  }, [loadRoundContext, selectedRonda, loadPendingStatsOffline, offlineSyncing]);

  // Monitoreo de conexión
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setFlashMessage('Conexión restablecida. Sincronizando...', 'success');
      syncOfflineScans();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setFlashMessage('Sin conexión a internet. Los escaneos se guardarán localmente.', 'warning');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncOfflineScans]);

  useEffect(() => {
    loadPendingStatsOffline();
  }, [loadPendingStatsOffline]);

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
  }, [bootLoading, canScan]);

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

  const handleCodigoChange = useCallback((e) => {
    const value = e.target.value;
    const cleanValue = value.replace(/[^0-9]/g, '').slice(0, 12);

    setCodigo(cleanValue);

    if (scannerTimeoutRef.current) {
      clearTimeout(scannerTimeoutRef.current);
    }

    scannerTimeoutRef.current = setTimeout(() => {
      const finalCode = String(cleanValue || '').replace(/[^0-9]/g, '');

      if (/^\d{5,6}$/.test(finalCode)) {
        enqueueScan(finalCode);
        setCodigo('');
      }
    }, 120);
  }, [enqueueScan]);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();

    if (scannerTimeoutRef.current) {
      clearTimeout(scannerTimeoutRef.current);
    }

    const finalCode = String(codigo || '').replace(/[^0-9]/g, '');

    if (finalCode) {
      enqueueScan(finalCode);
      setCodigo('');
    }
  }, [codigo, enqueueScan]);

  const handleScannerKeyDown = useCallback((e) => {
    if (e.key !== 'Enter') return;

    e.preventDefault();

    if (scannerTimeoutRef.current) {
      clearTimeout(scannerTimeoutRef.current);
    }

    const finalCode = String(codigo || '').replace(/[^0-9]/g, '');

    if (finalCode) {
      enqueueScan(finalCode);
      setCodigo('');
    }
  }, [codigo, enqueueScan]);

  const handleAnularLectura = async (lecturaId) => {
    if (!window.confirm('¿Anular esta lectura?')) return;
    try {
      await anularLectura(lecturaId);
      setHistory((prev) => prev.filter((l) => Number(l.id) !== Number(lecturaId)));
      setFlashMessage('Lectura anulada', 'success');
      await loadRoundContext(selectedRonda);
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

  // Funciones para editar/eliminar productos y etiquetar SKUs
  const cargarEtiquetasSku = useCallback(async (sku) => {
    const skuLimpio = String(sku || '').trim();
    if (!skuLimpio) return [];

    try {
      const response = await api.get(`/sku-etiquetas/${skuLimpio}`);
      return response.data?.data || response.data || [];
    } catch (error) {
      console.warn('No se pudieron cargar etiquetas del SKU:', error?.response?.data || error?.message || error);
      return [];
    }
  }, []);

  const prepararFormularioEtiqueta = (etiquetas = []) => {
    const primera = Array.isArray(etiquetas) && etiquetas.length > 0 ? etiquetas[0] : null;

    setEtiquetaNombre('Muchos stickers');
    setEtiquetaColor('#dc2626');
    setEtiquetaNota('');
  };

  const handleEditarProducto = async (item) => {
    console.log('=== handleEditarProducto / Etiquetar SKU ===');
    console.log('Producto:', item);

    setEditProducto(item);
    setEditCantidad(Number(item?.cantidadTotal || 0));
    setShowEditModal(true);

    const etiquetasLocales = Array.isArray(item?.etiquetas) ? item.etiquetas : [];
    setEtiquetasProducto(etiquetasLocales);
    prepararFormularioEtiqueta(etiquetasLocales);

    const etiquetasRemotas = await cargarEtiquetasSku(item?.sku);
    if (etiquetasRemotas.length > 0) {
      setEtiquetasProducto(etiquetasRemotas);
      prepararFormularioEtiqueta(etiquetasRemotas);
    }
  };

  const handleEliminarProducto = async (sku) => {
    console.log('=== handleEliminarProducto ===');
    console.log('SKU a eliminar:', sku);
    console.log('Ronda ID:', selectedRonda?.id);

    if (!isAdmin) {
      setFlashMessage('No tienes permisos para eliminar productos. Solo Administradores.', 'error');
      return;
    }

    if (!selectedRonda?.id) {
      setFlashMessage('No hay una ronda seleccionada', 'error');
      return;
    }

    const confirmado = window.confirm(`¿Estas seguro de que quieres eliminar TODAS las lecturas del producto ${sku}? Esta accion no se puede deshacer.`);

    if (!confirmado) {
      console.log('Eliminacion cancelada por el usuario');
      return;
    }

    setLoadingEdit(true);
    try {
      console.log('Llamando a API:', `/lecturas/ronda/${selectedRonda.id}/sku/${sku}`);

      const response = await api.delete(`/lecturas/ronda/${selectedRonda.id}/sku/${sku}`);
      console.log('Respuesta del backend:', response.data);

      if (response.data.ok) {
        setFlashMessage(response.data.message || `Producto ${sku} eliminado correctamente`, 'success');
        setResumen((prev) => prev.filter(item => item.sku !== sku));
        await loadRoundContext(selectedRonda);
      } else {
        setFlashMessage(response.data.message || 'Error al eliminar el producto', 'error');
      }
    } catch (error) {
      console.error('Error en handleEliminarProducto:', error);
      console.error('Detalles:', error.response?.data);
      const mensajeError = error.response?.data?.message || error.message || 'Error al eliminar el producto';
      setFlashMessage(mensajeError, 'error');
    } finally {
      setLoadingEdit(false);
    }
  };

  const handleGuardarEtiqueta = async () => {
    const sku = String(editProducto?.sku || '').trim();

    if (!sku) {
      setFlashMessage('No hay SKU seleccionado para etiquetar', 'error');
      return;
    }

    setSavingEtiqueta(true);

    try {
      let response;
      const payloadEtiqueta = { sku };

      try {
        response = await api.post('/sku-etiquetas/upsert', payloadEtiqueta);
      } catch (firstError) {
        // Compatibilidad por si montaste la ruta como /etiquetas/upsert.
        if (firstError?.response?.status === 404) {
          response = await api.post('/etiquetas/upsert', payloadEtiqueta);
        } else {
          throw firstError;
        }
      }

      const etiquetaGuardada = response.data?.data || response.data;
      const etiquetasActualizadas = await cargarEtiquetasSku(sku);
      const etiquetasFinales = etiquetasActualizadas.length > 0
        ? etiquetasActualizadas
        : etiquetaGuardada?.id
          ? [etiquetaGuardada]
          : etiquetasProducto;

      setEtiquetasProducto(etiquetasFinales);

      setResumen((prev) => prev.map((item) => (
        String(item.sku).trim() === sku
          ? { ...item, etiquetas: etiquetasFinales }
          : item
      )));

      setLastScan((prev) => {
        if (String(prev?.producto?.sku || '').trim() !== sku) return prev;
        return {
          ...prev,
          producto: {
            ...prev.producto,
            etiquetas: etiquetasFinales
          }
        };
      });

      setFlashMessage(`Etiqueta guardada para SKU ${sku}`, 'success');
    } catch (error) {
      console.error('Error guardando etiqueta:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      setFlashMessage(
        error.response?.data?.message ||
          error.response?.data?.error ||
          'No se pudo guardar la etiqueta',
        'error'
      );
    } finally {
      setSavingEtiqueta(false);
    }
  };

  const handleSaveEdit = async () => {
    console.log('=== handleSaveEdit ===');
    console.log('Producto a editar:', editProducto);
    console.log('Nueva cantidad:', editCantidad);
    console.log('Ronda ID:', selectedRonda?.id);

    if (!editProducto) {
      console.log('Validacion fallida: no hay producto');
      return;
    }

    if (!isAdmin) {
      setFlashMessage('Este rol solo puede guardar etiquetas. La cantidad queda en solo lectura.', 'warning');
      return;
    }

    if (!selectedRonda?.id) {
      setFlashMessage('No hay una ronda seleccionada', 'error');
      return;
    }

    if (editCantidad < 0) {
      setFlashMessage('La cantidad no puede ser negativa', 'error');
      return;
    }

    setLoadingEdit(true);
    try {
      console.log('Llamando a API PUT:', `/lecturas/ronda/${selectedRonda.id}/sku/${editProducto.sku}`);
      console.log('Payload:', { nuevaCantidad: editCantidad });

      const response = await api.put(`/lecturas/ronda/${selectedRonda.id}/sku/${editProducto.sku}`, {
        nuevaCantidad: editCantidad
      });

      console.log('Respuesta del backend:', response.data);

      if (response.data.ok) {
        setFlashMessage(response.data.message || `Producto ${editProducto.sku} actualizado a ${editCantidad} unidades`, 'success');
        setResumen((prev) => prev.map(item => item.sku === editProducto.sku ? { ...item, cantidadTotal: editCantidad } : item));
        await loadRoundContext(selectedRonda);
      } else {
        setFlashMessage(response.data.message || 'Error al actualizar el producto', 'error');
      }
    } catch (error) {
      console.error('Error en handleSaveEdit:', error);
      console.error('Detalles:', error.response?.data);
      const mensajeError = error.response?.data?.message || error.message || 'Error al actualizar el producto';
      setFlashMessage(mensajeError, 'error');
    } finally {
      setLoadingEdit(false);
    }
  };

  // Función para agregar producto manual
  const handleAgregarManual = async () => {
    const skuLimpio = manualSku.trim().toUpperCase();

    if (!skuLimpio) {
      setFlashMessage('Debes ingresar un SKU', 'error');
      return;
    }

    if (!/^\d{5,6}$/.test(skuLimpio)) {
      setFlashMessage('SKU inválido. Debe tener entre 5 y 6 dígitos numéricos.', 'warning');
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
      const permitidoPorCruceZonaManual = codigoTienePermisoCruceZona(skuLimpio);

      const response = await agregarLecturaManual({
        rondaId: selectedRonda.id,
        grupoId: grupoAsignado.id,
        sku: skuLimpio,
        cantidad: manualCantidad * manualRepeticiones,
        permitirConteoBodega: permitidoPorCruceZonaManual,
        permitirConteoCruzadoZona: permitidoPorCruceZonaManual
      });

      if (response.ok) {
        playBeep();
        setFlashMessage(response.message || `Producto ${skuLimpio} agregado correctamente`, 'success');

        setShowManualModal(false);
        setManualSku('');
        setManualCantidad(1);
        setManualRepeticiones(1);

        await loadRoundContext(selectedRonda);
      } else {
        setFlashMessage(response.message || 'Error al agregar producto', 'error');
      }
    } catch (err) {
      console.error('Error en agregar manual:', err);

      if (err.response?.status === 409 && err.response?.data?.code === 'PRODUCTO_EN_OTRA_ZONA') {
        const errorData = err.response.data;
        setScanPendienteBodega({
          tipo: 'manual',
          codigo: skuLimpio,
          cantidad: manualCantidad * manualRepeticiones,
          rondaId: selectedRonda?.id || null,
          grupoId: grupoAsignado?.id || null
        });
        setShowZoneWarning(true);
        setZoneWarningInfo(errorData.data);
        hablarTexto('Error');
        setFlashMessage(errorData.message, 'error');
      } else if (
        err.response?.status === 409 &&
        err.response?.data?.code === 'CODIGO_NO_REGISTRADO_BASE_DATOS'
      ) {
        const errorData = err.response.data;

        setErrorInfo({
          codigoRechazado: skuLimpio,
          ultimoExitoso: lastScan?.producto?.sku || null,
          motivo: 'codigo_no_registrado_base_datos'
        });

        setShowErrorModal(true);
        setFlashMessage(
          errorData.message || 'Este código no está registrado en la base de datos',
          'error'
        );
      } else {
        setFlashMessage(err.response?.data?.message || 'Error al agregar producto manualmente', 'error');
      }
    } finally {
      setLoadingManual(false);
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


  function cerrarZoneWarning() {
    setShowZoneWarning(false);
    setZoneWarningInfo(null);
    setScanPendienteBodega(null);
  }

  async function handleAutorizarCruceZona() {
    if (!scanPendienteBodega?.codigo) {
      setFlashMessage('No hay código pendiente para autorizar en esta zona', 'error');
      return;
    }

    const codigoAutorizado = String(scanPendienteBodega.codigo || '').trim();

    try {
      setShowZoneWarning(false);
      marcarCodigoComoCruceZona(codigoAutorizado);

      if (scanPendienteBodega.tipo === 'manual') {
        const response = await agregarLecturaManual({
          rondaId: selectedRonda.id,
          grupoId: grupoAsignado.id,
          sku: codigoAutorizado,
          cantidad: Number(scanPendienteBodega.cantidad || 1),
          permitirConteoBodega: true,
          permitirConteoCruzadoZona: true
        });

        if (response?.ok === false) {
          throw new Error(response.message || 'No se pudo autorizar el conteo en esta zona');
        }

        playBeep();
        hablarEscaneoExitoso({
          sku: codigoAutorizado,
          acumulado: response?.data?.acumuladoSku || response?.acumuladoSku || 0
        });
        setFlashMessage(`Producto ${codigoAutorizado} autorizado y contado en esta zona`, 'success');
        setShowManualModal(false);
        setManualSku('');
        setManualCantidad(1);
        setManualRepeticiones(1);
        await loadRoundContext(selectedRonda);
      } else {
        await procesarEscaneoDirecto(codigoAutorizado, {
          permitirConteoBodega: true,
          permitirConteoCruzadoZona: true,
          requestId:
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`,
          timestamp: Date.now()
        });
      }

      setScanPendienteBodega(null);
    } catch (error) {
      console.error('Error autorizando cruce de zona:', error);
      hablarTexto('Error');
      setFlashMessage(
        error.response?.data?.message || error.message || 'No se pudo autorizar el conteo en esta zona',
        'error'
      );
    }
  }

  return (
    <div className={`dashboard-container escaneo-page ${fullScreen ? 'fullscreen-mode' : ''}`}>
      <audio ref={audioRef} src="/beep.mp3" preload="auto" />
      <audio ref={errorAudioRef} src={alertaSound} preload="auto" />

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
                  Ronda {ronda.numeroRonda} - {ronda.estado} {ronda.tipoRonda === 'reconteo' ? '(Reconteo)' : ''}
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

      <div className="connection-status-bar">
        {isOnline ? (
          <div className="online-badge">
            <span>Online</span>
            {pendingCount > 0 && (
              <button
                className="sync-btn"
                onClick={syncOfflineScans}
                disabled={offlineSyncing}
              >
                Sincronizar ({pendingCount})
              </button>
            )}
          </div>
        ) : (
          <div className="offline-badge">
            <span>Offline - Escaneos guardados localmente</span>
            {pendingCount > 0 && <span className="pending-count">({pendingCount} pendientes)</span>}
          </div>
        )}
      </div>

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
        <div className={`alert-${flash.type === 'error' ? 'error' : flash.type === 'warning' ? 'warning' : flash.type === 'info' ? 'info' : 'success'}`}>
          {flash.text}
        </div>
      )}

      {selectedRonda ? (
        <>
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
                <h3 className="kpi-value">{isReconteo ? pendientes.filter(p => !p.recontado).length : 0}</h3>
              </div>
            </div>
          </div>

          <div className="scan-layout">
            <div className="card scanner-shell">
              <div className="list-header">
                <h2 className="section-title"><ScanLine size={20} /><span>Escanear producto</span></h2>
                <div className="scanner-actions">
                  <button className="btn btn-outline" onClick={() => setShowManualModal(true)} disabled={!canScan}>
                    <Edit3 size={16} /><span>Agregar Manual</span>
                  </button>
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
                  {(isAdmin || isSupervisor) && (
                    <button className="btn btn-outline" onClick={handleExportGrupo} disabled={!grupoAsignado?.id || exporting}>
                      <Download size={16} /><span>{exporting ? 'Exportando...' : 'Exportar'}</span>
                    </button>
                  )}
                </div>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="scanner-input-row">
                  <input
                    ref={inputRef}
                    type="text"
                    value={codigo}
                    onChange={handleCodigoChange}
                    onKeyDown={handleScannerKeyDown}
                    placeholder="Escanea el código (5-6 dígitos)"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    disabled={!canScan}
                  />
                  <button className="btn btn-primary" type="submit" disabled={!canScan}>
                    Escanear
                  </button>
                </div>
              </form>

              <p className="scan-helper">
                Códigos válidos: 5 o 6 dígitos numéricos. El sistema espera ENTER del lector o una pausa corta antes de registrar y dirá en voz alta lo escaneado.
              </p>

              {lastScan && (
                <div className="last-scan-card">
                  <div className="last-scan-header">
                    <CheckCircle size={18} className="text-success" />
                    <span>Último escaneo</span>
                  </div>

                  <div
                    className="last-scan-code-display"
                    style={{
                      fontSize: '36px',
                      lineHeight: 1.1,
                      fontWeight: 900,
                      letterSpacing: '2px',
                      padding: '14px 16px',
                      borderRadius: '14px',
                      background: 'var(--surface-soft)',
                      border: '2px solid var(--border)',
                      textAlign: 'center',
                      marginBottom: '14px',
                      wordBreak: 'break-word'
                    }}
                    title="Código leído por el lector"
                  >
                    {lastScan.producto?.sku || 'No reconocido'}
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
                      <span className="meta-label">Acumulado</span>
                      <strong>{lastScan.acumuladoSku || 0}</strong>
                    </div>
                  </div>

                  {lastScan?.producto?.sku && (
                    <div style={{ marginTop: '12px' }}>
                      <button
                        type="button"
                        className="btn btn-outline small"
                        onClick={() => handleEditarProducto({
                          sku: lastScan.producto?.sku,
                          descripcionSnapshot: lastScan.producto?.descripcion,
                          cantidadTotal: lastScan.acumuladoSku || 0,
                          etiquetas: lastScan.producto?.etiquetas || []
                        })}
                      >
                        <Edit2 size={14} /> Etiquetar SKU
                      </button>
                    </div>
                  )}

                  {lastScan?.producto?.etiquetas?.length > 0 && (
                    <div
                      className="alert-warning"
                      style={{
                        marginTop: '12px',
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'flex-start'
                      }}
                    >
                      <AlertTriangle size={16} />
                      <div>
                        <strong>Producto con etiqueta especial</strong>
                        <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap' }}>
                          {lastScan.producto.etiquetas.map((etiqueta) => (
                            <SkuEtiquetaBadge key={etiqueta.id} etiqueta={etiqueta} />
                          ))}
                        </div>
                        {lastScan.producto.etiquetas.some((e) => e.nota) && (
                          <p className="muted" style={{ marginTop: '6px', marginBottom: 0 }}>
                            {lastScan.producto.etiquetas.find((e) => e.nota)?.nota}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
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
                  <div className="pending-header">
                    <AlertTriangle size={16} />
                    <span>SKU pendientes de reconteo</span>
                    <span className="badge">
                      {pendientes.filter(p => !p.recontado).length} / {pendientes.length}
                    </span>
                  </div>
                  {pendientes.length === 0 ? (
                    <div className="escaneo-empty">No hay pendientes</div>
                  ) : (
                    <>
                      <div className="pending-list">
                        {pendientes.slice(0, 10).map((item) => (
                          <div key={`${item.sku}-${item.id}`} className={`pending-item ${item.recontado ? 'recontado' : ''}`}>
                            <div>
                              <strong>{item.sku}</strong>
                              <p className="pending-sku-desc">{item.descripcionSnapshot || 'Sin descripción'}</p>
                            </div>
                            {item.recontado ? (
                              <span className="badge success">Recontado: {item.cantidadRecontada || 0}</span>
                            ) : (
                              <span className="badge warning">Pendiente</span>
                            )}
                          </div>
                        ))}
                        {pendientes.length > 10 && (
                          <div className="pending-more">+{pendientes.length - 10} más</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="card inventario-anterior-card">
            <div className="list-header">
              <div className="section-title-group">
                <h2 className="section-title">
                  <Database size={20} />
                  <span>Inventario base de validación</span>
                  {inventarioPareja && <span className="badge info">{inventarioPareja.nombre}</span>}
                </h2>
                {parejaResumen.length > 0 && (
                  <span className="badge">{parejaResumen.length} registros</span>
                )}
              </div>
              <GitCompareArrows size={16} className="text-muted" />
            </div>

            {loadingPareja ? (
              <div className="loading-container" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="loading-spinner-small" />
                <p className="muted">Cargando inventario base...</p>
              </div>
            ) : parejaError ? (
              <div className="alert-warning">
                <AlertTriangle size={16} />
                <span>{parejaError}</span>
              </div>
            ) : !inventarioPareja ? (
              <div className="empty-state-small">
                <Database size={32} className="text-muted" />
                <p className="muted">Este inventario es base o no tiene inventario base asociado</p>
              </div>
            ) : parejaResumen.length === 0 ? (
              <div className="empty-state-small">
                <p className="muted">No hay registros en el inventario base para esta zona</p>
              </div>
            ) : (
              <>
                <div
                  className="table-responsive-container"
                  style={{ maxHeight: '400px', overflowY: 'auto', overflowX: 'auto' }}
                >
                  <table className="data-table pareja-table">
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--surface)', zIndex: 10 }}>
                      <tr>
                        <th style={{ position: 'sticky', left: 0, backgroundColor: 'var(--surface)', zIndex: 11, minWidth: '100px' }}>SKU</th>
                        <th style={{ minWidth: '200px' }}>Descripción</th>
                        <th style={{ minWidth: '80px' }}>Cantidad</th>
                        <th style={{ minWidth: '100px' }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parejaResumen.map((item, index) => {
                        const coincide = resumen.some(r => r.sku === item.sku);
                        return (
                          <tr key={`${item.sku}-${index}`} className={coincide ? 'row-success' : 'row-warning'}>
                            <td data-label="SKU" style={{ position: 'sticky', left: 0, backgroundColor: 'inherit', zIndex: 5 }}>
                              <strong>{item.sku}</strong>
                            </td>
                            <td data-label="Descripción">{item.descripcionSnapshot || 'Sin descripción'}</td>
                            <td data-label="Cantidad" className="text-center">{item.cantidadTotal || 0}</td>
                            <td data-label="Estado">
                              <span className={`status-badge ${coincide ? 'success' : 'warning'}`}>
                                {coincide ? 'Escaneado' : 'Pendiente'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="pareja-resumen" style={{
                  marginTop: '16px',
                  padding: '12px',
                  backgroundColor: 'var(--surface-soft)',
                  borderRadius: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}>
                  <div className="resumen-item">
                    <span>Total inventario base:</span>
                    <strong>{parejaResumen.length}</strong>
                  </div>
                  <div className="resumen-item">
                    <span>Escaneados:</span>
                    <strong className="text-success">{resumen.filter(r => parejaResumen.some(p => p.sku === r.sku)).length}</strong>
                  </div>
                  <div className="resumen-item">
                    <span>Pendientes:</span>
                    <strong className="text-warning">{parejaResumen.filter(p => !resumen.some(r => r.sku === p.sku)).length}</strong>
                  </div>
                </div>
              </>
            )}
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
                <div className="escaneo-empty">No hay escaneos</div>
              ) : (
                <div className="table-responsive-container">
                  <table className="data-table resumen-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Descripción</th>
                        <th>Cantidad</th>
                        <th>Etiquetas</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumen.slice(0, 15).map((item, index) => (
                        <tr key={`${item.sku || 'sku'}-${index}`}>
                          <td data-label="SKU"><strong>{item.sku}</strong></td>
                          <td data-label="Descripción">{item.descripcionSnapshot || 'Sin descripción'}</td>
                          <td data-label="Cantidad" className="text-center">{item.cantidadTotal}</td>
                          <td data-label="Etiquetas">
                            {item.etiquetas?.length > 0 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                                {item.etiquetas.map((etiqueta) => (
                                  <SkuEtiquetaBadge key={etiqueta.id} etiqueta={etiqueta} />
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted">Sin etiqueta</span>
                            )}
                          </td>

                          <td data-label="Acciones" className="text-center">
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                              <button
                                className="icon-btn"
                                onClick={() => handleEditarProducto(item)}
                                title={isAdmin ? 'Editar cantidad / etiqueta' : 'Etiquetar SKU'}
                                style={{ color: 'var(--primary)' }}
                              >
                                <Edit2 size={16} />
                              </button>

                              {isAdmin && (
                                <button
                                  className="icon-btn danger"
                                  onClick={() => handleEliminarProducto(item.sku)}
                                  title="Eliminar producto"
                                  style={{ color: 'var(--danger)' }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}

                      {resumen.length > 15 && (
                        <tr className="more-items">
                          <td colSpan={5} className="text-center">
                            +{resumen.length - 15} productos más
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card historial-card">
              <div className="list-header">
                <h2 className="section-title"><History size={20} /><span>Historial reciente</span></h2>
              </div>
              {history.length === 0 ? (
                <div className="escaneo-empty">No hay lecturas</div>
              ) : (
                <div className="history-list">
                  {history.slice(0, 15).map((lectura) => (
                    <div key={lectura.id} className={`history-item ${lectura.estado === 'anulada' ? 'anulada' : ''}`}>
                      <div className="history-main">
                        <strong>{lectura.codigoLeido}</strong>
                        <p>{lectura.sku || 'No reconocido'}</p>
                      </div>
                      <div className="history-meta">
                        <span className="tag-muted">{formatOnlyTime(lectura.fechaHora)}</span>
                        <span className={`status-chip mini ${lectura.estado}`}>{lectura.estado === 'valida' ? 'OK' : 'NO'}</span>
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
        <div className="card">
          <p className="muted">Selecciona un inventario con rondas disponibles</p>
        </div>
      )}

      {/* Modal para entrada manual */}
      {showManualModal && (
        <div className="modal-overlay" onClick={() => setShowManualModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><Plus size={18} /> Agregar Producto Manualmente</h3>
              <button className="icon-btn" onClick={() => setShowManualModal(false)}><X size={18} /></button>
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
                <small>Ingresa el código numérico de 5 a 6 dígitos</small>
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
                <p><strong>Resumen:</strong></p>
                <p>• {manualRepeticiones} registro(s) de {manualSku || 'SKU'}</p>
                <p>• {manualCantidad} unidad(es) por registro</p>
                <p className="total-unidades">📦 Total de unidades: <strong>{manualRepeticiones * manualCantidad}</strong></p>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowManualModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleAgregarManual} disabled={loadingManual || !manualSku.trim()}>
                {loadingManual ? 'Agregando...' : `Agregar (${manualRepeticiones} × ${manualCantidad})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de error de lectura */}
      <ModalErrorLectura
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        codigoRechazado={errorInfo.codigoRechazado}
        ultimoCodigoExitoso={errorInfo.ultimoExitoso}
        motivo={errorInfo.motivo}
      />

      {/* Modal de edición de producto / etiquetado de SKU */}
      {showEditModal && editProducto && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Edit2 size={18} /> {isAdmin ? 'Editar producto / etiquetar' : 'Etiquetar SKU'}
              </h3>
              <button className="icon-btn" onClick={() => setShowEditModal(false)}><X size={18} /></button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>SKU</label>
                <input value={editProducto.sku || ''} disabled />
              </div>

              <div className="form-group">
                <label>Descripción</label>
                <input value={editProducto.descripcionSnapshot || editProducto.descripcion || 'Sin descripción'} disabled />
              </div>

              <div className="form-group">
                <label>Cantidad Total</label>
                <input
                  type="number"
                  value={editCantidad}
                  onChange={(e) => setEditCantidad(parseInt(e.target.value) || 0)}
                  min="0"
                  step="1"
                  disabled={!isAdmin}
                />
                <small>
                  {isAdmin
                    ? 'Solo administradores pueden modificar cantidades.'
                    : 'Solo lectura. Tu rol puede agregar etiquetas, pero no cambiar cantidades.'}
                </small>
              </div>

              <div
                style={{
                  marginTop: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--border)'
                }}
              >
                <h4 style={{ marginTop: 0, marginBottom: '12px' }}>Etiqueta visual del SKU</h4>

                {etiquetasProducto.length > 0 && (
                  <div className="form-group">
                    <label>Etiquetas actuales</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                      {etiquetasProducto.map((etiqueta) => (
                        <SkuEtiquetaBadge key={etiqueta.id} etiqueta={etiqueta} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label>Etiqueta</label>
                  <select
                    value="Muchos stickers"
                    onChange={() => {}}
                  >
                    <option value="Muchos stickers">Muchos stickers</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Color</label>
                  <div
                    style={{
                      width: '90px',
                      height: '36px',
                      borderRadius: '10px',
                      backgroundColor: '#dc2626',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '12px'
                    }}
                  >
                    Rojo
                  </div>
                </div>

                <div className="alert-warning" style={{ marginTop: '12px' }}>
                  <AlertTriangle size={16} />
                  <span>La etiqueta es solo visual. No cambia cantidades ni bloquea escaneos.</span>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowEditModal(false)}>Cerrar</button>

              <button className="btn btn-primary" onClick={handleGuardarEtiqueta} disabled={savingEtiqueta}>
                {savingEtiqueta ? 'Guardando etiqueta...' : 'Guardar etiqueta'}
              </button>

              {isAdmin && (
                <button className="btn btn-success" onClick={handleSaveEdit} disabled={loadingEdit}>
                  {loadingEdit ? 'Guardando cantidad...' : 'Guardar cantidad'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de advertencia - SKU no encontrado en inventario anterior */}
      {showSkuWarning && skuWarningInfo && (
        <div className="modal-overlay" onClick={() => setShowSkuWarning(false)}>
          <div className="modal modal-warning" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><AlertTriangle size={20} color="#f59e0b" /><span>Producto no registrado</span></h3>
              <button className="icon-btn" onClick={() => setShowSkuWarning(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p className="warning-text">
                El producto <strong>{skuWarningInfo.sku}</strong> no existe en el inventario anterior.
              </p>
              <p className="warning-text">
                Descripción: {skuWarningInfo.descripcion || 'Sin descripción'}
              </p>
              <div className="alert-info" style={{ marginTop: '16px' }}>
                <AlertTriangle size={16} />
                <span>
                  <strong>Recomendación:</strong> Verifica que el código sea correcto.
                  Si el producto es nuevo, puedes continuar con el escaneo.
                </span>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setShowSkuWarning(false)}>Continuar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de advertencia - Producto en otra zona */}
      {showZoneWarning && zoneWarningInfo && (
        <div className="modal-overlay" onClick={cerrarZoneWarning}>
          <div className="modal modal-warning" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><AlertTriangle size={20} color="#f59e0b" /><span>Producto en otra zona</span></h3>
              <button className="icon-btn" onClick={cerrarZoneWarning}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p className="warning-text">
                {zoneWarningInfo.origen === 'inventario_base' ? (
                  <>
                    El producto <strong>{zoneWarningInfo.sku}</strong> pertenece a la zona{' '}
                    <strong>{zoneWarningInfo.zona?.nombre}</strong> en el inventario base,
                    con <strong>{zoneWarningInfo.cantidadEnOtraZona} unidades</strong>.
                  </>
                ) : (
                  <>
                    El producto <strong>{zoneWarningInfo.sku}</strong> ya fue escaneado en{' '}
                    <strong>{zoneWarningInfo.zona?.nombre}</strong> con{' '}
                    <strong>{zoneWarningInfo.cantidadEnOtraZona} unidades</strong>.
                  </>
                )}
              </p>
              <div className="alert-destino">
                <p className="destino-title">Llevar a:</p>
                <p className="destino-zona"><strong>{zoneWarningInfo.zona?.nombre}</strong></p>
                <p className="destino-grupo">Grupo: <strong>{zoneWarningInfo.grupo?.nombre || 'N/A'}</strong></p>
              </div>
              <p className="warning-text">
                Este código no se sumó todavía a la ronda actual. Si físicamente este producto también está en la zona actual,
                puedes autorizarlo y contarlo aquí. El aviso saldrá solo una vez por este SKU en esta zona.
              </p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={cerrarZoneWarning}>Entendido</button>
              <button className="btn btn-primary" onClick={handleAutorizarCruceZona}>
                Contar aquí de todos modos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
