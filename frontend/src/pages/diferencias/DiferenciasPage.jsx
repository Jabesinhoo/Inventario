import { useEffect, useMemo, useState } from 'react';
import {
  GitCompareArrows,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Layers3,
  Users,
  Repeat
} from 'lucide-react';
import { getInventarios } from '../../services/inventarios.service';
import { getGrupos } from '../../services/grupos.service';
import {
  compareInventarios,
  generarRondaReconteoDesdeComparacion
} from '../../services/diferencias.service';

export default function DiferenciasPage() {
  const [inventarios, setInventarios] = useState([]);

  const [inventarioBaseId, setInventarioBaseId] = useState('');
  const [inventarioComparadoId, setInventarioComparadoId] = useState('');

  const [gruposBase, setGruposBase] = useState([]);
  const [gruposComparado, setGruposComparado] = useState([]);

  const [grupoBaseId, setGrupoBaseId] = useState('');
  const [grupoComparadoId, setGrupoComparadoId] = useState('');

  const [resultado, setResultado] = useState(null);

  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadInventariosData() {
    try {
      const data = await getInventarios();
      setInventarios(data);

      if (data.length >= 2) {
        setInventarioComparadoId(data[0].id);
        setInventarioBaseId(data[1].id);
      } else if (data.length === 1) {
        setInventarioBaseId(data[0].id);
        setInventarioComparadoId(data[0].id);
      }
    } catch (err) {
      setError('No se pudieron cargar los inventarios');
    } finally {
      setLoading(false);
    }
  }

  async function loadGruposBase(id) {
    if (!id) {
      setGruposBase([]);
      setGrupoBaseId('');
      return;
    }

    try {
      const data = await getGrupos(id);
      setGruposBase(data || []);

      if (data?.length > 0) {
        setGrupoBaseId((prev) => {
          const existe = data.some((g) => g.id === Number(prev));
          return existe ? prev : data[0].id;
        });
      } else {
        setGrupoBaseId('');
      }
    } catch (err) {
      setError('No se pudieron cargar los grupos del inventario base');
      setGruposBase([]);
      setGrupoBaseId('');
    }
  }

  async function loadGruposComparado(id) {
    if (!id) {
      setGruposComparado([]);
      setGrupoComparadoId('');
      return;
    }

    try {
      const data = await getGrupos(id);
      setGruposComparado(data || []);

      if (data?.length > 0) {
        setGrupoComparadoId((prev) => {
          const existe = data.some((g) => g.id === Number(prev));
          return existe ? prev : data[0].id;
        });
      } else {
        setGrupoComparadoId('');
      }
    } catch (err) {
      setError('No se pudieron cargar los grupos del inventario comparado');
      setGruposComparado([]);
      setGrupoComparadoId('');
    }
  }

  useEffect(() => {
    loadInventariosData();
  }, []);

  useEffect(() => {
    if (inventarioBaseId) {
      loadGruposBase(inventarioBaseId);
    }
  }, [inventarioBaseId]);

  useEffect(() => {
    if (inventarioComparadoId) {
      loadGruposComparado(inventarioComparadoId);
    }
  }, [inventarioComparadoId]);

  const grupoBase = useMemo(
    () => gruposBase.find((g) => g.id === Number(grupoBaseId)) || null,
    [gruposBase, grupoBaseId]
  );

  const grupoComparado = useMemo(
    () => gruposComparado.find((g) => g.id === Number(grupoComparadoId)) || null,
    [gruposComparado, grupoComparadoId]
  );

  const zonaBase = grupoBase?.zonaAsignada || null;
  const zonaComparada = grupoComparado?.zonaAsignada || null;

  const mismaZona =
    Boolean(zonaBase?.id) &&
    Boolean(zonaComparada?.id) &&
    Number(zonaBase.id) === Number(zonaComparada.id);

  const canCompare =
    Boolean(inventarioBaseId) &&
    Boolean(inventarioComparadoId) &&
    Boolean(grupoBaseId) &&
    Boolean(grupoComparadoId) &&
    Number(inventarioBaseId) !== Number(inventarioComparadoId) &&
    mismaZona;

  async function handleComparar() {
    if (!canCompare) return;

    setComparing(true);
    setError('');
    setMessage('');
    setResultado(null);

    try {
      const data = await compareInventarios({
        inventarioBaseId: Number(inventarioBaseId),
        inventarioComparadoId: Number(inventarioComparadoId),
        grupoBaseId: Number(grupoBaseId),
        grupoComparadoId: Number(grupoComparadoId)
      });

      setResultado(data);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo realizar la comparación');
    } finally {
      setComparing(false);
    }
  }

  async function handleGenerarReconteo() {
    if (!resultado || !resultado.diferencias?.length) return;

    setGenerating(true);
    setError('');
    setMessage('');

    try {
      const response = await generarRondaReconteoDesdeComparacion({
        inventarioBaseId: Number(inventarioBaseId),
        inventarioComparadoId: Number(inventarioComparadoId),
        grupoBaseId: Number(grupoBaseId),
        grupoComparadoId: Number(grupoComparadoId)
      });

      setMessage(
        `${response.message}. Ronda #${response.data?.ronda?.numeroRonda || ''} generada para ${response.data?.totalDiscrepancias || 0} SKU.`
      );
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo generar la ronda de reconteo');
    } finally {
      setGenerating(false);
    }
  }

  const totalDiferencias = resultado?.resumen?.totalDiferencias || 0;
  const totalDiferenciaUnidades = resultado?.resumen?.totalDiferenciaUnidades || 0;
  const totalItemsComparados = resultado?.resumen?.totalItemsComparados || 0;

  if (loading) {
    return <div className="card">Cargando diferencias...</div>;
  }

  return (
    <div className="dashboard-container">
      <div className="card filters-card">
        <div className="filters-form">
          <div className="form-group">
            <label>Inventario base</label>
            <select
              value={inventarioBaseId}
              onChange={(e) => setInventarioBaseId(Number(e.target.value))}
            >
              {inventarios.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.nombre} - {inv.fecha}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Grupo base</label>
            <select
              value={grupoBaseId}
              onChange={(e) => setGrupoBaseId(Number(e.target.value))}
              disabled={gruposBase.length === 0}
            >
              {gruposBase.map((grupo) => (
                <option key={grupo.id} value={grupo.id}>
                  {grupo.nombre}
                </option>
              ))}
            </select>
            {zonaBase ? (
              <small className="text-muted">
                Zona: {zonaBase.nombre} ({zonaBase.codigo})
              </small>
            ) : null}
          </div>

          <div className="form-group">
            <label>Inventario comparado</label>
            <select
              value={inventarioComparadoId}
              onChange={(e) => setInventarioComparadoId(Number(e.target.value))}
            >
              {inventarios.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.nombre} - {inv.fecha}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Grupo comparado</label>
            <select
              value={grupoComparadoId}
              onChange={(e) => setGrupoComparadoId(Number(e.target.value))}
              disabled={gruposComparado.length === 0}
            >
              {gruposComparado.map((grupo) => (
                <option key={grupo.id} value={grupo.id}>
                  {grupo.nombre}
                </option>
              ))}
            </select>
            {zonaComparada ? (
              <small className="text-muted">
                Zona: {zonaComparada.nombre} ({zonaComparada.codigo})
              </small>
            ) : null}
          </div>

          <button
            className="btn btn-primary"
            onClick={handleComparar}
            disabled={!canCompare || comparing}
          >
            <GitCompareArrows size={16} />
            <span>{comparing ? 'Comparando...' : 'Comparar'}</span>
          </button>
        </div>

        {inventarioBaseId && inventarioComparadoId && Number(inventarioBaseId) === Number(inventarioComparadoId) ? (
          <div className="alert-warning" style={{ marginTop: '12px' }}>
            <AlertTriangle size={16} />
            <span>Debes seleccionar dos inventarios distintos.</span>
          </div>
        ) : null}

        {grupoBaseId && grupoComparadoId && !mismaZona ? (
          <div className="alert-warning" style={{ marginTop: '12px' }}>
            <AlertTriangle size={16} />
            <span>Los grupos seleccionados no pertenecen a la misma zona.</span>
          </div>
        ) : null}
      </div>

      {message ? <div className="alert-success">{message}</div> : null}
      {error ? <div className="alert-error">{error}</div> : null}

      {resultado ? (
        <>
          <div className="kpi-grid">
            <div className="card kpi-card">
              <div className="kpi-icon">
                <AlertTriangle size={24} />
              </div>
              <div className="kpi-content">
                <p className="kpi-title">SKU con diferencia</p>
                <h3 className="kpi-value">{totalDiferencias}</h3>
              </div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-icon">
                <Layers3 size={24} />
              </div>
              <div className="kpi-content">
                <p className="kpi-title">Items comparados</p>
                <h3 className="kpi-value">{totalItemsComparados}</h3>
              </div>
            </div>

            <div className="card kpi-card">
              <div className="kpi-icon">
                <Users size={24} />
              </div>
              <div className="kpi-content">
                <p className="kpi-title">Diferencia total</p>
                <h3 className="kpi-value">{totalDiferenciaUnidades}</h3>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="list-header">
              <h2 className="section-title">
                <GitCompareArrows size={20} />
                <span>Resumen de comparación</span>
              </h2>

              {resultado.diferencias?.length > 0 ? (
                <button
                  className="btn btn-primary"
                  onClick={handleGenerarReconteo}
                  disabled={generating}
                >
                  <Repeat size={16} />
                  <span>{generating ? 'Generando...' : 'Generar ronda de reconteo'}</span>
                </button>
              ) : null}
            </div>

            <div className="table-list">
              <div className="list-row">
                <div>
                  <strong>Zona</strong>
                  <p className="muted">
                    {resultado.zona?.nombre} ({resultado.zona?.codigo})
                  </p>
                </div>
              </div>

              <div className="list-row">
                <div>
                  <strong>Base</strong>
                  <p className="muted">
                    Grupo: {resultado.grupoBase?.nombre || 'Sin grupo'} | Fuente:{' '}
                    {resultado.fuenteBase === 'conteo_inicial' ? 'Conteo inicial' : 'Lecturas válidas'}
                  </p>
                </div>
              </div>

              <div className="list-row">
                <div>
                  <strong>Comparado</strong>
                  <p className="muted">
                    Grupo: {resultado.grupoComparado?.nombre || 'Sin grupo'} | Fuente:{' '}
                    {resultado.fuenteComparada === 'conteo_inicial' ? 'Conteo inicial' : 'Lecturas válidas'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="list-header">
              <h2 className="section-title">
                <AlertTriangle size={20} />
                <span>Diferencias encontradas</span>
              </h2>

              <button className="btn btn-outline" onClick={handleComparar} disabled={comparing}>
                <RefreshCw size={16} />
                <span>Actualizar</span>
              </button>
            </div>

            {resultado.diferencias?.length === 0 ? (
              <div className="alert-success">
                <CheckCircle size={18} />
                <span>No hay diferencias. Los dos inventarios coinciden para esta zona.</span>
              </div>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Zona</th>
                      <th>SKU</th>
                      <th>Descripción</th>
                      <th>Base</th>
                      <th>Comparado</th>
                      <th>Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.diferencias.map((item) => (
                      <tr key={`${item.zonaId}-${item.sku}`} className="row-warning">
                        <td>{item.zona}</td>
                        <td>
                          <strong>{item.sku}</strong>
                        </td>
                        <td>{item.descripcion || 'Sin descripción'}</td>
                        <td>{item.cantidadBase}</td>
                        <td>{item.cantidadComparada}</td>
                        <td className="text-danger">+{item.diferencia}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="card">
          <p className="muted">
            Selecciona inventario base, inventario comparado y los grupos de la misma zona para iniciar la comparación.
          </p>
        </div>
      )}
    </div>
  );
}