import { useEffect, useState } from 'react';
import {
  MapPin,
  Pencil,
  Trash2,
  Save,
  X,
  Plus,
  CircleCheck,
  CircleAlert,
  Hash,
  Power
} from 'lucide-react';
import {
  createZona,
  getZonas,
  updateZona,
  deleteZona
} from '../../services/zonas.service';

function Modal({ open, title, children, onClose, footer }) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">{children}</div>

        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export default function ZonasPage() {
  const [zonas, setZonas] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    nombre: '',
    codigo: '',
    activa: true
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
    zona: null
  });

  async function loadZonas() {
    const data = await getZonas();
    setZonas(data);
  }

  useEffect(() => {
    loadZonas()
      .catch(() => {
        setFeedbackModal({
          open: true,
          title: 'Error',
          message: 'No se pudieron cargar las zonas',
          type: 'error'
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const resetForm = () => {
    setForm({
      nombre: '',
      codigo: '',
      activa: true
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
        await updateZona(editing, form);
        openSuccess('Zona actualizada correctamente');
      } else {
        await createZona(form);
        openSuccess('Zona creada correctamente');
      }

      resetForm();
      await loadZonas();
    } catch (err) {
      openError(err.response?.data?.message || 'Error al guardar zona');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item) => {
    setEditing(item.id);
    setForm({
      nombre: item.nombre || '',
      codigo: item.codigo || '',
      activa: Boolean(item.activa)
    });
  };

  const askDelete = (item) => {
    setDeleteModal({
      open: true,
      zona: item
    });
  };

  const closeDelete = () => {
    setDeleteModal({
      open: false,
      zona: null
    });
  };

  const confirmDelete = async () => {
    const item = deleteModal.zona;
    if (!item) return;

    try {
      await deleteZona(item.id);

      if (editing === item.id) {
        resetForm();
      }

      await loadZonas();
      closeDelete();
      openSuccess('Zona eliminada correctamente');
    } catch (err) {
      closeDelete();
      openError(err.response?.data?.message || 'Error al eliminar zona');
    }
  };

  return (
    <>
      <div className="grid-2">
        <div className="card">
          <div className="zonas-header">
            <MapPin size={22} />
            <h2>{editing ? 'Editar zona' : 'Crear zona'}</h2>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Nombre</label>
              <input
                value={form.nombre}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, nombre: e.target.value }))
                }
                placeholder="Bodega Central"
                required
              />
            </div>

            <div className="form-group">
              <label>Código</label>
              <input
                value={form.codigo}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, codigo: e.target.value }))
                }
                placeholder="BOD-CEN"
                required
              />
            </div>

            <div className="form-group">
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={form.activa}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      activa: e.target.checked
                    }))
                  }
                />
                Zona activa
              </label>
            </div>

            <div className="form-actions-inline">
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
                    <span>Actualizar zona</span>
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    <span>Crear zona</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="zonas-header">
            <MapPin size={22} />
            <h2>Zonas</h2>
          </div>

          {loading ? (
            <p>Cargando...</p>
          ) : zonas.length === 0 ? (
            <p className="muted">No hay zonas registradas.</p>
          ) : (
            <div className="table-list">
              {zonas.map((item) => (
                <div key={item.id} className="list-row compact-row">
                  <div>
                    <div className="zona-meta">
                      <strong>{item.nombre}</strong>

                      <span className="codigo-badge">
                        <Hash size={12} />
                        {item.codigo}
                      </span>

                      <span
                        className={`zona-status-badge ${
                          item.activa ? 'activa' : 'inactiva'
                        }`}
                      >
                        <Power size={12} />
                        {item.activa ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                  </div>

                  <div className="zona-actions">
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
        <div
          className={`modal-message ${
            feedbackModal.type === 'success' ? 'success' : 'error'
          }`}
        >
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
          ¿Seguro que quieres eliminar la zona{' '}
          <strong>{deleteModal.zona?.nombre}</strong>?
        </p>
      </Modal>
    </>
  );
}