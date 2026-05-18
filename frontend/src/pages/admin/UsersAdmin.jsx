import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getUsers, createUser, updateUserRole, deleteUser } from '../../services/api';
import './UsersAdmin.css';

const ROLES = ['admin', 'gestionnaire', 'coach', 'score_live', 'lecteur'];

const ROLE_LABELS = {
  admin:        'Admin',
  gestionnaire: 'Gestionnaire',
  coach:        'Coach',
  score_live:   'Score Live',
  lecteur:      'Lecteur',
};

const ROLE_COLORS = {
  admin:        '#ef4444',
  gestionnaire: '#f59e0b',
  coach:        '#3b82f6',
  score_live:   '#8b5cf6',
  lecteur:      '#6b7280',
};

function RoleBadge({ role }) {
  return (
    <span className="ua-role-badge" style={{ background: ROLE_COLORS[role] + '22', color: ROLE_COLORS[role], borderColor: ROLE_COLORS[role] + '44' }}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}

export default function UsersAdmin() {
  const { user: me } = useAuth();
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [toast,   setToast]   = useState(null);

  // Formulaire création
  const [showForm,    setShowForm]    = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole,     setNewRole]     = useState('gestionnaire');
  const [creating,    setCreating]    = useState(false);

  const showToast = (ok, msg) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await getUsers();
      setUsers(data);
    } catch {
      setError('Impossible de charger les utilisateurs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createUser({ username: newUsername.trim(), password: newPassword, role: newRole });
      setNewUsername('');
      setNewPassword('');
      setNewRole('gestionnaire');
      setShowForm(false);
      showToast(true, `Utilisateur "${newUsername}" créé`);
      load();
    } catch (err) {
      showToast(false, err.response?.data?.error || 'Erreur création');
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (id, role) => {
    try {
      await updateUserRole(id, role);
      setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u));
      showToast(true, 'Rôle mis à jour');
    } catch (err) {
      showToast(false, err.response?.data?.error || 'Erreur mise à jour rôle');
    }
  };

  const handleDelete = async (id, username) => {
    if (!confirm(`Supprimer l'utilisateur "${username}" ?`)) return;
    try {
      await deleteUser(id);
      setUsers(prev => prev.filter(u => u.id !== id));
      showToast(true, `Utilisateur "${username}" supprimé`);
    } catch (err) {
      showToast(false, err.response?.data?.error || 'Erreur suppression');
    }
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="ua-page">
      <div className="ua-header">
        <div>
          <h1 className="ua-title">Gestion des utilisateurs</h1>
          <p className="ua-subtitle">{users.length} compte{users.length !== 1 ? 's' : ''} enregistré{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="ua-btn ua-btn--primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? '✕ Annuler' : '+ Nouvel utilisateur'}
        </button>
      </div>

      {showForm && (
        <form className="ua-create-form" onSubmit={handleCreate}>
          <h3 className="ua-form-title">Créer un compte</h3>
          <div className="ua-form-row">
            <div className="ua-field">
              <label>Nom d'utilisateur</label>
              <input value={newUsername} onChange={e => setNewUsername(e.target.value)} required disabled={creating} autoFocus />
            </div>
            <div className="ua-field">
              <label>Mot de passe</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required disabled={creating} minLength={8} />
            </div>
            <div className="ua-field">
              <label>Rôle</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value)} disabled={creating}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" className="ua-btn ua-btn--primary" disabled={creating || !newUsername || !newPassword}>
            {creating ? 'Création...' : 'Créer'}
          </button>
        </form>
      )}

      {error && <div className="ua-error">{error}</div>}

      {loading ? (
        <div className="ua-loading"><div className="ua-spin" /></div>
      ) : (
        <div className="ua-table-wrap">
          <table className="ua-table">
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Rôle</th>
                <th>Créé le</th>
                <th>Dernière connexion</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className={u.id === me.id ? 'ua-row--me' : ''}>
                  <td className="ua-username">
                    {u.username}
                    {u.id === me.id && <span className="ua-me-badge">moi</span>}
                  </td>
                  <td>
                    {u.id === me.id ? (
                      <RoleBadge role={u.role} />
                    ) : (
                      <select
                        className="ua-role-select"
                        value={u.role}
                        onChange={e => handleRoleChange(u.id, e.target.value)}
                        style={{ borderColor: ROLE_COLORS[u.role] + '66' }}
                      >
                        {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="ua-date">{fmtDate(u.created_at)}</td>
                  <td className="ua-date">{fmtDate(u.last_login)}</td>
                  <td>
                    {u.id !== me.id && (
                      <button className="ua-btn ua-btn--danger" onClick={() => handleDelete(u.id, u.username)}>
                        Supprimer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toast && (
        <div className={`ua-toast${toast.ok ? ' ua-toast--ok' : ' ua-toast--err'}`}>
          {toast.ok ? '✅' : '❌'} {toast.msg}
        </div>
      )}
    </div>
  );
}
