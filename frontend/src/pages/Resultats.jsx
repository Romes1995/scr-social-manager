import { useState, useEffect, useCallback, useMemo } from 'react';
import { getMatches, createMatch, updateMatch, deleteMatch, generateResultatWeekend, publishFacebook, publishInstagram, getClubs, getJoueurs, updateButeurs } from '../services/api';
import './Resultats.css';

const EQUIPES = ['SCR 1', 'SCR 2', 'SCR 3'];
const DIVISIONS = ['District 1 Alsace', 'District 5 Alsace', 'District 7 Alsace', 'District 7 Accession', 'Coupe de France', 'Coupe Alsace', 'Coupe Réserves', 'Challenge Réserves', 'Autre'];

const EMPTY_FORM = {
  equipe: 'SCR 1', adversaire: '', date: '', heure: '',
  domicile: true, division: 'District 1 Alsace', score_scr: 0, score_adv: 0,
  buteurs: '', statut: 'termine',
};

// ── Helpers classification ─────────────────────────────────────────────────────

const isChampionnat = (division) => /district/i.test(division || '');

const competitionBadge = (division) => {
  if (isChampionnat(division)) return { label: 'Champ.', color: '#15803d', bg: '#dcfce7' };
  return { label: 'Coupe', color: '#c2410c', bg: '#ffedd5' };
};

// Retourne 'd7' ou 'accession' pour les matchs SCR 3 championnat
const getSCR3Phase = (division) =>
  /accession/i.test(division || '') ? 'accession' : 'd7';

const getResultat = (match) => {
  if (match.score_scr > match.score_adv) return { label: 'V', cls: 'win' };
  if (match.score_scr < match.score_adv) return { label: 'D', cls: 'loss' };
  return { label: 'N', cls: 'draw' };
};

// ── Helper : noms des buteurs (slots non-vides, dans l'ordre) ─────────────────

const computeFinalButeurs = (slots) => slots.map(s => s.name).filter(Boolean);

// ── Sous-composant : tableau de matchs ────────────────────────────────────────

function MatchTable({ matches, onEdit, onDelete, showTeamCol = false, joueurs = [], pendingButeurs = {}, onSlotChange, onAddSlot, onRemoveSlot }) {
  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            {showTeamCol && <th>Équipe</th>}
            <th>Adversaire</th>
            <th>D/E</th>
            <th>Score</th>
            <th>Rés.</th>
            <th>Buteurs</th>
            <th>Compétition</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {matches.map(match => {
            const res = getResultat(match);
            const badge = competitionBadge(match.division);
            return (
              <tr key={match.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{formatDate(match.date)}</td>
                {showTeamCol && <td><strong>{match.equipe}</strong></td>}
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
                  <span className={`result-badge result-badge--${res.cls}`}>{res.label}</span>
                </td>
                <td style={{ fontSize: 12, maxWidth: 260 }}>
                  {(() => {
                    const slots = pendingButeurs[match.id] || [];
                    if (slots.length === 0) {
                      return <span style={{ color: 'var(--texte-gris)' }}>-</span>;
                    }
                    const hasEmptySlot = slots.some(s => !s.name);
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {slots.map((slot, i) => (
                          <div key={slot.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <select
                              className={`buteur-select${slot.name ? ' buteur-select--filled' : ''}`}
                              value={slot.name}
                              onChange={e => onSlotChange(match.id, slot.key, e.target.value)}
                            >
                              <option value="">But N°{i + 1} — Sélectionner</option>
                              {joueurs.map(j => {
                                const name = `${j.prenom} ${j.nom}`;
                                return <option key={j.id} value={name}>{name}</option>;
                              })}
                            </select>
                            {slot.name && (
                              <button
                                className="btn-add-buteur"
                                title={hasEmptySlot ? `Attribuer un 2ème but à ${slot.name}` : 'Tous les buts sont attribués'}
                                onClick={() => onAddSlot(match.id, slot.name)}
                                disabled={!hasEmptySlot}
                              >+</button>
                            )}
                            <button
                              className="btn-remove-buteur"
                              title={slot.name ? 'Retirer ce buteur' : ''}
                              onClick={() => onRemoveSlot(match.id, slot.key)}
                              disabled={!slot.name}
                            >−</button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </td>
                <td>
                  <span className="competition-badge" style={{ background: badge.bg, color: badge.color }}>
                    {badge.label}
                  </span>
                  <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--texte-gris)' }}>
                    {match.division || '-'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => onEdit(match)}>✏️</button>
                    <button className="btn btn-sm btn-danger" onClick={() => onDelete(match)}>🗑️</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────

export default function Resultats() {
  const [matches, setMatches]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showModal, setShowModal]       = useState(false);
  const [editMatch, setEditMatch]       = useState(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);
  const [alert, setAlert]               = useState(null);
  const [filterEquipe, setFilterEquipe] = useState('');
  const [scr3Phase, setScr3Phase]       = useState('all');
  const [clubs, setClubs]               = useState([]);
  const [joueurs, setJoueurs]           = useState([]);
  const [pendingButeurs, setPendingButeurs] = useState({});
  const [isSavingAll, setIsSavingAll]       = useState(false);
  const [showVisuels, setShowVisuels]   = useState(false);
  const [selectedIds, setSelectedIds]   = useState([]);
  const [generating, setGenerating]     = useState(false);
  const [visuel, setVisuel]             = useState(null);
  const [publishingVisuel, setPublishingVisuel] = useState(null);

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
  useEffect(() => { getClubs().then(r => setClubs(r.data)).catch(() => {}); }, []);
  useEffect(() => { getJoueurs().then(r => setJoueurs(r.data)).catch(() => {}); }, []);

  // Initialiser exactement score_scr slots par match (les N premiers remplis depuis buteurs)
  useEffect(() => {
    const init = {};
    for (const m of matches) {
      const existing = m.buteurs || [];
      const total = m.score_scr || 0;
      init[m.id] = Array.from({ length: total }, (_, i) => ({
        key: `${m.id}-${i}`,
        name: existing[i] || '',
      }));
    }
    setPendingButeurs(init);
  }, [matches]);

  // Réinitialiser le filtre SCR 3 quand on change d'équipe
  useEffect(() => {
    if (filterEquipe !== 'SCR 3') setScr3Phase('all');
  }, [filterEquipe]);

  const openCreate = () => { setEditMatch(null); setForm(EMPTY_FORM); setShowModal(true); };

  const openEdit = (match) => {
    setEditMatch(match);
    setForm({
      equipe:    match.equipe,
      adversaire: match.adversaire,
      date:      match.date ? match.date.slice(0, 10) : '',
      heure:     match.heure ? match.heure.slice(0, 5) : '',
      domicile:  match.domicile,
      division:  match.division || '',
      score_scr: match.score_scr || 0,
      score_adv: match.score_adv || 0,
      buteurs:   (match.buteurs || []).join(', '),
      statut:    'termine',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.adversaire.trim()) { showAlert('error', "Le nom de l'adversaire est requis"); return; }
    setSaving(true);
    try {
      const data = {
        ...form,
        score_scr: parseInt(form.score_scr) || 0,
        score_adv: parseInt(form.score_adv) || 0,
        buteurs: form.buteurs ? form.buteurs.split(',').map(b => b.trim()).filter(Boolean) : [],
      };
      if (editMatch) { await updateMatch(editMatch.id, data); showAlert('success', 'Résultat modifié'); }
      else           { await createMatch(data);               showAlert('success', 'Résultat ajouté'); }
      setShowModal(false);
      loadResults();
    } catch (err) {
      showAlert('error', err.response?.data?.error || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleSlotChange = (matchId, key, name) => {
    setPendingButeurs(prev => ({
      ...prev,
      [matchId]: (prev[matchId] || []).map(s => s.key === key ? { ...s, name } : s),
    }));
  };

  // Réaffecte le premier slot vide du match au joueur donné (bouton +)
  const handleAddSlot = (matchId, name) => {
    setPendingButeurs(prev => {
      const slots = prev[matchId] || [];
      const firstEmpty = slots.findIndex(s => !s.name);
      if (firstEmpty === -1) return prev;
      return {
        ...prev,
        [matchId]: slots.map((s, i) => i === firstEmpty ? { ...s, name } : s),
      };
    });
  };

  // Vide le slot (bouton -) — le nombre de lignes ne change pas
  const handleRemoveSlot = (matchId, key) => {
    setPendingButeurs(prev => ({
      ...prev,
      [matchId]: (prev[matchId] || []).map(s => s.key === key ? { ...s, name: '' } : s),
    }));
  };

  const handleValidateAll = async () => {
    const toSave = matches.filter(m =>
      JSON.stringify(computeFinalButeurs(pendingButeurs[m.id] || [])) !==
      JSON.stringify(m.buteurs || [])
    );
    if (toSave.length === 0) return;
    setIsSavingAll(true);
    try {
      await Promise.all(toSave.map(m =>
        updateButeurs(m.id, computeFinalButeurs(pendingButeurs[m.id] || []))
      ));
      showAlert('success', `${toSave.length} match${toSave.length > 1 ? 's' : ''} mis à jour ✓`);
      await loadResults();
    } catch {
      showAlert('error', 'Erreur lors de la mise à jour des buteurs');
    } finally {
      setIsSavingAll(false);
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

  const toggleResultatSelection = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 3 ? [...prev, id] : prev
    );
  };

  const handleGenerateVisuel = async () => {
    if (selectedIds.length === 0) { showAlert('error', 'Sélectionnez au moins un résultat'); return; }
    setGenerating(true); setVisuel(null);
    try {
      const res = await generateResultatWeekend(selectedIds);
      setVisuel(res.data);
      showAlert('success', 'Visuel généré avec succès');
    } catch (err) {
      showAlert('error', err.response?.data?.error || 'Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  };

  const handlePublishVisuel = async (type) => {
    if (!visuel) return;
    setPublishingVisuel(type);
    try {
      const fn = type === 'facebook' ? publishFacebook : publishInstagram;
      await fn({ image_url: visuel.full_url, message: 'Résultats du week-end SCR Roeschwoog' });
      showAlert('success', `Publié sur ${type === 'facebook' ? 'Facebook' : 'Instagram'} (simulation)`);
    } catch {
      showAlert('error', `Erreur lors de la publication ${type}`);
    } finally {
      setPublishingVisuel(null);
    }
  };

  // ── Données calculées ──────────────────────────────────────────────────────

  const byTeam = useMemo(() => {
    const base = filterEquipe ? matches.filter(m => m.equipe === filterEquipe) : matches;
    return base;
  }, [matches, filterEquipe]);

  const champMatches = useMemo(() => byTeam.filter(m => isChampionnat(m.division)), [byTeam]);
  const coupeMatches = useMemo(() => byTeam.filter(m => !isChampionnat(m.division)), [byTeam]);

  // Pour SCR 3 : sous-groupes de phase championnat
  const scr3ChampFiltered = useMemo(() => {
    if (filterEquipe !== 'SCR 3') return champMatches;
    if (scr3Phase === 'all') return champMatches;
    return champMatches.filter(m => getSCR3Phase(m.division) === scr3Phase);
  }, [champMatches, filterEquipe, scr3Phase]);

  // Stats sur les matchs de championnat uniquement
  const stats = useMemo(() => EQUIPES.map(eq => {
    const ms = matches.filter(m => m.equipe === eq && isChampionnat(m.division));
    if (ms.length === 0) return null;
    const v  = ms.filter(m => m.score_scr > m.score_adv).length;
    const n  = ms.filter(m => m.score_scr === m.score_adv).length;
    const d  = ms.filter(m => m.score_scr < m.score_adv).length;
    const bp = ms.reduce((s, m) => s + (m.score_scr || 0), 0);
    const bc = ms.reduce((s, m) => s + (m.score_adv || 0), 0);
    return { eq, j: ms.length, v, n, d, bp, bc, pts: v * 3 + n };
  }).filter(Boolean), [matches]);

  const showTeamCol = !filterEquipe;

  const pendingChangesCount = useMemo(() =>
    matches.filter(m =>
      JSON.stringify(computeFinalButeurs(pendingButeurs[m.id] || [])) !==
      JSON.stringify(m.buteurs || [])
    ).length,
  [matches, pendingButeurs]);

  // Matchs à afficher dans la section génération de visuels
  const visuelMatches = filterEquipe
    ? matches.filter(m => m.equipe === filterEquipe)
    : matches;

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ paddingBottom: pendingChangesCount > 0 || isSavingAll ? 80 : 0 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Résultats</h1>
          <p className="page-subtitle">Historique des matchs terminés</p>
        </div>
        <div className="actions-bar">
          <button className="btn btn-secondary" onClick={() => { setShowVisuels(v => !v); setVisuel(null); setSelectedIds([]); }}>
            Générer le visuel
          </button>
          <button className="btn btn-primary" onClick={openCreate}>+ Saisir résultat</button>
        </div>
      </div>

      {alert && (
        <div className={`alert alert-${alert.type}`}>
          {alert.type === 'success' ? '✅' : '❌'} {alert.msg}
        </div>
      )}

      {/* ── Filtre par équipe ── */}
      <div className="resultats-team-filter">
        {[{ val: '', label: 'Toutes' }, ...EQUIPES.map(eq => ({ val: eq, label: eq }))].map(({ val, label }) => (
          <button
            key={val}
            className={`resultats-team-btn ${filterEquipe === val ? 'active' : ''}`}
            onClick={() => setFilterEquipe(val)}
          >
            {label}
            {val && (
              <span className="resultats-team-count">
                {matches.filter(m => m.equipe === val).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Générateur de visuels ── */}
      {showVisuels && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <h2>Générer le visuel résultats</h2>
            <span style={{ fontSize: 13, color: '#888' }}>Sélectionnez jusqu'à 3 résultats</span>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {visuelMatches.length === 0 ? (
              <p style={{ color: '#888' }}>Aucun résultat disponible.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {visuelMatches.slice(0, 12).map(m => {
                  const res = getResultat(m);
                  const badge = competitionBadge(m.division);
                  return (
                    <label key={m.id} className={`visuel-match-row ${selectedIds.includes(m.id) ? 'selected' : ''}`}
                      style={{ opacity: !selectedIds.includes(m.id) && selectedIds.length >= 3 ? 0.5 : 1 }}>
                      <input type="checkbox" checked={selectedIds.includes(m.id)}
                        onChange={() => toggleResultatSelection(m.id)}
                        disabled={!selectedIds.includes(m.id) && selectedIds.length >= 3} />
                      <span className="competition-badge" style={{ background: badge.bg, color: badge.color, flexShrink: 0 }}>
                        {badge.label}
                      </span>
                      <strong style={{ minWidth: 52 }}>{m.equipe}</strong>
                      <span>vs <strong>{m.adversaire}</strong></span>
                      <span style={{
                        fontWeight: 700, fontFamily: 'Bebas Neue, sans-serif', fontSize: 18,
                        color: res.cls === 'win' ? 'var(--vert-success)' : res.cls === 'loss' ? 'var(--rouge)' : '#555',
                        minWidth: 50,
                      }}>
                        {m.score_scr} - {m.score_adv}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 13, color: '#888' }}>
                        {m.date ? new Date(m.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : ''}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            <button className="btn btn-primary" onClick={handleGenerateVisuel}
              disabled={generating || selectedIds.length === 0} style={{ marginBottom: visuel ? 24 : 0 }}>
              {generating ? '⏳ Génération en cours...' : `Générer (${selectedIds.length} match${selectedIds.length > 1 ? 's' : ''})`}
            </button>
            {visuel && (
              <div>
                <h3 style={{ marginBottom: 16, fontSize: 16 }}>Aperçu du visuel généré</h3>
                <div style={{ display: 'inline-block', textAlign: 'center' }}>
                  <img src={visuel.full_url} alt="Visuel résultats"
                    style={{ width: 320, borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', display: 'block', marginBottom: 12 }} />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <button className="btn btn-sm btn-primary" onClick={() => handlePublishVisuel('instagram')} disabled={publishingVisuel !== null} style={{ fontSize: 12 }}>
                      {publishingVisuel === 'instagram' ? '⏳' : '📸'} Instagram
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={() => handlePublishVisuel('facebook')} disabled={publishingVisuel !== null}
                      style={{ fontSize: 12, background: '#1877f2', borderColor: '#1877f2' }}>
                      {publishingVisuel === 'facebook' ? '⏳' : '👍'} Facebook
                    </button>
                    <a href={visuel.full_url} download className="btn btn-sm btn-ghost" style={{ fontSize: 12 }}>Télécharger</a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bilan de la saison (championnat uniquement) ── */}
      {stats.length > 0 && (
        <div className="section">
          <h2 className="section-title">
            Bilan championnat
            <span className="competition-badge" style={{ background: '#dcfce7', color: '#15803d', marginLeft: 10, fontSize: 12 }}>
              Hors coupes
            </span>
          </h2>
          <div className="card">
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Équipe</th><th>J</th><th>V</th><th>N</th>
                    <th>D</th><th>BP</th><th>BC</th><th>Pts</th>
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

      {/* ── Section Championnat ── */}
      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : (
        <>
          <div className="section">
            <div className="resultats-section-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                <span className="competition-badge competition-badge--champ">Championnat</span>
              </h2>

              {/* Sous-onglets SCR 3 uniquement */}
              {filterEquipe === 'SCR 3' && (
                <div className="scr3-phase-tabs">
                  {[
                    { val: 'all',       label: 'Toutes les phases' },
                    { val: 'd7',        label: 'District 7' },
                    { val: 'accession', label: 'Phase Accession' },
                  ].map(({ val, label }) => (
                    <button
                      key={val}
                      className={`scr3-phase-btn ${scr3Phase === val ? 'active' : ''}`}
                      onClick={() => setScr3Phase(val)}
                    >
                      {label}
                      {val !== 'all' && (
                        <span className="resultats-team-count">
                          {champMatches.filter(m => getSCR3Phase(m.division) === val).length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <span className="badge badge-termine">
                {scr3ChampFiltered.length} match{scr3ChampFiltered.length > 1 ? 's' : ''}
              </span>
            </div>

            <div className="card">
              {scr3ChampFiltered.length === 0 ? (
                <div className="empty-state">
                  <span className="icon">🏆</span>
                  <h3>Aucun résultat de championnat</h3>
                </div>
              ) : (
                <MatchTable matches={scr3ChampFiltered} onEdit={openEdit} onDelete={handleDelete} showTeamCol={showTeamCol} joueurs={joueurs} pendingButeurs={pendingButeurs} onSlotChange={handleSlotChange} onAddSlot={handleAddSlot} onRemoveSlot={handleRemoveSlot} />
              )}
            </div>
          </div>

          {/* ── Section Coupe ── */}
          {coupeMatches.length > 0 && (
            <div className="section">
              <div className="resultats-section-header">
                <h2 className="section-title" style={{ margin: 0 }}>
                  <span className="competition-badge competition-badge--coupe">Coupe</span>
                </h2>
                <span className="badge badge-termine">
                  {coupeMatches.length} match{coupeMatches.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="card">
                <MatchTable matches={coupeMatches} onEdit={openEdit} onDelete={handleDelete} showTeamCol={showTeamCol} joueurs={joueurs} pendingButeurs={pendingButeurs} onSlotChange={handleSlotChange} onAddSlot={handleAddSlot} onRemoveSlot={handleRemoveSlot} />
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Sticky bar : validation globale des buteurs ── */}
      {(pendingChangesCount > 0 || isSavingAll) && (
        <div className="buteurs-sticky-bar">
          <span className="buteurs-sticky-label">
            {isSavingAll
              ? 'Sauvegarde en cours...'
              : `${pendingChangesCount} modification${pendingChangesCount > 1 ? 's' : ''} en attente`}
          </span>
          <button
            className="btn-valider-global"
            onClick={handleValidateAll}
            disabled={isSavingAll || pendingChangesCount === 0}
          >
            {isSavingAll
              ? '⏳ Sauvegarde...'
              : `✓ Valider ${pendingChangesCount} modification${pendingChangesCount > 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* ── Modal saisie/édition ── */}
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
                  <label className="form-label">Compétition</label>
                  <input
                    className="form-control"
                    list="divisions-datalist"
                    value={form.division}
                    onChange={e => setForm(f => ({ ...f, division: e.target.value }))}
                    placeholder="Ex: District 1 Alsace"
                  />
                  <datalist id="divisions-datalist">
                    {DIVISIONS.map(d => <option key={d} value={d} />)}
                  </datalist>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Adversaire *</label>
                <input className="form-control" value={form.adversaire}
                  onChange={e => setForm(f => ({ ...f, adversaire: e.target.value }))}
                  placeholder="Nom du club adversaire"
                  list="clubs-datalist-res" autoComplete="off" />
                <datalist id="clubs-datalist-res">
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
