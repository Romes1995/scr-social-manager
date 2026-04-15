import { useState, useEffect, useCallback } from 'react';
import { getMatches, createMatch, updateMatch, deleteMatch } from '../services/api';

const EQUIPES = ['SCR 1', 'SCR 2', 'SCR 3'];
const DIVISIONS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'Coupe'];

const EMPTY_FORM = {
  equipe: 'SCR 1', adversaire: '', date: '', heure: '',
  domicile: true, division: 'D1', score_scr: 0, score_adv: 0,
  buteurs: '', statut: 'termine',
};

export default function Resultats() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editMatch, setEditMatch] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [filterEquipe, setFilterEquipe] = useState('');

  const showAlert = (type, msg) => {
    setAlert({ type, msg });
    setTimeout(() => setAlert(null), 4000);
  };

  const loadResults = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getMatches({ statut: 'termine' });
      setMatches(res.data.reverse());
    } catch {
      showAlert('error', 'Erreur lors du chargement des résultats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadResults(); }, [loadResults]);

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
      date: match.date ? match.date.slice(0, 10) : '',
      heure: match.heure ? match.heure.slice(0, 5) : '',
      domicile: match.domicile,
      division: match.division || 'D1',
      score_scr: match.score_scr || 0,
      score_adv: match.score_adv || 0,
      buteurs: (match.buteurs || []).join(', '),
      statut: 'termine',
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
      const data = {
        ...form,
        score_scr: parseInt(form.score_scr) || 0,
        score_adv: parseInt(form.score_adv) || 0,
        buteurs: form.buteurs ? form.buteurs.split(',').map(b => b.trim()).filter(Boolean) : [],
      };

      if (editMatch) {
        await updateMatch(editMatch.id, data);
        showAlert('success', 'Résultat modifié');
      } else {
        await createMatch(data);
        showAlert('success', 'Résultat ajouté');
      }
      setShowModal(false);
      loadResults();
    } catch (err) {
      showAlert('error', err.response?.data?.error || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (match) => {
    if (!confirm(`Supprimer le résultat contre ${match.adversaire} ?`)) return;
    try {
      await deleteMatch(match.id);
      showAlert('success', 'Résultat supprimé');
      loadResults();
    } catch {
      showAlert('error', 'Erreur lors de la suppression');
    }
  };

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getResultat = (match) => {
    const s = match.score_scr;
    const a = match.score_adv;
    if (s > a) return { label: 'V', cls: 'win' };
    if (s < a) return { label: 'D', cls: 'loss' };
    return { label: 'N', cls: 'draw' };
  };

  const filtered = filterEquipe ? matches.filter(m => m.equipe === filterEquipe) : matches;

  // Stats par équipe
  const stats = EQUIPES.map(eq => {
    const ms = matches.filter(m => m.equipe === eq);
    const v = ms.filter(m => m.score_scr > m.score_adv).length;
    const n = ms.filter(m => m.score_scr === m.score_adv).length;
    const d = ms.filter(m => m.score_scr < m.score_adv).length;
    const bp = ms.reduce((s, m) => s + (m.score_scr || 0), 0);
    const bc = ms.reduce((s, m) => s + (m.score_adv || 0), 0);
    const pts = v * 3 + n;
    return { eq, j: ms.length, v, n, d, bp, bc, pts };
  }).filter(s => s.j > 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Résultats</h1>
          <p className="page-subtitle">Historique des matchs terminés</p>
        </div>
        <div className="actions-bar">
          <select className="form-control form-select" value={filterEquipe}
            onChange={e => setFilterEquipe(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Toutes les équipes</option>
            {EQUIPES.map(eq => <option key={eq}>{eq}</option>)}
          </select>
          <button className="btn btn-primary" onClick={openCreate}>
            + Saisir résultat
          </button>
        </div>
      </div>

      {alert && (
        <div className={`alert alert-${alert.type}`}>
          {alert.type === 'success' ? '✅' : '❌'} {alert.msg}
        </div>
      )}

      {/* Tableau des stats */}
      {stats.length > 0 && (
        <div className="section">
          <h2 className="section-title">Bilan de la saison</h2>
          <div className="card">
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Équipe</th>
                    <th>J</th>
                    <th>V</th>
                    <th>N</th>
                    <th>D</th>
                    <th>BP</th>
                    <th>BC</th>
                    <th>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.sort((a, b) => b.pts - a.pts).map(s => (
                    <tr key={s.eq}>
                      <td><strong>{s.eq}</strong></td>
                      <td>{s.j}</td>
                      <td style={{ color: 'var(--vert-success)', fontWeight: 600 }}>{s.v}</td>
                      <td>{s.n}</td>
                      <td style={{ color: 'var(--rouge)', fontWeight: 600 }}>{s.d}</td>
                      <td>{s.bp}</td>
                      <td>{s.bc}</td>
                      <td><strong style={{ color: 'var(--vert)' }}>{s.pts}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Liste des résultats */}
      <div className="card">
        <div className="card-header">
          <h2>Historique des matchs</h2>
          <span className="badge badge-termine">{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="loading-center">
            <div className="spinner"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <span className="icon">🏆</span>
            <h3>Aucun résultat</h3>
            <p>Les matchs terminés depuis le Score Live apparaîtront ici</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Équipe</th>
                  <th>Adversaire</th>
                  <th>D/E</th>
                  <th>Score</th>
                  <th>Résultat</th>
                  <th>Buteurs</th>
                  <th>Division</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(match => {
                  const res = getResultat(match);
                  return (
                    <tr key={match.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(match.date)}</td>
                      <td><strong>{match.equipe}</strong></td>
                      <td>{match.adversaire}</td>
                      <td>
                        <span className={`badge ${match.domicile ? 'badge-programme' : 'badge-termine'}`}>
                          {match.domicile ? 'Dom' : 'Ext'}
                        </span>
                      </td>
                      <td>
                        <strong style={{ fontFamily: 'Bebas Neue', fontSize: 18, letterSpacing: 1 }}>
                          {match.score_scr ?? '-'} - {match.score_adv ?? '-'}
                        </strong>
                      </td>
                      <td>
                        <span className={`badge result-badge-${res.cls}`}
                          style={{
                            background: res.cls === 'win' ? 'var(--vert-success-light)' : res.cls === 'loss' ? 'var(--rouge-light)' : '#f3f4f6',
                            color: res.cls === 'win' ? 'var(--vert-success)' : res.cls === 'loss' ? 'var(--rouge)' : 'var(--texte-gris)',
                          }}>
                          {res.label}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, maxWidth: 150 }}>
                        {(match.buteurs || []).join(', ') || '-'}
                      </td>
                      <td>{match.division || '-'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-sm btn-ghost" onClick={() => openEdit(match)}>✏️</button>
                          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(match)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{editMatch ? 'Modifier résultat' : 'Saisir résultat'}</h3>
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
                  placeholder="Nom du club adversaire" />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input type="date" className="form-control" value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Domicile / Extérieur</label>
                  <select className="form-control form-select" value={form.domicile ? 'dom' : 'ext'}
                    onChange={e => setForm(f => ({ ...f, domicile: e.target.value === 'dom' }))}>
                    <option value="dom">Domicile</option>
                    <option value="ext">Extérieur</option>
                  </select>
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Score SCR</label>
                  <input type="number" min="0" className="form-control" value={form.score_scr}
                    onChange={e => setForm(f => ({ ...f, score_scr: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Score Adversaire</label>
                  <input type="number" min="0" className="form-control" value={form.score_adv}
                    onChange={e => setForm(f => ({ ...f, score_adv: e.target.value }))} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Buteurs (séparés par des virgules)</label>
                <input className="form-control" value={form.buteurs}
                  onChange={e => setForm(f => ({ ...f, buteurs: e.target.value }))}
                  placeholder="Nathan L., Thomas M., ..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '⏳ Sauvegarde...' : editMatch ? '✔ Modifier' : '✔ Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
