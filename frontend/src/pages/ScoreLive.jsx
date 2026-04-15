import { useState, useEffect, useCallback } from 'react';
import { getMatches, updateScore, finMatch, startMatch, getJoueurs } from '../services/api';
import './ScoreLive.css';

export default function ScoreLive() {
  const [matches, setMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [joueurs, setJoueurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [confirmFin, setConfirmFin] = useState(false);

  const showAlert = (type, msg) => {
    setAlert({ type, msg });
    setTimeout(() => setAlert(null), 3000);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [matchRes, joueurRes] = await Promise.all([
        getMatches(),
        getJoueurs(),
      ]);
      const activeMatches = matchRes.data.filter(m => m.statut !== 'termine');
      setMatches(activeMatches);
      setJoueurs(joueurRes.data);

      // Auto-select le match en cours s'il y en a un
      const enCours = activeMatches.find(m => m.statut === 'en_cours');
      if (enCours && !selectedMatch) setSelectedMatch(enCours);
    } catch {
      showAlert('error', 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Rafraîchir le match sélectionné toutes les 5 secondes si en cours
  useEffect(() => {
    if (!selectedMatch || selectedMatch.statut !== 'en_cours') return;
    const interval = setInterval(async () => {
      try {
        const res = await getMatches();
        const updated = res.data.find(m => m.id === selectedMatch.id);
        if (updated) setSelectedMatch(updated);
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedMatch?.id, selectedMatch?.statut]);

  const handleAction = async (action, extra = {}) => {
    if (!selectedMatch) return;
    setUpdating(true);
    try {
      const res = await updateScore(selectedMatch.id, { action, ...extra });
      setSelectedMatch(res.data);
      // Sync dans la liste
      setMatches(prev => prev.map(m => m.id === res.data.id ? res.data : m));
    } catch (err) {
      showAlert('error', err.response?.data?.error || 'Erreur mise à jour score');
    } finally {
      setUpdating(false);
    }
  };

  const handleStartMatch = async () => {
    if (!selectedMatch) return;
    setUpdating(true);
    try {
      const res = await startMatch(selectedMatch.id);
      setSelectedMatch(res.data);
      setMatches(prev => prev.map(m => m.id === res.data.id ? res.data : m));
      showAlert('success', 'Match démarré !');
    } catch (err) {
      showAlert('error', err.response?.data?.error || 'Erreur');
    } finally {
      setUpdating(false);
    }
  };

  const handleFinMatch = async () => {
    if (!selectedMatch) return;
    setUpdating(true);
    try {
      const res = await finMatch(selectedMatch.id);
      showAlert('success', `Match terminé ! ${selectedMatch.equipe} ${res.data.match.score_scr} - ${res.data.match.score_adv} ${selectedMatch.adversaire}`);
      setSelectedMatch(null);
      setMatches(prev => prev.filter(m => m.id !== selectedMatch.id));
      setConfirmFin(false);
    } catch (err) {
      showAlert('error', err.response?.data?.error || 'Erreur fin de match');
    } finally {
      setUpdating(false);
    }
  };

  const handleSelectJoueur = async (joueur) => {
    const nomComplet = `${joueur.prenom} ${joueur.nom}`;
    await handleAction('add_buteur', { buteur: nomComplet });
  };

  const handleRemoveButeur = async (nom) => {
    await handleAction('remove_buteur', { buteur: nom });
  };

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });
  };

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner"></div>
        <span>Chargement...</span>
      </div>
    );
  }

  return (
    <div className="score-live-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Score Live</h1>
          <p className="page-subtitle">Suivi en temps réel des matchs</p>
        </div>
      </div>

      {alert && (
        <div className={`alert alert-${alert.type}`}>
          {alert.type === 'success' ? '✅' : '❌'} {alert.msg}
        </div>
      )}

      <div className="score-layout">
        {/* Sélection du match */}
        <div className="score-sidebar card">
          <div className="card-header">
            <h2>Matchs du jour</h2>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {matches.length === 0 ? (
              <div className="empty-state">
                <span className="icon">⚽</span>
                <p>Aucun match en cours ou prévu</p>
              </div>
            ) : (
              <ul className="match-list">
                {matches.map(match => (
                  <li
                    key={match.id}
                    className={`match-item ${selectedMatch?.id === match.id ? 'selected' : ''} ${match.statut}`}
                    onClick={() => setSelectedMatch(match)}
                  >
                    <div className="match-item-header">
                      <strong>{match.equipe}</strong>
                      <span className={`badge badge-${match.statut}`}>
                        {match.statut === 'programme' ? '📅' : '⚡'} {match.statut === 'en_cours' ? 'En cours' : 'Programmé'}
                      </span>
                    </div>
                    <div className="match-item-teams">
                      vs {match.adversaire}
                    </div>
                    <div className="match-item-info">
                      {formatDate(match.date)} {match.heure ? `• ${match.heure.slice(0,5)}` : ''}
                    </div>
                    {match.statut === 'en_cours' && (
                      <div className="match-item-score">
                        {match.score_scr} - {match.score_adv}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Panneau score */}
        <div className="score-main">
          {!selectedMatch ? (
            <div className="card">
              <div className="empty-state" style={{ padding: '80px 24px' }}>
                <span className="icon">⚡</span>
                <h3>Sélectionnez un match</h3>
                <p>Choisissez un match dans la liste pour gérer le score</p>
              </div>
            </div>
          ) : (
            <>
              {/* Scoreboard */}
              <div className="card scoreboard">
                <div className="scoreboard-header">
                  <span className={`badge badge-${selectedMatch.statut}`} style={{ fontSize: 14 }}>
                    {selectedMatch.statut === 'en_cours' ? '⚡ EN COURS' : '📅 PROGRAMMÉ'}
                  </span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                    {selectedMatch.division} • {formatDate(selectedMatch.date)}
                    {selectedMatch.heure ? ` • ${selectedMatch.heure.slice(0,5)}` : ''}
                  </span>
                </div>

                <div className="scoreboard-teams">
                  <div className="team-block team-scr">
                    <div className="team-name">{selectedMatch.equipe}</div>
                    <div className="team-score">{selectedMatch.score_scr ?? 0}</div>
                    {selectedMatch.statut === 'en_cours' && (
                      <div className="score-controls">
                        <button className="score-btn minus" onClick={() => handleAction('decrement_scr')} disabled={updating}>−</button>
                        <button className="score-btn plus" onClick={() => handleAction('increment_scr')} disabled={updating}>+</button>
                      </div>
                    )}
                  </div>

                  <div className="score-separator">
                    <span>VS</span>
                    {selectedMatch.statut === 'en_cours' && (
                      <div className="live-indicator">LIVE</div>
                    )}
                  </div>

                  <div className="team-block team-adv">
                    <div className="team-name">{selectedMatch.adversaire}</div>
                    <div className="team-score">{selectedMatch.score_adv ?? 0}</div>
                    {selectedMatch.statut === 'en_cours' && (
                      <div className="score-controls">
                        <button className="score-btn minus" onClick={() => handleAction('decrement_adv')} disabled={updating}>−</button>
                        <button className="score-btn plus" onClick={() => handleAction('increment_adv')} disabled={updating}>+</button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="scoreboard-actions">
                  {selectedMatch.statut === 'programme' && (
                    <button className="btn btn-secondary btn-lg" onClick={handleStartMatch} disabled={updating}>
                      ▶ Démarrer le match
                    </button>
                  )}
                  {selectedMatch.statut === 'en_cours' && !confirmFin && (
                    <button className="btn btn-danger" onClick={() => setConfirmFin(true)} disabled={updating}>
                      🔴 Fin de match
                    </button>
                  )}
                  {confirmFin && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>Confirmer la fin du match ?</span>
                      <button className="btn btn-danger" onClick={handleFinMatch} disabled={updating}>
                        ✔ Confirmer
                      </button>
                      <button className="btn btn-ghost" onClick={() => setConfirmFin(false)}>
                        Annuler
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Buteurs */}
              {selectedMatch.statut === 'en_cours' && (
                <div className="grid-2" style={{ marginTop: 16 }}>
                  {/* Liste des buteurs enregistrés */}
                  <div className="card">
                    <div className="card-header">
                      <h2>⚽ Buteurs SCR</h2>
                      <span className="badge badge-programme">{(selectedMatch.buteurs || []).length}</span>
                    </div>
                    <div className="card-body">
                      {(selectedMatch.buteurs || []).length === 0 ? (
                        <p style={{ color: 'var(--texte-gris)', fontSize: 14 }}>Aucun buteur enregistré</p>
                      ) : (
                        <ul className="buteur-list">
                          {selectedMatch.buteurs.map((b, i) => (
                            <li key={i} className="buteur-item">
                              <span>⚽ {b}</span>
                              <button
                                className="btn btn-sm btn-icon"
                                onClick={() => handleRemoveButeur(b)}
                                title="Retirer"
                              >✕</button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Sélection joueurs */}
                  <div className="card">
                    <div className="card-header">
                      <h2>Ajouter buteur</h2>
                    </div>
                    <div className="card-body">
                      {joueurs.length === 0 ? (
                        <p style={{ color: 'var(--texte-gris)', fontSize: 14 }}>
                          Aucun joueur dans la liste. Ajoutez des joueurs dans l'onglet Listes.
                        </p>
                      ) : (
                        <ul className="joueur-picker">
                          {joueurs.map(j => (
                            <li key={j.id}>
                              <button
                                className="btn btn-ghost w-full"
                                style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                                onClick={() => handleSelectJoueur(j)}
                                disabled={updating}
                              >
                                ⚽ {j.prenom} {j.nom}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
