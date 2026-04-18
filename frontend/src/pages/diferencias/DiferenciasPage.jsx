import { useEffect, useState } from 'react';
import { GitCompareArrows, AlertTriangle, CheckCircle, Download, Edit3, Save, X } from 'lucide-react';
import { getInventarios } from '../../services/inventarios.service';
import { getGrupos } from '../../services/grupos.service';
import { getConteo1VsConteo2, getInicialVsConteo1, updateDiscrepanciaManual } from '../../services/diferencias.service';

export default function DiferenciasPage() {
  const [inventarios, setInventarios] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [inventarioId, setInventarioId] = useState('');
  const [grupoId, setGrupoId] = useState('');
  const [modo, setModo] = useState('conteo1-vs-conteo2');
  const [discrepancias, setDiscrepancias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState('');

  async function loadData() {
    try {
      const [inventariosData, gruposData] = await Promise.all([
        getInventarios(),
        getGrupos()
      ]);
      setInventarios(inventariosData);
      setGrupos(gruposData);
      
      if (inventariosData.length > 0 && !inventarioId) {
        setInventarioId(inventariosData[0].id);
      }
      if (gruposData.length > 0 && !grupoId) {
        setGrupoId(gruposData[0].id);
      }
    } catch (err) {
      setError('No se pudieron cargar los datos');
    }
  }

  async function loadDiscrepancias() {
    if (!inventarioId || !grupoId) return;
    
    setLoading(true);
    try {
      const data = modo === 'inicial-vs-conteo1'
        ? await getInicialVsConteo1(inventarioId, grupoId)
        : await getConteo1VsConteo2(inventarioId, grupoId);
      
      // Filtrar solo discrepancias (diferencia > 0)
      const soloDiscrepancias = data.filter(item => item.diferencia > 0);
      setDiscrepancias(soloDiscrepancias);
    } catch (err) {
      setError('No se pudieron cargar las diferencias');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (inventarioId && grupoId) {
      loadDiscrepancias();
    }
  }, [inventarioId, grupoId, modo]);

  const handleEdit = (item) => {
    const valorActual = modo === 'inicial-vs-conteo1' ? item.conteo1 : item.conteo2;
    setEditing(item.sku);
    setEditValue(valorActual);
  };

  const handleSave = async (item) => {
    try {
      await updateDiscrepanciaManual({
        inventarioId,
        zonaId: item.zonaId,
        sku: item.sku,
        cantidadFinal: parseInt(editValue),
        observacion: 'Ajuste manual desde panel de diferencias'
      });
      setEditing(null);
      await loadDiscrepancias();
    } catch (err) {
      setError('Error al guardar el ajuste');
    }
  };

  const totalDiferencias = discrepancias.reduce((sum, item) => sum + item.diferencia, 0);
  const zonasConDiferencias = new Set(discrepancias.map(d => d.zona)).size;
  const productosConDiferencias = discrepancias.length;

  if (loading) return <div className="card">Cargando diferencias...</div>;

  return (
    <div className="dashboard-container">
      {/* Filtros */}
      <div className="card filters-card">
        <div className="filters-form">
          <div className="form-group">
            <label>Inventario</label>
            <select value={inventarioId} onChange={(e) => setInventarioId(Number(e.target.value))}>
              {inventarios.map(inv => (
                <option key={inv.id} value={inv.id}>{inv.nombre} - {inv.fecha}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Grupo</label>
            <select value={grupoId} onChange={(e) => setGrupoId(Number(e.target.value))}>
              {grupos.filter(g => g.inventarioId === inventarioId).map(grupo => (
                <option key={grupo.id} value={grupo.id}>{grupo.nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Comparación</label>
            <select value={modo} onChange={(e) => setModo(e.target.value)}>
              <option value="conteo1-vs-conteo2">Conteo 1 vs Conteo 2</option>
              <option value="inicial-vs-conteo1">Inicial vs Conteo 1</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={loadDiscrepancias}>Actualizar</button>
        </div>
      </div>

      {/* Resumen */}
      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-icon"><AlertTriangle size={24} /></div>
          <div className="kpi-content">
            <p className="kpi-title">Productos con diferencia</p>
            <h3 className="kpi-value">{productosConDiferencias}</h3>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-icon"><GitCompareArrows size={24} /></div>
          <div className="kpi-content">
            <p className="kpi-title">Total diferencia (unidades)</p>
            <h3 className="kpi-value">{totalDiferencias}</h3>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-icon"><CheckCircle size={24} /></div>
          <div className="kpi-content">
            <p className="kpi-title">Zonas afectadas</p>
            <h3 className="kpi-value">{zonasConDiferencias}</h3>
          </div>
        </div>
      </div>

      {/* Tabla de discrepancias */}
      <div className="card">
        <div className="list-header">
          <h2 className="section-title">
            <AlertTriangle size={20} />
            <span>Productos que requieren reconteo</span>
          </h2>
          <button className="btn btn-outline" onClick={() => window.location.href = `/escaneo?grupo=${grupoId}&reconteo=true`}>
            Ir a reconteo
          </button>
        </div>

        {discrepancias.length === 0 ? (
          <div className="alert-success">
            <CheckCircle size={18} />
            <span>¡No hay diferencias! Los conteos coinciden perfectamente.</span>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Zona</th>
                  <th>SKU</th>
                  <th>Descripción</th>
                  <th>Conteo 1</th>
                  <th>Conteo 2</th>
                  <th>Diferencia</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {discrepancias.map(item => (
                  <tr key={`${item.zonaId}-${item.sku}`} className="row-warning">
                    <td>{item.zona}</td>
                    <td><strong>{item.sku}</strong></td>
                    <td>{item.descripcion || 'Sin descripción'}</td>
                    <td>{item.conteo1}</td>
                    <td>
                      {editing === item.sku ? (
                        <input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="edit-input"
                          autoFocus
                        />
                      ) : (
                        item.conteo2
                      )}
                    </td>
                    <td className={item.diferencia > 0 ? 'text-danger' : 'text-success'}>
                      {item.diferencia > 0 ? `+${item.diferencia}` : item.diferencia}
                    </td>
                    <td>
                      {editing === item.sku ? (
                        <>
                          <button className="icon-btn success" onClick={() => handleSave(item)}><Save size={16} /></button>
                          <button className="icon-btn" onClick={() => setEditing(null)}><X size={16} /></button>
                        </>
                      ) : (
                        <button className="icon-btn" onClick={() => handleEdit(item)}><Edit3 size={16} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recomendación */}
      {discrepancias.length > 0 && (
        <div className="card alert-warning">
          <h3>⚠️ Recomendación</h3>
          <p>Se encontraron {discrepancias.length} productos con diferencias. 
             Se recomienda realizar un <strong>reconteo</strong> solo de estos productos 
             para el grupo <strong>{grupos.find(g => g.id === grupoId)?.nombre}</strong>.</p>
          <button className="btn btn-primary" style={{ marginTop: '12px' }}>
            Generar ronda de reconteo
          </button>
        </div>
      )}
    </div>
  );
}