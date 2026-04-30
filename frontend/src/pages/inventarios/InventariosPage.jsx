import { useEffect, useState } from 'react';
import {
  ClipboardList,
  CalendarDays,
  Pencil,
  Trash2,
  Save,
  X,
  Plus,
  CircleCheck,
  CircleAlert,
  ShieldCheck,
  Link2,
  CheckCircle,
  Clock,
  RefreshCw,
  Eye,
  Unlink
} from 'lucide-react';
import {
  createInventario,
  getInventarios,
  updateInventario,
  deleteInventario
} from '../../services/inventarios.service';
import api from '../../services/api';

function Modal({ open, title, children, onClose, footer }) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '500px',
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '12px'
          }}
        >
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div style={{ marginBottom: '16px' }}>{children}</div>

        {footer ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function InventariosPage() {
  const [inventarios, setInventarios] = useState([]);
  const [parejas, setParejas] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    nombre: '',
    fecha: '',
    estado: 'borrador',
    requiereConteo3: false,
    inventarioParejaId: ''  // ← NUEVO: inventario con el que forma pareja
  });
  const [loading, setLoading] = useState(true);
  const [loadingParejas, setLoadingParejas] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filtroParejas, setFiltroParejas] = useState('todas');

  const [feedbackModal, setFeedbackModal] = useState({
    open: false,
    title: '',
    message: '',
    type: 'success'
  });

  const [deleteModal, setDeleteModal] = useState({
    open: false,
    inventario: null
  });

  const [verDetalleModal, setVerDetalleModal] = useState({
    open: false,
    pareja: null
  });

  async function loadInventarios() {
    const data = await getInventarios();
    setInventarios(data);
  }

  async function loadParejas() {
    setLoadingParejas(true);
    try {
      const params = filtroParejas !== 'todas' ? { estado: filtroParejas } : {};
      const response = await api.get('/diferencias/parejas', { params });
      setParejas(response.data.data || []);
    } catch (error) {
      console.error('Error cargando parejas:', error);
    } finally {
      setLoadingParejas(false);
    }
  }

  useEffect(() => {
    loadInventarios()
      .catch(() => {
        setFeedbackModal({
          open: true,
          title: 'Error',
          message: 'No se pudieron cargar los inventarios',
          type: 'error'
        });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadParejas();
  }, [filtroParejas]);

  const resetForm = () => {
    setForm({
      nombre: '',
      fecha: '',
      estado: 'borrador',
      requiereConteo3: false,
      inventarioParejaId: ''
    });
    setEditing(null);
  };

  const openSuccess = (message) => {
    setFeedbackModal({
      open: true,
      title: 'Todo salió bien',
      message,
      type: 'success'
    });
  };

  const openError = (message) => {
    setFeedbackModal({
      open: true,
      title: 'Ups',
      message,
      type: 'error'
    });
  };

  const closeFeedback = () => {
    setFeedbackModal((prev) => ({ ...prev, open: false }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      let inventarioCreado;
      
      if (editing) {
        await updateInventario(editing, {
          nombre: form.nombre,
          fecha: form.fecha,
          estado: form.estado,
          requiereConteo3: form.requiereConteo3
        });
        inventarioCreado = { id: editing };
        openSuccess('Inventario actualizado correctamente');
      } else {
        const response = await createInventario({
          nombre: form.nombre,
          fecha: form.fecha,
          estado: form.estado,
          requiereConteo3: form.requiereConteo3
        });
        inventarioCreado = response.data;
        openSuccess('Inventario creado correctamente');
      }

      // 🔥 NUEVO: Si se seleccionó un inventario pareja, crear la relación
      if (form.inventarioParejaId) {
        const inventarioParejaId = Number(form.inventarioParejaId);
        
        // Verificar si ya existe la pareja
        const existePareja = parejas.some(p => 
          (p.inventarioBaseId === inventarioCreado.id && p.inventarioComparadoId === inventarioParejaId) ||
          (p.inventarioBaseId === inventarioParejaId && p.inventarioComparadoId === inventarioCreado.id)
        );
        
        if (!existePareja) {
          await api.post('/diferencias/parejas', {
            inventarioBaseId: inventarioCreado.id,
            inventarioComparadoId: inventarioParejaId,
            estado: 'pendiente',
            observaciones: `Creada desde inventario ${form.nombre}`
          });
          openSuccess('Inventario creado y pareja registrada correctamente');
        }
      }

      resetForm();
      await loadInventarios();
      await loadParejas();
    } catch (err) {
      openError(err.response?.data?.message || 'Error al guardar inventario');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item) => {
    setEditing(item.id);
    setForm({
      nombre: item.nombre || '',
      fecha: item.fecha || '',
      estado: item.estado || 'borrador',
      requiereConteo3: Boolean(item.requiereConteo3),
      inventarioParejaId: ''
    });
  };

  const askDelete = (item) => {
    setDeleteModal({
      open: true,
      inventario: item
    });
  };

  const closeDelete = () => {
    setDeleteModal({
      open: false,
      inventario: null
    });
  };

  const confirmDelete = async () => {
    const item = deleteModal.inventario;
    if (!item) return;

    try {
      await deleteInventario(item.id);

      if (editing === item.id) {
        resetForm();
      }

      await loadInventarios();
      await loadParejas();
      closeDelete();
      openSuccess('Inventario eliminado correctamente');
    } catch (err) {
      closeDelete();
      openError(err.response?.data?.message || 'Error al eliminar inventario');
    }
  };

  const getEstadoBadge = (estado) => {
    const config = {
      pendiente: { icon: Clock, text: 'Pendiente', color: 'warning' },
      en_reconteo: { icon: RefreshCw, text: 'En reconteo', color: 'info' },
      completada: { icon: CheckCircle, text: 'Completada', color: 'success' }
    };
    const { icon: Icon, text, color } = config[estado] || config.pendiente;
    return (
      <span className={`status-badge ${color}`}>
        <Icon size={12} /> {text}
      </span>
    );
  };

  // Filtrar inventarios que pueden ser pareja (excluir el actual)
  const inventariosDisponiblesParaPareja = inventarios.filter(
    inv => inv.id !== editing
  );

  return (
    <>
      <div className="grid-2">
        <div className="card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '16px'
            }}
          >
            <ClipboardList size={22} />
            <h2 style={{ margin: 0 }}>
              {editing ? 'Editar inventario' : 'Crear inventario'}
            </h2>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Nombre</label>
              <input
                value={form.nombre}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, nombre: e.target.value }))
                }
                placeholder="Inventario Semestral 2026-1"
                required
              />
            </div>

            <div className="form-group">
              <label>Fecha</label>
              <input
                type="date"
                value={form.fecha}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, fecha: e.target.value }))
                }
                required
              />
            </div>

            <div className="form-group">
              <label>Estado</label>
              <select
                value={form.estado}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, estado: e.target.value }))
                }
              >
                <option value="borrador">Borrador</option>
                <option value="activo">Activo</option>
                <option value="cerrado">Cerrado</option>
              </select>
            </div>

            <div className="form-group">
              <label
                style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center'
                }}
              >
                <input
                  type="checkbox"
                  checked={form.requiereConteo3}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      requiereConteo3: e.target.checked
                    }))
                  }
                />
                Requiere conteo 3
              </label>
            </div>

            {/* 🔥 NUEVO: Selector de inventario pareja */}
            <div className="form-group">
              <label>
                <Link2 size={14} /> Inventario pareja (opcional)
              </label>
              <select
                value={form.inventarioParejaId}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, inventarioParejaId: e.target.value }))
                }
              >
                <option value="">Selecciona un inventario pareja</option>
                {inventariosDisponiblesParaPareja.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.nombre} - {inv.fecha} ({inv.estado})
                  </option>
                ))}
              </select>
              <small className="text-muted">
                Si seleccionas un inventario, se creará automáticamente una pareja entre ambos
              </small>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {editing ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={resetForm}
                >
                  <X size={16} />
                  <span>Cancelar</span>
                </button>
              ) : null}

              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? (
                  'Guardando...'
                ) : editing ? (
                  <>
                    <Save size={16} />
                    <span>Actualizar inventario</span>
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    <span>Crear inventario</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '16px'
            }}
          >
            <ClipboardList size={22} />
            <h2 style={{ margin: 0 }}>Inventarios</h2>
          </div>

          {loading ? (
            <p>Cargando...</p>
          ) : inventarios.length === 0 ? (
            <p className="muted">No hay inventarios registrados.</p>
          ) : (
            <div className="table-list">
              {inventarios.map((item) => (
                <div
                  key={item.id}
                  className="list-row"
                  style={{
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '6px',
                        flexWrap: 'wrap'
                      }}
                    >
                      <strong>{item.nombre}</strong>
                      <span className="badge">{item.estado}</span>
                      {item.requiereConteo3 ? (
                        <span className="badge">
                          <ShieldCheck size={12} /> Conteo 3
                        </span>
                      ) : null}
                    </div>

                    <p
                      className="muted"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        margin: 0
                      }}
                    >
                      <CalendarDays size={14} />
                      <span>{item.fecha}</span>
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-outline"
                      type="button"
                      onClick={() => handleEdit(item)}
                    >
                      <Pencil size={16} />
                      <span>Editar</span>
                    </button>

                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() => askDelete(item)}
                    >
                      <Trash2 size={16} />
                      <span>Eliminar</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sección de Parejas existentes */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '20px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Link2 size={22} />
            <h2 style={{ margin: 0 }}>Parejas registradas</h2>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className={`btn ${filtroParejas === 'todas' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFiltroParejas('todas')}
            >
              Todas
            </button>
            <button
              className={`btn ${filtroParejas === 'pendiente' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFiltroParejas('pendiente')}
            >
              <Clock size={14} /> Pendientes
            </button>
            <button
              className={`btn ${filtroParejas === 'en_reconteo' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFiltroParejas('en_reconteo')}
            >
              <RefreshCw size={14} /> En reconteo
            </button>
            <button
              className={`btn ${filtroParejas === 'completada' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFiltroParejas('completada')}
            >
              <CheckCircle size={14} /> Completadas
            </button>
          </div>
        </div>

        {loadingParejas ? (
          <p>Cargando parejas...</p>
        ) : parejas.length === 0 ? (
          <p className="muted">
            No hay parejas registradas. Al crear un inventario puedes seleccionar su pareja.
          </p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Inventario Base</th>
                  <th>Inventario Comparado</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th>Rondas</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {parejas.map((pareja) => (
                  <tr key={pareja.id}>
                    <td>{pareja.inventarioBase?.nombre} <small>({pareja.inventarioBase?.fecha})</small></td>
                    <td>{pareja.inventarioComparado?.nombre} <small>({pareja.inventarioComparado?.fecha})</small></td>
                    <td>{getEstadoBadge(pareja.estado)}</td>
                    <td>{new Date(pareja.createdAt).toLocaleDateString()}</td>
                    <td className="text-center">{pareja.rondasReconteoGeneradas || 0}</td>
                    <td>
                      <button
                        className="btn btn-outline"
                        style={{ padding: '4px 8px' }}
                        onClick={() => setVerDetalleModal({ open: true, pareja })}
                      >
                        <Eye size={14} /> Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modales... (mantén los mismos modales que tenías) */}
      <Modal
        open={feedbackModal.open}
        title={feedbackModal.title}
        onClose={closeFeedback}
        footer={
          <button className="btn btn-primary" type="button" onClick={closeFeedback}>
            Entendido
          </button>
        }
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          {feedbackModal.type === 'success' ? (
            <CircleCheck size={22} />
          ) : (
            <CircleAlert size={22} />
          )}
          <p style={{ margin: 0 }}>{feedbackModal.message}</p>
        </div>
      </Modal>

      <Modal
        open={deleteModal.open}
        title="Confirmar eliminación"
        onClose={closeDelete}
        footer={
          <>
            <button className="btn btn-outline" type="button" onClick={closeDelete}>
              Cancelar
            </button>
            <button className="btn btn-danger" type="button" onClick={confirmDelete}>
              Eliminar
            </button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          ¿Seguro que quieres eliminar el inventario{' '}
          <strong>{deleteModal.inventario?.nombre}</strong>?
        </p>
      </Modal>

      <Modal
        open={verDetalleModal.open}
        title="Detalle de pareja"
        onClose={() => setVerDetalleModal({ open: false, pareja: null })}
        footer={
          <button
            className="btn btn-primary"
            onClick={() => setVerDetalleModal({ open: false, pareja: null })}
          >
            Cerrar
          </button>
        }
      >
        {verDetalleModal.pareja && (
          <div>
            <div style={{ marginBottom: '12px' }}>
              <strong>Inventario Base:</strong> {verDetalleModal.pareja.inventarioBase?.nombre}
              <br />
              <small>{verDetalleModal.pareja.inventarioBase?.fecha}</small>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>Inventario Comparado:</strong> {verDetalleModal.pareja.inventarioComparado?.nombre}
              <br />
              <small>{verDetalleModal.pareja.inventarioComparado?.fecha}</small>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>Estado:</strong> {getEstadoBadge(verDetalleModal.pareja.estado)}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>Rondas generadas:</strong> {verDetalleModal.pareja.rondasReconteoGeneradas || 0}
            </div>
            {verDetalleModal.pareja.observaciones && (
              <div>
                <strong>Observaciones:</strong>
                <p>{verDetalleModal.pareja.observaciones}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}