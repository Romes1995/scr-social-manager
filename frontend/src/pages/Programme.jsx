import { useState, useEffect, useCallback } from 'react';
import {
  getMatches, createMatch, updateMatch, deleteMatch,
  importFFF, saveFFFMatches, publishBoth, getClubs,
} from '../services/api';
import ProgrammeTextGenerator from '../components/ProgrammeTextGenerator';
import ProgrammeVisualGenerator from '../components/ProgrammeVisualGenerator';

const EQUIPES = ['SCR 1', 'SCR 2', 'SCR 3'];
const DIVISIONS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'Coupe', 'Amical'];

const EMPTY_FORM = {
  equipe: 'SCR 1', adversaire: '', logo_adversaire: '', date: '',
  heure: '', lieu: '', domicile: true, division: 'D1', statut: 'programme',
};

export default function Programme() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editMatch, setEditMatch] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [publishing, setPublishing] = useState(null);
  const [clubs, setClubs] = useState([]);

  const showAlert = (type, msg) => {
    setAlert({ type, msg });
    setTimeout(() => setAlert(null), 4000);
  };

  const loadMatches = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getMatches({ statut: 'programme' });
      setMatches(res.data);
    } catch {
      showAlert('error', 'Erreur lors du chargement des matchs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMatches(); }, [loadMatches]);

  useEffect(() => {
    getClubs().then(r => setClubs(r.data)).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditMatch(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (match) => {
    setEditMatch(match);
    setForm({
      equipe: match.equipe,
      adversaire: match.adversaire,
      logo_adversaire: match.logo_adversaire || '',
      date: match.date ? match.date.slice(0, 10) : '',
      heure: match.heure ? match.heure.slice(0, 5) : '',
      lieu: match.lieu || '',
      domicile: match.domicile,
      division: match.division || 'D1',
      statut: match.statut,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.adversaire.trim()) {
      showAlert('error', 'Le nom de l\'adversaire est requis');
      return;
    }
    setSaving(true);
    try {
      if (editMatch) {
        await updateMatch(editMatch.id, form);
        showAlert('success', 'Match modifié avec succès');
      } else {
        await createMatch(form);
        showAlert('success', 'Match créé avec succès');
      }
      setShowModal(false);
      loadMatches();
    } catch (err) {
      const msg = err.response?.data?.error || 'Erreur lors de la sauvegarde';
      showAlert('error', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (match) => {
    if (!confirm(`Supprimer le match contre ${match.adversaire} ?`)) return;
    try {
      await deleteMatch(match.id);
      showAlert('success', 'Match supprimé');
      loadMatches();
    } catch {
      showAlert('error', 'Erreur lors de la suppression');
    }
  };

  const handleImportFFF = async () => {
    setImporting(true);
    try {
      const res = await importFFF();
      if (res.data.matchs && res.data.matchs.length > 0) {
        const saveRes = await saveFFFMatches(res.data.matchs);
        const saved   = saveRes.data.saved   || 0;
        const updated = saveRes.data.updated || 0;
        const msg = updated > 0
          ? `${saved} match(s) créé(s), ${updated} mis à jour`
          : `${saved} match(s) importé(s) depuis la FFF`;
        showAlert('success', msg);
        loadMatches();
      } else {
        showAlert('warning', res.data.message || 'Aucun match trouvé sur la page FFF');
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Impossible d\'importer depuis la FFF';
      showAlert('error', msg);
    } finally {
      setImporting(false);
    }
  };

  const handlePublish = async (match) => {
    setPublishing(match.id);
    try {
      const res = await publishBoth({ match_id: match.id });
      showAlert('success', res.data.message || 'Publication simulée avec succès');
    } catch {
      showAlert('error', 'Erreur lors de la publication');
    } finally {
      setPublishing(null);
    }
  };

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Grouper les matchs par week-end (vendredi–dimanche)
  // Retourne [{ label, vendredi, matchs }] trié par date croissante
  const groupByWeekend = (matchList) => {
    const EQUIPE_ORDER = ['SCR 1', 'SCR 2', 'SCR 3', 'SCR 4'];
    const map = {};
    for (const m of matchList) {
      if (!m.date) {
        const key = 'sans-date';
        if (!map[key]) map[key] = { label: 'Sans date', vendredi: null, matchs: [] };
        map[key].matchs.push(m);
        continue;
      }
      const d = new Date(m.date);
      // Vendredi de la semaine du match (on recule jusqu'au vendredi)
      const day = d.getDay(); // 0=dim, 1=lun, ..., 5=ven, 6=sam
      const diff = day === 0 ? -2 : day === 6 ? -1 : day <= 4 ? -(day + 2) % 7 || -7 : 0;
      const vendredi = new Date(d);
      vendredi.setDate(d.getDate() + diff);
      vendredi.setHours(0, 0, 0, 0);
      const key = vendredi.toISOString().slice(0, 10);
      if (!map[key]) {
        const label = `Week-end du ${vendredi.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`;
        map[key] = { label, vendredi, matchs: [] };
      }
      map[key].matchs.push(m);
    }
    // Trier les groupes par date, et les matchs dans chaque groupe par équipe
    return Object.values(map)
      .sort((a, b) => {
        if (!a.vendredi) return 1;
        if (!b.vendredi) return -1;
        return a.vendredi - b.vendredi;
      })
      .map(g => ({
        ...g,
        matchs: [...g.matchs].sort((a, b) => {
          const ia = EQUIPE_ORDER.indexOf(a.equipe);
          const ib = EQUIPE_ORDER.indexOf(b.equipe);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        }),
      }));
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Programme des matchs</h1>
          <p className="page-subtitle">Gérez les matchs à venir et publiez sur les réseaux</p>
        </div>
        <div className="actions-bar">
          <button className="btn btn-ghost" onClick={handleImportFFF} disabled={importing}>
            {importing ? '⏳' : '🔄'} Import FFF
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            + Ajouter un match
          </button>
        </div>
      </div>

      {alert && (
        <div className={`alert alert-${alert.type}`}>
          {alert.type === 'success' ? '✅' : alert.type === 'error' ? '❌' : '⚠️'} {alert.msg}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Matchs programmés</h2>
          <span className="badge badge-programme">{matches.length} match{matches.length > 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="loading-center">
            <div className="spinner"></div>
            <span>Chargement...</span>
          </div>
        ) : matches.length === 0 ? (
          <div className="empty-state">
            <span className="icon">📅</span>
            <h3>Aucun match programmé</h3>
            <p>Importez depuis la FFF ou ajoutez un match manuellement</p>
          </div>
        ) : (
          <div>
            {groupByWeekend(matches).map(group => (
              <div key={group.label} style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--scr-green, #1a6b3c)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>
                  📅 {group.label}
                </h3>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Équipe</th>
                        <th>Adversaire</th>
                        <th>Date</th>
                        <th>Heure</th>
                        <th>D/E</th>
                        <th>Division</th>
                        <th>Lieu</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.matchs.map(match => (
                        <tr key={match.id}>
                          <td><strong>{match.equipe}</strong></td>
                          <td><span style={{ fontWeight: 500 }}>vs {match.adversaire}</span></td>
                          <td>{formatDate(match.date)}</td>
                          <td>{match.heure ? match.heure.slice(0, 5) : '-'}</td>
                          <td>
                            <span className={`badge ${match.domicile ? 'badge-programme' : 'badge-termine'}`}>
                              {match.domicile ? 'Dom' : 'Ext'}
                            </span>
                          </td>
                          <td>{match.division || '-'}</td>
                          <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {match.lieu || '-'}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => handlePublish(match)}
                                disabled={publishing === match.id}
                                title="Publier sur les réseaux"
                              >
                                {publishing === match.id ? '⏳' : '📣'}
                              </button>
                              <button className="btn btn-sm btn-ghost" onClick={() => openEdit(match)} title="Modifier">✏️</button>
                              <button className="btn btn-sm btn-danger" onClick={() => handleDelete(match)} title="Supprimer">🗑️</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ProgrammeTextGenerator
                  matchIds={group.matchs.map(m => m.id)}
                  weekendLabel={group.label}
                />
                <ProgrammeVisualGenerator
                  matches={group.matchs}
                  fallbackDate={group.vendredi ? group.vendredi.toISOString().slice(0, 10) : null}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{editMatch ? 'Modifier le match' : 'Nouveau match'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Équipe SCR</label>
                  <select className="form-control form-select" value={form.equipe}
                    onChange={e => setForm(f => ({ ...f, equipe: e.target.value }))}>
                    {EQUIPES.map(eq => <option key={eq}>{eq}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Division</label>
                  <select className="form-control form-select" value={form.division}
                    onChange={e => setForm(f => ({ ...f, division: e.target.value }))}>
                    {DIVISIONS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Adversaire *</label>
                <input className="form-control" value={form.adversaire}
                  onChange={e => setForm(f => ({ ...f, adversaire: e.target.value }))}
                  placeholder="Nom du club adversaire"
                  list="clubs-datalist" autoComplete="off" />
                <datalist id="clubs-datalist">
                  {[...new Set(clubs.map(c => c.equipe || c.nom).filter(Boolean))].sort()
                    .map(v => <option key={v} value={v} />)}
                </datalist>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input type="date" className="form-control" value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Heure</label>
                  <input type="time" className="form-control" value={form.heure}
                    onChange={e => setForm(f => ({ ...f, heure: e.target.value }))} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Lieu</label>
                <input className="form-control" value={form.lieu}
                  onChange={e => setForm(f => ({ ...f, lieu: e.target.value }))}
                  placeholder="Terrain / adresse" />
              </div>

              <div className="form-group">
                <label className="form-label">Domicile / Extérieur</label>
                <div style={{ display: 'flex', gap: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="radio" name="domicile" checked={form.domicile === true}
                      onChange={() => setForm(f => ({ ...f, domicile: true }))} />
                    🏠 Domicile
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="radio" name="domicile" checked={form.domicile === false}
                      onChange={() => setForm(f => ({ ...f, domicile: false }))} />
                    ✈️ Extérieur
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '⏳ Sauvegarde...' : editMatch ? '✔ Modifier' : '✔ Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
