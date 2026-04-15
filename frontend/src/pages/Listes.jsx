import { useState, useEffect, useCallback } from 'react';
import {
  getClubs, createClub, updateClub, deleteClub,
  getJoueurs, createJoueur, updateJoueur, deleteJoueur,
} from '../services/api';

export default function Listes() {
  const [activeTab, setActiveTab] = useState('clubs');

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Listes</h1>
          <p className="page-subtitle">Gérez les clubs adversaires et les joueurs SCR</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          className={`btn ${activeTab === 'clubs' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('clubs')}
        >
          🏟️ Clubs adversaires
        </button>
        <button
          className={`btn ${activeTab === 'joueurs' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('joueurs')}
        >
          👤 Joueurs SCR
        </button>
      </div>

      {activeTab === 'clubs' ? <ClubsPanel /> : <JoueursPanel />}
    </div>
  );
}

function ClubsPanel() {
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editClub, setEditClub] = useState(null);
  const [form, setForm] = useState({ nom: '', logo_url: '' });
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [search, setSearch] = useState('');

  const showAlert = (type, msg) => {
    setAlert({ type, msg });
    setTimeout(() => setAlert(null), 4000);
  };

  const loadClubs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getClubs();
      setClubs(res.data);
    } catch {
      showAlert('error', 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadClubs(); }, [loadClubs]);

  const openCreate = () => {
    setEditClub(null);
    setForm({ nom: '', logo_url: '' });
    setShowModal(true);
  };

  const openEdit = (club) => {
    setEditClub(club);
    setForm({ nom: club.nom, logo_url: club.logo_url || '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nom.trim()) return showAlert('error', 'Le nom est requis');
    setSaving(true);
    try {
      if (editClub) {
        await updateClub(editClub.id, form);
        showAlert('success', 'Club modifié');
      } else {
        await createClub(form);
        showAlert('success', 'Club ajouté');
      }
      setShowModal(false);
      loadClubs();
    } catch (err) {
      showAlert('error', err.response?.data?.error || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (club) => {
    if (!confirm(`Supprimer ${club.nom} ?`)) return;
    try {
      await deleteClub(club.id);
      showAlert('success', 'Club supprimé');
      loadClubs();
    } catch {
      showAlert('error', 'Erreur lors de la suppression');
    }
  };

  const filtered = clubs.filter(c => c.nom.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      {alert && (
        <div className={`alert alert-${alert.type}`}>
          {alert.type === 'success' ? '✅' : '❌'} {alert.msg}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Clubs adversaires</h2>
          <div className="actions-bar">
            <input className="form-control" value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher..." style={{ width: 200 }} />
            <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Ajouter</button>
          </div>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner"></div></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <span className="icon">🏟️</span>
            <h3>{search ? 'Aucun résultat' : 'Aucun club'}</h3>
            <p>{search ? `Aucun club pour "${search}"` : 'Ajoutez les clubs adversaires du SCR'}</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nom du club</th>
                  <th>Logo URL</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((club, idx) => (
                  <tr key={club.id}>
                    <td style={{ color: 'var(--texte-gris)', width: 40 }}>{idx + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {club.logo_url ? (
                          <img src={club.logo_url} alt={club.nom}
                            style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 4 }}
                            onError={e => { e.target.style.display = 'none'; }} />
                        ) : (
                          <div style={{ width: 28, height: 28, background: 'var(--fond)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                            🏟️
                          </div>
                        )}
                        <strong>{club.nom}</strong>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--texte-gris)', maxWidth: 200 }}>
                      {club.logo_url ? (
                        <a href={club.logo_url} target="_blank" rel="noreferrer"
                          style={{ color: 'var(--bleu)', textDecoration: 'none' }}>
                          {club.logo_url.slice(0, 40)}{club.logo_url.length > 40 ? '...' : ''}
                        </a>
                      ) : '-'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(club)}>✏️</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(club)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{editClub ? 'Modifier le club' : 'Nouveau club'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nom du club *</label>
                <input className="form-control" value={form.nom}
                  onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                  placeholder="Ex: AS Gambsheim" autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Logo (URL)</label>
                <input className="form-control" value={form.logo_url}
                  onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))}
                  placeholder="https://..." />
                {form.logo_url && (
                  <img src={form.logo_url} alt="preview" style={{ marginTop: 8, maxHeight: 60, objectFit: 'contain' }}
                    onError={e => { e.target.style.display = 'none'; }} />
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '⏳...' : editClub ? '✔ Modifier' : '✔ Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function JoueursPanel() {
  const [joueurs, setJoueurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editJoueur, setEditJoueur] = useState(null);
  const [form, setForm] = useState({ prenom: '', nom: '' });
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [search, setSearch] = useState('');

  const showAlert = (type, msg) => {
    setAlert({ type, msg });
    setTimeout(() => setAlert(null), 4000);
  };

  const loadJoueurs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getJoueurs();
      setJoueurs(res.data);
    } catch {
      showAlert('error', 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadJoueurs(); }, [loadJoueurs]);

  const openCreate = () => {
    setEditJoueur(null);
    setForm({ prenom: '', nom: '' });
    setShowModal(true);
  };

  const openEdit = (j) => {
    setEditJoueur(j);
    setForm({ prenom: j.prenom, nom: j.nom });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.prenom.trim() || !form.nom.trim()) {
      return showAlert('error', 'Prénom et nom sont requis');
    }
    setSaving(true);
    try {
      if (editJoueur) {
        await updateJoueur(editJoueur.id, form);
        showAlert('success', 'Joueur modifié');
      } else {
        await createJoueur(form);
        showAlert('success', 'Joueur ajouté');
      }
      setShowModal(false);
      loadJoueurs();
    } catch (err) {
      showAlert('error', err.response?.data?.error || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (j) => {
    if (!confirm(`Supprimer ${j.prenom} ${j.nom} ?`)) return;
    try {
      await deleteJoueur(j.id);
      showAlert('success', 'Joueur supprimé');
      loadJoueurs();
    } catch {
      showAlert('error', 'Erreur lors de la suppression');
    }
  };

  const filtered = joueurs.filter(j =>
    `${j.prenom} ${j.nom}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      {alert && (
        <div className={`alert alert-${alert.type}`}>
          {alert.type === 'success' ? '✅' : '❌'} {alert.msg}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Joueurs SCR Roeschwoog</h2>
          <div className="actions-bar">
            <input className="form-control" value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher..." style={{ width: 200 }} />
            <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Ajouter</button>
          </div>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner"></div></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <span className="icon">👤</span>
            <h3>{search ? 'Aucun résultat' : 'Aucun joueur'}</h3>
            <p>Ajoutez les joueurs pour les utiliser dans le Score Live</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Prénom</th>
                  <th>Nom</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((j, idx) => (
                  <tr key={j.id}>
                    <td style={{ color: 'var(--texte-gris)', width: 40 }}>{idx + 1}</td>
                    <td>{j.prenom}</td>
                    <td><strong>{j.nom}</strong></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(j)}>✏️</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(j)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{editJoueur ? 'Modifier le joueur' : 'Nouveau joueur'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Prénom *</label>
                  <input className="form-control" value={form.prenom}
                    onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
                    placeholder="Nathan" autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Nom *</label>
                  <input className="form-control" value={form.nom}
                    onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                    placeholder="L." />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '⏳...' : editJoueur ? '✔ Modifier' : '✔ Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
