import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Power, Users } from 'lucide-react';
import {
  getUsuarios,
  getRolesUsuarios,
  createUsuario,
  updateUsuario,
  updateEstadoUsuario
} from '../../services/usuarios.service';

const initialForm = {
  nombre: '',
  email: '',
  password: '',
  rolId: '',
  activo: true
};

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(initialForm);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadData() {
    try {
      setLoading(true);
      const [usuariosData, rolesData] = await Promise.all([
        getUsuarios(),
        getRolesUsuarios()
      ]);

      setUsuarios(usuariosData || []);
      setRoles(rolesData || []);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function openCreateModal() {
    setEditingUser(null);
    setForm(initialForm);
    setError('');
    setMessage('');
    setModalOpen(true);
  }

  function openEditModal(user) {
    setEditingUser(user);
    setForm({
      nombre: user.nombre || '',
      email: user.email || '',
      password: '',
      rolId: user.rolId || user.rol?.id || '',
      activo: Boolean(user.activo)
    });
    setError('');
    setMessage('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingUser(null);
    setForm(initialForm);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    try {
      setSaving(true);
      setError('');
      setMessage('');

      const payload = {
        nombre: form.nombre,
        email: form.email,
        password: form.password,
        rolId: Number(form.rolId),
        activo: Boolean(form.activo)
      };

      if (editingUser) {
        await updateUsuario(editingUser.id, payload);
        setMessage('Usuario actualizado correctamente');
      } else {
        await createUsuario(payload);
        setMessage('Usuario creado correctamente');
      }

      await loadData();
      closeModal();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar el usuario');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleEstado(user) {
    const nuevoEstado = !user.activo;
    const confirmar = window.confirm(
      nuevoEstado
        ? `¿Activar a ${user.nombre}?`
        : `¿Desactivar a ${user.nombre}?`
    );

    if (!confirmar) return;

    try {
      setError('');
      setMessage('');
      await updateEstadoUsuario(user.id, nuevoEstado);
      setMessage(
        nuevoEstado
          ? 'Usuario activado correctamente'
          : 'Usuario desactivado correctamente'
      );
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo actualizar el estado');
    }
  }

  const usuariosOrdenados = useMemo(() => {
    return [...usuarios].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [usuarios]);

  if (loading) {
    return <div className="card">Cargando usuarios...</div>;
  }

  return (
    <div className="dashboard-container">
      <div className="card">
        <div className="list-header">
          <h2 className="section-title">
            <Users size={20} />
            <span>Usuarios</span>
          </h2>

          <button className="btn btn-primary" onClick={openCreateModal}>
            <Plus size={16} />
            <span>Nuevo usuario</span>
          </button>
        </div>

        {message ? <div className="alert-success">{message}</div> : null}
        {error ? <div className="alert-error">{error}</div> : null}

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuariosOrdenados.length === 0 ? (
                <tr>
                  <td colSpan="5">No hay usuarios registrados.</td>
                </tr>
              ) : (
                usuariosOrdenados.map((user) => (
                  <tr key={user.id}>
                    <td>{user.nombre}</td>
                    <td>{user.email}</td>
                    <td>{user.rol?.nombre || 'Sin rol'}</td>
                    <td>
                      <span className={`status-chip ${user.activo ? 'activa' : 'cerrada'}`}>
                        {user.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-outline"
                          onClick={() => openEditModal(user)}
                        >
                          <Pencil size={16} />
                          <span>Editar</span>
                        </button>

                        <button
                          className={`btn ${user.activo ? 'btn-danger' : 'btn-primary'}`}
                          onClick={() => handleToggleEstado(user)}
                        >
                          <Power size={16} />
                          <span>{user.activo ? 'Desactivar' : 'Activar'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen ? (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="list-header">
              <h3 className="section-title">
                <Users size={18} />
                <span>{editingUser ? 'Editar usuario' : 'Crear usuario'}</span>
              </h3>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Nombre</label>
                <input
                  value={form.nombre}
                  onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
                  required
                />
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>

              <div className="form-group">
                <label>{editingUser ? 'Nueva contraseña (opcional)' : 'Contraseña'}</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  required={!editingUser}
                />
              </div>

              <div className="form-group">
                <label>Rol</label>
                <select
                  value={form.rolId}
                  onChange={(e) => setForm((prev) => ({ ...prev, rolId: e.target.value }))}
                  required
                >
                  <option value="">Selecciona un rol</option>
                  {roles.map((rol) => (
                    <option key={rol.id} value={rol.id}>
                      {rol.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Estado</label>
                <select
                  value={String(form.activo)}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      activo: e.target.value === 'true'
                    }))
                  }
                >
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>

              {error ? <div className="alert-error">{error}</div> : null}

              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={closeModal}
                >
                  Cancelar
                </button>

                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Guardando...' : editingUser ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}