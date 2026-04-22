import { useEffect, useRef, useState, useCallback } from 'react';
import { 
  ScanLine, 
  Play, 
  Pause, 
  RotateCcw, 
  Trash2, 
  Download, 
  History, 
  CheckCircle, 
  AlertTriangle,
  Zap,
  Clock,
  Boxes
} from 'lucide-react';
import { scanLecturaRonda, anularLectura, getResumenLecturas, getHistorialLecturas } from '../../services/lecturas.service';
import { getRondas, pausarRonda, reanudarRonda, iniciarRonda, getPendientesRonda } from '../../services/rondas.service';
import { getGrupos } from '../../services/grupos.service';
import { getZonas } from '../../services/zonas.service';
import { getInventarios } from '../../services/inventarios.service';

export default function EscaneoPage() {
  const inputRef = useRef(null);
  const audioRef = useRef(null);

  // Estados
  const [inventarios, setInventarios] = useState([]);
  const [zonas, setZonas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [rondas, setRondas] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  
  const [selectedRonda, setSelectedRonda] = useState(null);
  const [selectedGrupo, setSelectedGrupo] = useState('');
  const [selectedZona, setSelectedZona] = useState('');
  const [selectedInventario, setSelectedInventario] = useState('');
  
  const [codigo, setCodigo] = useState('');
  const [lastScan, setLastScan] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [resumen, setResumen] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [rondaActiva, setRondaActiva] = useState(null);

  // Sonidos
  const playBeep = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.log('Audio no soportado'));
    }
  };

  const playError = () => {
    // Sonido de error (opcional)
  };

  // Cargar datos iniciales
  useEffect(() => {
    async function init() {
      try {
        const [inventariosData, zonasData, gruposData] = await Promise.all([
          getInventarios(),
          getZonas(),
          getGrupos()
        ]);
        
        setInventarios(inventariosData);
        setZonas(zonasData);
        setGrupos(gruposData);
        
        if (inventariosData.length > 0) {
          setSelectedInventario(inventariosData[0].id);
        }
        if (zonasData.length > 0) {
          setSelectedZona(zonasData[0].id);
        }
        if (gruposData.length > 0) {
          setSelectedGrupo(gruposData[0].id);
        }
      } catch (err) {
        setError('No se pudieron cargar los datos iniciales');
      } finally {
        setBootLoading(false);
      }
    }
    init();
  }, []);

  // Cargar rondas del inventario
  useEffect(() => {
    async function loadRondas() {
      if (!selectedInventario || !selectedZona) return;
      
      try {
        const data = await getRondas({ inventarioId: selectedInventario, zonaId: selectedZona });
        setRondas(data);
        
        // Buscar ronda activa o pendiente
        const activa = data.find(r => r.estado === 'activa');
        const pendiente = data.find(r => r.estado === 'pendiente');
        const borrador = data.find(r => r.estado === 'borrador');
        
        if (activa) {
          setRondaActiva(activa);
          setSelectedRonda(activa.id);
          await loadPendientes(activa.id);
          await loadResumen(activa.id);
          await loadHistorial(activa.id);
        } else if (pendiente) {
          setRondaActiva(pendiente);
          setSelectedRonda(pendiente.id);
        } else if (borrador) {
          setRondaActiva(borrador);
          setSelectedRonda(borrador.id);
        }
      } catch (err) {
        console.error('Error cargando rondas:', err);
      }
    }
    
    loadRondas();
  }, [selectedInventario, selectedZona]);

  // Cargar pendientes de reconteo
  const loadPendientes = async (rondaId) => {
    try {
      const data = await getPendientesRonda(rondaId);
      setPendientes(data.pendientes || []);
    } catch (err) {
      console.error('Error cargando pendientes:', err);
    }
  };

  // Cargar resumen de escaneos
  const loadResumen = async (rondaId) => {
    try {
      const data = await getResumenLecturas({ rondaId });
      setResumen(data);
    } catch (err) {
      console.error('Error cargando resumen:', err);
    }
  };

  // Cargar historial
  const loadHistorial = async (rondaId) => {
    try {
      const data = await getHistorialLecturas({ rondaId, limit: 50 });
      setHistory(data);
    } catch (err) {
      console.error('Error cargando historial:', err);
    }
  };

  // Iniciar ronda
  const handleIniciarRonda = async () => {
    if (!selectedRonda) return;
    try {
      await iniciarRonda(selectedRonda);
      setRondaActiva({ ...rondaActiva, estado: 'activa' });
      setMessage('Ronda iniciada. ¡Pueden comenzar a escanear!');
      inputRef.current?.focus();
    } catch (err) {
      setError('No se pudo iniciar la ronda');
    }
  };

  // Pausar ronda
  const handlePausarRonda = async () => {
    if (!selectedRonda) return;
    try {
      await pausarRonda(selectedRonda);
      setRondaActiva({ ...rondaActiva, estado: 'pausada' });
      setMessage('Ronda pausada. Escaneo detenido temporalmente.');
    } catch (err) {
      setError('No se pudo pausar la ronda');
    }
  };

  // Reanudar ronda
  const handleReanudarRonda = async () => {
    if (!selectedRonda) return;
    try {
      await reanudarRonda(selectedRonda);
      setRondaActiva({ ...rondaActiva, estado: 'activa' });
      setMessage('Ronda reanudada. Continúen escaneando.');
      inputRef.current?.focus();
    } catch (err) {
      setError('No se pudo reanudar la ronda');
    }
  };

  // Escanear código
  const handleScan = async (e) => {
    e.preventDefault();
    if (!codigo.trim()) return;
    
    // Validación SKU: 5-7 dígitos
    if (codigo.trim().length < 5 || codigo.trim().length > 7) {
      setError('Código inválido. Debe tener entre 5 y 7 dígitos.');
      playError();
      setCodigo('');
      setTimeout(() => inputRef.current?.focus(), 100);
      return;
    }
    
    if (!rondaActiva || rondaActiva.estado !== 'activa') {
      setError('No hay una ronda activa. Inicia o reanuda la ronda primero.');
      playError();
      setCodigo('');
      setTimeout(() => inputRef.current?.focus(), 100);
      return;
    }
    
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      const response = await scanLecturaRonda({
        rondaId: rondaActiva.id,
        grupoId: selectedGrupo,
        codigo: codigo.trim()
      });
      
      playBeep();
      setLastScan(response.data);
      setMessage(response.message);
      
      // Actualizar resumen e historial
      await loadResumen(rondaActiva.id);
      await loadHistorial(rondaActiva.id);
      
      setCodigo('');
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al registrar lectura');
      playError();
      setCodigo('');
      setTimeout(() => inputRef.current?.focus(), 100);
    } finally {
      setLoading(false);
    }
  };

  // Anular última lectura
  const handleAnularLectura = async (lecturaId) => {
    if (!confirm('¿Anular esta lectura? Se restará del conteo.')) return;
    try {
      await anularLectura(lecturaId);
      setMessage('Lectura anulada correctamente');
      await loadResumen(rondaActiva.id);
      await loadHistorial(rondaActiva.id);
    } catch (err) {
      setError('No se pudo anular la lectura');
    }
  };

  if (bootLoading) {
    return <div className="card">Cargando módulo de escaneo...</div>;
  }

  const isReconteo = rondaActiva?.tipoRonda === 'reconteo';
  const totalEscaneos = resumen.reduce((sum, item) => sum + item.cantidadTotal, 0);
  const totalProductos = resumen.length;

  return (
    <div className="escaneo-container">
      <audio ref={audioRef} src="/beep.mp3" preload="auto" />
      
      {/* Selectores */}
      <div className="card selectores-card">
        <div className="selectores-grid">
          <div className="form-group">
            <label>Inventario</label>
            <select value={selectedInventario} onChange={(e) => setSelectedInventario(Number(e.target.value))}>
              {inventarios.map(inv => (
                <option key={inv.id} value={inv.id}>{inv.nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Zona</label>
            <select value={selectedZona} onChange={(e) => setSelectedZona(Number(e.target.value))}>
              {zonas.map(zona => (
                <option key={zona.id} value={zona.id}>{zona.nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Grupo</label>
            <select value={selectedGrupo} onChange={(e) => setSelectedGrupo(Number(e.target.value))}>
              {grupos.filter(g => g.inventarioId === selectedInventario).map(grupo => (
                <option key={grupo.id} value={grupo.id}>{grupo.nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Ronda</label>
            <select value={selectedRonda || ''} onChange={(e) => setSelectedRonda(Number(e.target.value))}>
              <option value="">Seleccionar ronda</option>
              {rondas.map(r => (
                <option key={r.id} value={r.id}>
                  Ronda {r.numeroRonda} - {r.tipoRonda} ({r.estado})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Estado de ronda */}
      {rondaActiva && (
        <div className={`card ronda-status ${rondaActiva.estado}`}>
          <div className="ronda-info">
            <div className="ronda-badge">
              <span className={`status-dot ${rondaActiva.estado}`} />
              <strong>Ronda {rondaActiva.numeroRonda}</strong>
              <span className="ronda-tipo">{rondaActiva.tipoRonda === 'reconteo' ? '🔄 Reconteo' : '📋 Completa'}</span>
            </div>
            {isReconteo && pendientes.length > 0 && (
              <div className="pendientes-badge">
                <AlertTriangle size={14} />
                <span>{pendientes.length} productos pendientes</span>
              </div>
            )}
          </div>
          
          <div className="ronda-actions">
            {rondaActiva.estado === 'borrador' && (
              <button className="btn btn-primary" onClick={handleIniciarRonda}><Play size={16} /> Iniciar</button>
            )}
            {rondaActiva.estado === 'activa' && (
              <button className="btn btn-outline" onClick={handlePausarRonda}><Pause size={16} /> Pausar</button>
            )}
            {rondaActiva.estado === 'pausada' && (
              <button className="btn btn-primary" onClick={handleReanudarRonda}><Play size={16} /> Reanudar</button>
            )}
          </div>
        </div>
      )}

      <div className="escaneo-grid">
        {/* Escáner */}
        <div className="card scanner-card">
          <h2 className="section-title"><ScanLine size={20} /> Escanear producto</h2>
          
          <form onSubmit={handleScan}>
            <div className="scanner-input">
              <input
                ref={inputRef}
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Escanea o escribe el código (5-7 dígitos)"
                autoComplete="off"
                disabled={!rondaActiva || rondaActiva.estado !== 'activa'}
              />
              <button type="submit" disabled={loading || !rondaActiva || rondaActiva.estado !== 'activa'}>
                {loading ? '...' : 'Escanear'}
              </button>
            </div>
          </form>

          {message && <div className="alert-success">{message}</div>}
          {error && <div className="alert-error">{error}</div>}

          {lastScan && (
            <div className="last-scan">
              <div className="last-scan-header">
                <CheckCircle size={18} className="text-success" />
                <span>Último escaneo</span>
              </div>
              <div className="last-scan-content">
                <div>
                  <strong>{lastScan.producto?.sku || 'No reconocido'}</strong>
                  <p>{lastScan.producto?.descripcion || 'Producto no encontrado en catálogo'}</p>
                </div>
                <div className="acumulado">
                  <Zap size={16} />
                  <span>Acumulado: <strong>{lastScan.acumuladoSku}</strong></span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Contador rápido */}
        <div className="card counter-card">
          <h2 className="section-title"><Boxes size={20} /> Conteo actual</h2>
          <div className="counters">
            <div className="counter-item">
              <span className="counter-label">Total escaneos</span>
              <span className="counter-value">{totalEscaneos}</span>
            </div>
            <div className="counter-item">
              <span className="counter-label">Productos distintos</span>
              <span className="counter-value">{totalProductos}</span>
            </div>
            {isReconteo && (
              <div className="counter-item">
                <span className="counter-label">Pendientes</span>
                <span className="counter-value pending">{pendientes.length}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Resumen por SKU */}
      <div className="card resumen-card">
        <h2 className="section-title"><History size={20} /> Resumen por producto</h2>
        <div className="resumen-grid">
          {resumen.length === 0 ? (
            <p className="muted">Aún no hay escaneos registrados.</p>
          ) : (
            resumen.map(item => (
              <div key={item.sku} className="resumen-item">
                <div className="resumen-sku">
                  <strong>{item.sku}</strong>
                  <p>{item.descripcionSnapshot || 'Sin descripción'}</p>
                </div>
                <span className="resumen-cantidad">{item.cantidadTotal}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Historial de escaneos */}
      <div className="card historial-card">
        <h2 className="section-title"><Clock size={20} /> Historial reciente</h2>
        <div className="historial-list">
          {history.length === 0 ? (
            <p className="muted">No hay escaneos recientes.</p>
          ) : (
            history.slice(0, 20).map(lectura => (
              <div key={lectura.id} className={`historial-item ${lectura.estado === 'anulada' ? 'anulada' : ''}`}>
                <div className="historial-info">
                  <span className="historial-codigo">{lectura.codigoLeido}</span>
                  <span className="historial-sku">{lectura.sku || 'No reconocido'}</span>
                  <span className="historial-fecha">{new Date(lectura.fechaHora).toLocaleTimeString()}</span>
                </div>
                <div className="historial-actions">
                  {lectura.estado !== 'anulada' && (
                    <button className="icon-btn danger" onClick={() => handleAnularLectura(lectura.id)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}