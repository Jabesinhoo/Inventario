import { useEffect, useMemo, useRef, useState } from 'react';
import { scanLectura } from '../../services/lecturas.service';
import { getInventarios } from '../../services/inventarios.service';
import { getZonas } from '../../services/zonas.service';
import { getGrupos } from '../../services/grupos.service';

export default function EscaneoPage() {
  const inputRef = useRef(null);

  const [inventarios, setInventarios] = useState([]);
  const [zonas, setZonas] = useState([]);
  const [grupos, setGrupos] = useState([]);

  const [form, setForm] = useState({
    inventarioId: '',
    conteoTipo: 1,
    zonaId: '',
    grupoId: '',
    codigo: ''
  });

  const [lastScan, setLastScan] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const [inventariosData, zonasData] = await Promise.all([
          getInventarios(),
          getZonas()
        ]);

        setInventarios(inventariosData);
        setZonas(zonasData);

        const inventarioId = inventariosData[0]?.id || '';
        const zonaId = zonasData[0]?.id || '';

        let gruposData = [];
        if (inventarioId) {
          gruposData = await getGrupos(inventarioId);
        }

        setGrupos(gruposData);

        setForm((prev) => ({
          ...prev,
          inventarioId,
          zonaId,
          grupoId: gruposData[0]?.id || ''
        }));
      } catch {
        setError('No se pudieron cargar los datos base de escaneo');
      } finally {
        setBootLoading(false);
      }
    }

    init();
  }, []);

  useEffect(() => {
    async function reloadGrupos() {
      if (!form.inventarioId) {
        setGrupos([]);
        return;
      }

      try {
        const data = await getGrupos(form.inventarioId);
        setGrupos(data);
        setForm((prev) => ({
          ...prev,
          grupoId: data[0]?.id || ''
        }));
      } catch {
        setError('No se pudieron cargar los grupos');
      }
    }

    reloadGrupos();
  }, [form.inventarioId]);

  const selectedInventario = useMemo(
    () => inventarios.find((item) => item.id === Number(form.inventarioId)),
    [inventarios, form.inventarioId]
  );

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: name === 'codigo' ? value : Number(value)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.codigo.trim()) return;

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const payload = await scanLectura({
        inventarioId: Number(form.inventarioId),
        conteoTipo: Number(form.conteoTipo),
        zonaId: Number(form.zonaId),
        grupoId: Number(form.grupoId),
        codigo: form.codigo.trim()
      });

      setLastScan(payload.data || null);
      setMessage(payload.message || 'Lectura registrada');

      setHistory((prev) => [
        {
          id: Date.now(),
          codigo: form.codigo.trim(),
          producto: payload.data?.producto?.descripcion || 'No reconocido',
          acumuladoSku: payload.data?.acumuladoSku ?? '-'
        },
        ...prev
      ].slice(0, 20));

      setForm((prev) => ({
        ...prev,
        codigo: ''
      }));

      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al registrar lectura');
      setTimeout(() => inputRef.current?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  if (bootLoading) {
    return <div className="card">Cargando módulo de escaneo...</div>;
  }

  return (
    <div className="grid-2">
      <div className="card">
        <h2>Escaneo</h2>

        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div className="form-group">
              <label>Inventario</label>
              <select
                name="inventarioId"
                value={form.inventarioId}
                onChange={handleChange}
              >
                {inventarios.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre} - {item.fecha}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Conteo</label>
              <select
                name="conteoTipo"
                value={form.conteoTipo}
                onChange={handleChange}
              >
                <option value={1}>Conteo 1</option>
                <option value={2}>Conteo 2</option>
                <option value={3}>Conteo 3</option>
              </select>
            </div>

            <div className="form-group">
              <label>Zona</label>
              <select name="zonaId" value={form.zonaId} onChange={handleChange}>
                {zonas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre} ({item.codigo})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Grupo</label>
              <select
                name="grupoId"
                value={form.grupoId}
                onChange={handleChange}
              >
                {grupos.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Código</label>
            <input
              ref={inputRef}
              type="text"
              name="codigo"
              value={form.codigo}
              onChange={handleChange}
              placeholder="Escanea aquí"
              autoComplete="off"
            />
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Registrando...' : 'Registrar lectura'}
          </button>
        </form>

        {selectedInventario ? (
          <p className="muted">
            Inventario activo: {selectedInventario.nombre}
          </p>
        ) : null}

        {message ? <div className="alert-success">{message}</div> : null}
        {error ? <div className="alert-error">{error}</div> : null}

        {lastScan ? (
          <div className="scan-result">
            <h3>Última lectura</h3>
            <p><strong>SKU:</strong> {lastScan.producto?.sku}</p>
            <p><strong>Descripción:</strong> {lastScan.producto?.descripcion}</p>
            <p><strong>Acumulado SKU:</strong> {lastScan.acumuladoSku}</p>
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2>Historial reciente</h2>

        <div className="history-list">
          {history.length === 0 ? (
            <p className="muted">Todavía no hay lecturas en esta sesión.</p>
          ) : (
            history.map((item) => (
              <div key={item.id} className="history-item">
                <div>
                  <strong>{item.codigo}</strong>
                  <p>{item.producto}</p>
                </div>
                <span className="badge-role">Acum: {item.acumuladoSku}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}