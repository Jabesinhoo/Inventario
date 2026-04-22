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
  ShieldCheck
} from 'lucide-react';
import {
  createInventario,
  getInventarios,
  updateInventario,
  deleteInventario
} from '../../services/inventarios.service';

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
          maxWidth: '480px',
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
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    nombre: '',
    fecha: '',
    estado: 'borrador',
    requiereConteo3: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  async function loadInventarios() {
    const data = await getInventarios();
    setInventarios(data);
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

  const resetForm = () => {
    setForm({
      nombre: '',
      fecha: '',
      estado: 'borrador',
      requiereConteo3: false
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
      if (editing) {
        await updateInventario(editing, form);
        openSuccess('Inventario actualizado correctamente');
      } else {
        await createInventario(form);
        openSuccess('Inventario creado correctamente');
      }

      resetForm();
      await loadInventarios();
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
      requiereConteo3: Boolean(item.requiereConteo3)
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
      closeDelete();
      openSuccess('Inventario eliminado correctamente');
    } catch (err) {
      closeDelete();
      openError(err.response?.data?.message || 'Error al eliminar inventario');
    }
  };

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
    </>
  );
}