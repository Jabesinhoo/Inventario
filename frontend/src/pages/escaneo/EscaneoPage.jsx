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
import { getParejaInventario } from '../../services/diferencias.service';
import api from '../../services/api';
import {
  savePendingScan,
  getPendingStats,
  syncAllPendingScans,
  isOnline as checkOnline
} from '../../services/offlineStorage';
import ModalErrorLectura from '../../pages/escaneo/ModalErrorLectura';
import { useRobustScanner } from '../../hooks/useRobustScanner';
import alertaSound from '../../sound/alerta.mp3';

export default function EscaneoPage() {
  const [searchParams] = useSearchParams();

  const inventarioIdFromUrl = Number(searchParams.get('inventarioId') || 0);
  const rondaIdFromUrl = Number(searchParams.get('rondaId') || 0);

  const inputRef = useRef(null);
  const audioRef = useRef(null);
  const errorAudioRef = useRef(null);

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Modal entrada manual
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualSku, setManualSku] = useState('');
  const [manualCantidad, setManualCantidad] = useState(1);
  const [manualRepeticiones, setManualRepeticiones] = useState(1);
  const [loadingManual, setLoadingManual] = useState(false);

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

  // Cargar inventario pareja y su resumen
  const loadInventarioPareja = useCallback(async (inventarioId, zonaId) => {
    if (!inventarioId) {
      setInventarioPareja(null);
      setParejaResumen([]);
      return;
    }

    setLoadingPareja(true);
    setParejaError(null);

    try {
      const pareja = await getParejaInventario(inventarioId);

      if (pareja && pareja.inventarioParejaId) {
        setInventarioPareja(pareja);

        const resumenData = await getResumenLecturas({
          inventarioId: pareja.inventarioParejaId,
          zonaId: zonaId || null
        });

        setParejaResumen(resumenData || []);
      } else {
        setInventarioPareja(null);
        setParejaResumen([]);
      }
    } catch (error) {
      console.error('Error cargando inventario pareja:', error);
      setParejaError('No se pudo cargar el inventario anterior');
      setInventarioPareja(null);
      setParejaResumen([]);
    } finally {
      setLoadingPareja(false);
    }
  }, []);

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

        pendientesRows = pendientesRows.map(p => ({
          ...p,
          recontado: resumenRows.some(r => r.sku === p.sku && r.cantidadTotal > 0)
        }));
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

  // Handler para escaneos exitosos
  // Reemplaza el handleValidScan actual con esto (VERSIÓN SIMPLIFICADA PARA PRUEBAS)
  const handleValidScan = useCallback(async (codigoLimpio) => {
    console.log('🔍 Escaneando código:', codigoLimpio);

    if (!selectedRonda?.id) {
      console.error('No hay ronda seleccionada');
      throw new Error('ronda_inactiva');
    }

    if (selectedRonda.estado !== 'activa') {
      console.error('Ronda no activa:', selectedRonda.estado);
      throw new Error('ronda_inactiva');
    }

    if (!grupoAsignado?.id) {
      console.error('No hay grupo asignado');
      throw new Error('ronda_inactiva');
    }

    // PRUEBA: Simular escaneo exitoso sin llamar al backend
    // Comenta esto cuando quieras probar con el backend real
    playBeep();
    setLastScan({
      producto: {
        sku: codigoLimpio,
        descripcion: 'Producto de prueba'
      },
      acumuladoSku: 1
    });
    setFlashMessage(`Escaneo exitoso: ${codigoLimpio}`, 'success');

    // Simular actualización del resumen
    const nuevoResumen = [...resumen];
    const existente = nuevoResumen.find(r => r.sku === codigoLimpio);
    if (existente) {
      existente.cantidadTotal = (existente.cantidadTotal || 0) + 1;
    } else {
      nuevoResumen.push({
        sku: codigoLimpio,
        descripcionSnapshot: 'Producto de prueba',
        cantidadTotal: 1
      });
    }
    setResumen(nuevoResumen);

    return { success: true };

    /* CÓDIGO ORIGINAL - Descomenta cuando funcione la prueba
    if (checkOnline()) {
      const raw = await scanLecturaRonda({
        rondaId: selectedRonda.id,
        grupoId: grupoAsignado.id,
        codigo: codigoLimpio
      });
      // ... resto del código original
    }
    */
  }, [selectedRonda, grupoAsignado, playBeep, resumen]);

  // Handler para escaneos inválidos
  const handleInvalidScan = useCallback((codigo, motivo, ultimoExitoso) => {
    playErrorBeep();

    setErrorInfo({
      codigoRechazado: codigo,
      ultimoExitoso: ultimoExitoso || lastScan?.producto?.sku || null,
      motivo: motivo
    });
    setShowErrorModal(true);
    setCodigo('');
  }, [lastScan]);

  // Hook de escaneo robusto
  const { addCode, processing: scannerProcessing, resetScanner } = useRobustScanner({
    onValidScan: handleValidScan,
    onInvalidScan: handleInvalidScan,
    minDelay: 150,
    maxQueueSize: 10,
    debounceTime: 50
  });

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
    resetScanner();
  }, [selectedRondaId, resetScanner]);

  useEffect(() => {
    if (!bootLoading && canScan) {
      inputRef.current?.focus();
    }
  }, [bootLoading, canScan, scannerProcessing]);

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
      const response = await agregarLecturaManual({
        rondaId: selectedRonda.id,
        grupoId: grupoAsignado.id,
        sku: skuLimpio,
        cantidad: manualCantidad * manualRepeticiones
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
        setShowZoneWarning(true);
        setZoneWarningInfo(errorData.data);
        setFlashMessage(errorData.message, 'error');
      } else {
        setFlashMessage(err.response?.data?.message || 'Error al agregar producto manualmente', 'error');
      }
    } finally {
      setLoadingManual(false);
    }
  };
    const procesarEscaneoDirecto = useCallback(async (codigo) => {
    console.log('=== INICIANDO ESCANEO ===');
    console.log('Código a enviar:', codigo);
    console.log('Tipo de código:', typeof codigo);
    console.log('Longitud:', codigo.length);
    console.log('Ronda ID:', selectedRonda?.id);
    console.log('Grupo ID:', grupoAsignado?.id);

    if (!selectedRonda?.id || selectedRonda.estado !== 'activa' || !grupoAsignado?.id) {
      console.log('Validación fallida:', {
        tieneRonda: !!selectedRonda?.id,
        rondaActiva: selectedRonda?.estado === 'activa',
        tieneGrupo: !!grupoAsignado?.id
      });
      playErrorBeep();
      setErrorInfo({
        codigoRechazado: codigo,
        ultimoExitoso: lastScan?.producto?.sku || null,
        motivo: 'ronda_inactiva'
      });
      setShowErrorModal(true);
      return;
    }

    // Mostrar el payload que se va a enviar
    const payload = {
      rondaId: selectedRonda.id,
      grupoId: grupoAsignado.id,
      codigo: codigo
    };
    console.log('Payload a enviar:', payload);

    try {
      const raw = await scanLecturaRonda(payload);
      console.log('Respuesta exitosa:', raw);

      playBeep();
      setLastScan(raw?.data || raw);
      setFlashMessage('Escaneo exitoso', 'success');
      await loadRoundContext(selectedRonda);
    } catch (err) {
      console.error('=== ERROR DETALLADO ===');
      console.error('Status:', err.response?.status);
      console.error('Mensaje:', err.response?.data?.message);
      console.error('Data completa:', err.response?.data);
      console.error('Config:', err.config);

      playErrorBeep();

      // Mostrar el mensaje específico del backend
      const mensajeError = err.response?.data?.message || err.response?.data?.error || 'Error en el servidor';

      setErrorInfo({
        codigoRechazado: codigo,
        ultimoExitoso: lastScan?.producto?.sku || null,
        motivo: mensajeError
      });
      setShowErrorModal(true);
      setFlashMessage(mensajeError, 'error');
    }
  }, [selectedRonda, grupoAsignado, lastScan, loadRoundContext]);
  const handleCodigoChange = useCallback((e) => {
    const value = e.target.value;
    const numeros = value.replace(/[^0-9]/g, '').slice(0, 6); // Limita a 6 dígitos

    setCodigo(numeros);

    // Cambia esto de vuelta a 5 o 6 dígitos
    if (numeros.length === 5 || numeros.length === 6) {
      console.log('✅ Código completo detectado:', numeros);
      procesarEscaneoDirecto(numeros);
      setCodigo('');
    }
  }, [procesarEscaneoDirecto]);

  // Función directa para probar


  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (codigo.length === 5 || codigo.length === 6) {
      addCode(codigo);
      setCodigo('');
    }
  }, [codigo, addCode]);

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

  const handleEditarProducto = (item) => {
    setFlashMessage(`Funcionalidad en desarrollo para editar ${item.sku}`, 'info');
  };

  const handleEliminarProducto = async (sku) => {
    if (!window.confirm(`¿Eliminar todas las lecturas del producto ${sku}?`)) return;
    setFlashMessage(`Funcionalidad en desarrollo para eliminar ${sku}`, 'info');
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
                <h3 className="kpi-value">{isReconteo ? pendientes.length : 0}</h3>
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
                  <button className="btn btn-outline" onClick={handleExportGrupo} disabled={!grupoAsignado?.id || exporting}>
                    <Download size={16} /><span>{exporting ? 'Exportando...' : 'Exportar'}</span>
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit}>
                <div className={`scanner-input-row ${scannerProcessing ? 'processing' : ''}`}>
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
                    disabled={!canScan || scannerProcessing}
                  />
                  <button className="btn btn-primary" type="submit" disabled={!canScan || scannerProcessing}>
                    {scannerProcessing ? '...' : 'Escanear'}
                  </button>
                </div>
              </form>

              <p className="scan-helper">
                Códigos válidos: 5 o 6 dígitos numéricos
                {scannerProcessing && <span className="processing-indicator"> Procesando...</span>}
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
                              <span className="badge success">Recontado</span>
                            ) : (
                              <span className="badge warning">Pendiente</span>
                            )}
                          </div>
                        ))}
                        {pendientes.length > 10 && (
                          <div className="pending-more">+{pendientes.length - 10} más</div>
                        )}
                      </div>
                      <p className="scan-helper info">
                        Puedes escanear cualquier producto, no solo los pendientes.
                        Los productos fuera de la lista se registrarán igual.
                      </p>
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
                  <span>Inventario anterior</span>
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
                <p className="muted">Cargando inventario anterior...</p>
              </div>
            ) : parejaError ? (
              <div className="alert-warning">
                <AlertTriangle size={16} />
                <span>{parejaError}</span>
              </div>
            ) : !inventarioPareja ? (
              <div className="empty-state-small">
                <Database size={32} className="text-muted" />
                <p className="muted">No hay inventario anterior asociado a este inventario</p>
              </div>
            ) : parejaResumen.length === 0 ? (
              <div className="empty-state-small">
                <p className="muted">No hay registros en el inventario anterior para esta zona</p>
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
                    <span>Total inventario anterior:</span>
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
                <h2 className="section-title"><Boxes size={20} /><span>Resumen por producto</span></h2>
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
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumen.slice(0, 15).map((item, index) => (
                        <tr key={`${item.sku || 'sku'}-${index}`}>
                          <td data-label="SKU"><strong>{item.sku}</strong></td>
                          <td data-label="Descripción">{item.descripcionSnapshot || 'Sin descripción'}</td>
                          <td data-label="Cantidad" className="text-center">{item.cantidadTotal}</td>
                          <td data-label="Acciones" className="text-center">
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                              <button
                                className="icon-btn"
                                onClick={() => handleEditarProducto(item)}
                                title="Editar cantidad"
                                style={{ color: 'var(--primary)' }}
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                className="icon-btn danger"
                                onClick={() => handleEliminarProducto(item.sku)}
                                title="Eliminar producto"
                                style={{ color: 'var(--danger)' }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {resumen.length > 15 && (
                        <tr className="more-items">
                          <td colSpan="4" className="text-center">+{resumen.length - 15} productos más</td>
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

      <ModalErrorLectura
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        codigoRechazado={errorInfo.codigoRechazado}
        ultimoCodigoExitoso={errorInfo.ultimoExitoso}
        motivo={errorInfo.motivo}
      />

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