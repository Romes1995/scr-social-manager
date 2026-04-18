import { useState, useEffect, useCallback, useRef } from 'react';
import { getMatches, updateScore, finMatch, startMatch, resetMatch, getJoueurs, generateScoreLive, generateFinMatch, publishFacebook, publishInstagram, API_BASE_URL } from '../services/api';
import './ScoreLive.css';

export default function ScoreLive() {
  const [matches, setMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [joueurs, setJoueurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [confirmFin, setConfirmFin]     = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [finSteps, setFinSteps]           = useState(null); // workflow story fin de match
  const [startModal, setStartModal]       = useState(false); // modale story 0-0 démarrage
  const [startSteps, setStartSteps]       = useState(null);  // étapes publication démarrage
  const [startPreviewUrl, setStartPreviewUrl] = useState(null);
  const [startPreviewLoaded, setStartPreviewLoaded] = useState(false);
  const [goalModal, setGoalModal]     = useState(false);
  const [goalSteps, setGoalSteps]     = useState(null);   // null | [{label, status}]
  const [selectedJoueur, setSelectedJoueur] = useState(null);
  // Workflow adversaire : afficher bouton "Publier score live" après un but ADV
  const [advPublishModal, setAdvPublishModal] = useState(false);
  const [advPublishSteps, setAdvPublishSteps] = useState(null);
  // Aperçu avant publication
  const [previewImageUrl, setPreviewImageUrl]   = useState(null); // chemin relatif /uploads/...
  const [previewImgLoaded, setPreviewImgLoaded] = useState(false);
  const previewResolveRef = useRef(null);
  const waitForPublishConfirm = () => new Promise((resolve, reject) => {
    previewResolveRef.current = { resolve, reject };
  });
  const setPreview = (relUrl) => {
    setPreviewImgLoaded(false);
    setPreviewImageUrl(relUrl);
  };

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

  // Démarrage effectif (après aperçu ou si "Passer")
  const doStartMatch = async () => {
    if (!selectedMatch) return;
    try {
      const res = await startMatch(selectedMatch.id);
      setSelectedMatch(res.data);
      setMatches(prev => prev.map(m => m.id === res.data.id ? res.data : m));
      showAlert('success', 'Match démarré !');
    } catch (err) {
      showAlert('error', err.response?.data?.error || 'Erreur démarrage');
    }
  };

  const handleStartMatch = async () => {
    if (!selectedMatch) return;
    setUpdating(true);
    setStartModal(true);
    setStartSteps([{ label: 'Génération story 0-0', status: 'loading' }]);
    setStartPreviewUrl(null);
    setStartPreviewLoaded(false);

    try {
      const r = await generateScoreLive(selectedMatch.id);
      const relUrl = r.data.url;
      setStartSteps([{ label: 'Génération story 0-0', status: 'done' }]);
      setStartPreviewUrl(relUrl);
    } catch {
      setStartSteps([{ label: 'Génération story 0-0', status: 'error' }]);
      // Génération échouée → démarrer quand même après fermeture
    } finally {
      setUpdating(false);
    }
  };

  const handleStartPublish = async () => {
    // Publier la story 0-0 puis démarrer le match
    const steps = [
      { label: 'Publication Facebook',  status: 'loading' },
      { label: 'Publication Instagram', status: 'pending' },
    ];
    setStartSteps(steps);
    const absUrl = startPreviewUrl
      ? `${API_BASE_URL}${startPreviewUrl.startsWith('/') ? startPreviewUrl : '/' + startPreviewUrl}`
      : null;
    const msg = `${selectedMatch.equipe} 0 - 0 ${selectedMatch.adversaire}`;

    const upd = (i, status) => setStartSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status } : s));

    try { await publishFacebook({ image_url: absUrl, message: msg, is_story: true }); upd(0, 'done'); }
    catch { upd(0, 'error'); }

    upd(1, 'loading');
    try { await publishInstagram({ image_url: absUrl, caption: msg, is_story: true }); upd(1, 'done'); }
    catch { upd(1, 'error'); }

    await doStartMatch();
    setStartModal(false);
    setStartSteps(null);
    setStartPreviewUrl(null);
  };

  const handleStartSkip = async () => {
    setStartModal(false);
    setStartSteps(null);
    setStartPreviewUrl(null);
    setUpdating(true);
    await doStartMatch();
    setUpdating(false);
  };

  const handleFinMatch = async () => {
    if (!selectedMatch) return;
    setConfirmFin(false);
    setUpdating(true);

    // Étapes : génération story + publications + verrouillage
    const steps = [
      { label: 'Génération story fin de match', status: 'pending' },
      { label: 'Publication Facebook',          status: 'pending' },
      { label: 'Publication Instagram',         status: 'pending' },
      { label: 'Verrouillage du score',         status: 'pending' },
    ];
    setFinSteps([...steps]);

    const upd = (i, status) => setFinSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status } : s));

    try {
      // 1. Générer la story fin de match
      upd(0, 'loading');
      let finUrl = null, finRelUrl = null;
      try {
        const r = await generateFinMatch(selectedMatch.id);
        finUrl    = r.data.full_url || r.data.url;
        finRelUrl = r.data.url;
        upd(0, 'done');
      } catch (e) { upd(0, 'error'); throw e; }

      // Aperçu avant publication
      if (finRelUrl) {
        setPreview(finRelUrl);
        try {
          await waitForPublishConfirm();
        } catch {
          setPreviewImageUrl(null);
          setFinSteps(null);
          setUpdating(false);
          return;
        }
        setPreviewImageUrl(null);
      }

      const msg = `FIN DE MATCH — ${selectedMatch.equipe} ${selectedMatch.score_scr ?? 0} - ${selectedMatch.score_adv ?? 0} ${selectedMatch.adversaire}`;

      // 2. Publication Facebook
      upd(1, 'loading');
      try {
        await publishFacebook({ image_url: finUrl, message: msg, is_story: true });
        upd(1, 'done');
      } catch { upd(1, 'error'); }

      // 3. Publication Instagram
      upd(2, 'loading');
      try {
        await publishInstagram({ image_url: finUrl, caption: msg, is_story: true });
        upd(2, 'done');
      } catch { upd(2, 'error'); }

      // 4. Verrouiller le score
      upd(3, 'loading');
      try {
        const res = await finMatch(selectedMatch.id);
        upd(3, 'done');
        showAlert('success', `Match terminé ! ${selectedMatch.equipe} ${res.data.match.score_scr} - ${res.data.match.score_adv} ${selectedMatch.adversaire}`);
        setSelectedMatch(null);
        setMatches(prev => prev.filter(m => m.id !== selectedMatch.id));
      } catch (e) { upd(3, 'error'); throw e; }

    } catch (err) {
      showAlert('error', err.response?.data?.error || 'Erreur fin de match');
    } finally {
      setUpdating(false);
    }
  };

  const handleReset = async () => {
    if (!selectedMatch) return;
    setUpdating(true);
    try {
      const res = await resetMatch(selectedMatch.id);
      setSelectedMatch(res.data.match);
      setMatches(prev => prev.map(m => m.id === res.data.match.id ? res.data.match : m));
      setConfirmReset(false);
      showAlert('success', 'Match réinitialisé : score 0-0, statut programmé');
    } catch (err) {
      showAlert('error', err.response?.data?.error || 'Erreur réinitialisation');
    } finally {
      setUpdating(false);
    }
  };

  const handleSelectJoueur = async (joueur) => {
    const nomComplet = `${joueur.prenom} ${joueur.nom}`;
    await handleAction('add_buteur', { buteur: nomComplet });
  };

  // But adversaire : incrémente le score + affiche le bouton de publication
  const handleGoalAdv = async () => {
    await handleAction('increment_adv');
    setAdvPublishSteps(null);
    setAdvPublishModal(true);
  };

  // Workflow publication score live adversaire (3 étapes, pas de vidéo)
  const handlePublishAdvScore = async () => {
    if (!selectedMatch) return;
    const steps = [
      { label: 'Génération score live',            status: 'pending' },
      { label: 'Publication score live Facebook',  status: 'pending' },
      { label: 'Publication score live Instagram', status: 'pending' },
    ];
    setAdvPublishSteps([...steps]);

    const run = async (idx, fn) => {
      steps[idx].status = 'loading';
      setAdvPublishSteps([...steps]);
      try { await fn(); steps[idx].status = 'done'; }
      catch { steps[idx].status = 'error'; }
      setAdvPublishSteps([...steps]);
      return steps[idx].status === 'done';
    };

    let scoreLiveUrl = null;
    let scoreLiveRelUrl = null;
    await run(0, async () => {
      const res = await generateScoreLive(selectedMatch.id);
      scoreLiveUrl    = res.data.full_url || res.data.url;
      scoreLiveRelUrl = res.data.url;
    });

    // Aperçu avant publication
    if (scoreLiveRelUrl) {
      setPreview(scoreLiveRelUrl);
      try {
        await waitForPublishConfirm();
      } catch {
        // Annulé par l'utilisateur — score déjà incrémenté, pas de publication
        setPreviewImageUrl(null);
        return;
      }
      setPreviewImageUrl(null);
    }

    const msg = `${selectedMatch.equipe} ${selectedMatch.score_scr ?? 0} - ${selectedMatch.score_adv ?? 0} ${selectedMatch.adversaire}`;
    await run(1, () => {
      if (!scoreLiveUrl) throw new Error('Pas d\'image');
      return publishFacebook({ image_url: scoreLiveUrl, message: msg });
    });
    await run(2, () => {
      if (!scoreLiveUrl) throw new Error('Pas d\'image');
      return publishInstagram({ image_url: scoreLiveUrl, message: msg });
    });
  };

  // Workflow complet : But SCR → 6 étapes
  const handleGoalSCR = async () => {
    if (!selectedJoueur || !selectedMatch) return;
    const nomComplet = `${selectedJoueur.prenom} ${selectedJoueur.nom}`;
    const videoUrl   = selectedJoueur.video_celebration_url
      ? `${API_BASE_URL}${selectedJoueur.video_celebration_url}`
      : null;

    const steps = [
      { label: 'Enregistrement du but',                status: 'pending' },
      { label: 'Publication vidéo célébration Facebook', status: 'pending' },
      { label: 'Publication vidéo célébration Instagram', status: 'pending' },
      { label: 'Génération score live',                status: 'pending' },
      { label: 'Publication score live Facebook',      status: 'pending' },
      { label: 'Publication score live Instagram',     status: 'pending' },
    ];
    setGoalSteps([...steps]);

    const run = async (idx, fn) => {
      steps[idx].status = 'loading';
      setGoalSteps([...steps]);
      try { await fn(); steps[idx].status = 'done'; }
      catch { steps[idx].status = 'error'; }
      setGoalSteps([...steps]);
      return steps[idx].status === 'done';
    };

    // Étape 0 : enregistrer le but (bloquant — si ça échoue on s'arrête)
    const ok0 = await run(0, async () => {
      const res = await updateScore(selectedMatch.id, { action: 'goal_scr', buteur: nomComplet });
      setSelectedMatch(res.data);
      setMatches(prev => prev.map(m => m.id === res.data.id ? res.data : m));
    });
    if (!ok0) return;

    const celebMsg = `But de ${nomComplet} !`;

    // Étapes 1-2 : publication vidéo célébration (non bloquant)
    await run(1, () => publishFacebook({ video_url: videoUrl, message: celebMsg }));
    await run(2, () => publishInstagram({ video_url: videoUrl, message: celebMsg }));

    // Étape 3 : générer le score live
    let scoreLiveUrl = null;
    let scoreLiveRelUrl = null;
    await run(3, async () => {
      const res = await generateScoreLive(selectedMatch.id);
      scoreLiveUrl    = res.data.full_url || res.data.url;
      scoreLiveRelUrl = res.data.url;
    });

    // Aperçu avant publication
    if (scoreLiveRelUrl) {
      setPreview(scoreLiveRelUrl);
      try {
        await waitForPublishConfirm();
      } catch {
        // Annulé — score déjà enregistré, on ferme sans publier
        setPreviewImageUrl(null);
        return;
      }
      setPreviewImageUrl(null);
    }

    const storyMsg = `SCR ${selectedMatch.score_scr ?? 0} - ${selectedMatch.score_adv ?? 0} ${selectedMatch.adversaire}`;

    // Étapes 4-5 : publication score live (skip si génération échouée)
    await run(4, () => {
      if (!scoreLiveUrl) throw new Error('Pas d\'image');
      return publishFacebook({ image_url: scoreLiveUrl, message: storyMsg });
    });
    await run(5, () => {
      if (!scoreLiveUrl) throw new Error('Pas d\'image');
      return publishInstagram({ image_url: scoreLiveUrl, message: storyMsg });
    });
  };

  const openGoalModal = () => {
    setSelectedJoueur(joueurs.length > 0 ? joueurs[0] : null);
    setGoalSteps(null);
    setGoalModal(true);
  };

  const closeGoalModal = () => {
    setGoalModal(false);
    setGoalSteps(null);
    setSelectedJoueur(null);
  };

  const stepIcon = (status) => {
    if (status === 'pending') return '⬜';
    if (status === 'loading') return '⏳';
    if (status === 'done')    return '✅';
    return '❌';
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
                        <button className="score-btn plus" onClick={openGoalModal} disabled={updating} title="But SCR (workflow complet)">+</button>
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
                        <button className="score-btn plus" onClick={handleGoalAdv} disabled={updating} title="But adversaire">+</button>
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
                  {selectedMatch.statut === 'en_cours' && !confirmFin && !confirmReset && (
                    <>
                      <button className="btn btn-danger" onClick={() => setConfirmFin(true)} disabled={updating}>
                        🔴 Fin de match
                      </button>
                      <button className="btn btn-ghost" onClick={() => setConfirmReset(true)} disabled={updating} style={{ fontSize: 13 }}>
                        🔄 Reset
                      </button>
                    </>
                  )}
                  {(selectedMatch.statut === 'programme') && !confirmReset && (
                    <button className="btn btn-ghost" onClick={() => setConfirmReset(true)} disabled={updating} style={{ fontSize: 13 }}>
                      🔄 Reset
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
                  {confirmReset && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>Remettre à 0-0 et statut programmé ?</span>
                      <button className="btn btn-secondary" onClick={handleReset} disabled={updating}>
                        ✔ Confirmer
                      </button>
                      <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
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

      {/* Modale "But adversaire — Publier score live" */}
      {advPublishModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !advPublishSteps && setAdvPublishModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>But {selectedMatch?.adversaire} — Publier score live</h3>
              {!advPublishSteps && <button className="btn-icon" onClick={() => setAdvPublishModal(false)}>✕</button>}
            </div>
            <div className="modal-body">
              {!advPublishSteps ? (
                <p style={{ fontSize: 14, color: '#555' }}>
                  Génère et publie la story score live ({selectedMatch?.equipe} {selectedMatch?.score_scr ?? 0} – {selectedMatch?.score_adv ?? 0} {selectedMatch?.adversaire}) sur Facebook et Instagram.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
                  {advPublishSteps.map((step, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15 }}>
                      <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{stepIcon(step.status)}</span>
                      <span style={{ color: step.status === 'error' ? '#c0392b' : step.status === 'done' ? '#1a6b3c' : '#333' }}>
                        {step.label}
                      </span>
                    </div>
                  ))}
                  {previewImageUrl && (
                    <div style={{ marginTop: 16, textAlign: 'center' }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 8 }}>
                        Aperçu — confirmer avant publication :
                      </p>
                      <div style={{ position: 'relative', display: 'inline-block', minWidth: 60, minHeight: 60 }}>
                        {!previewImgLoaded && (
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div className="spinner" style={{ width: 28, height: 28 }} />
                          </div>
                        )}
                        <img
                          src={`${API_BASE_URL}${previewImageUrl.startsWith('/') ? previewImageUrl : '/' + previewImageUrl}`}
                          alt="Aperçu score live"
                          onLoad={() => setPreviewImgLoaded(true)}
                          onError={e => { e.target.style.opacity = '0.3'; setPreviewImgLoaded(true); }}
                          style={{
                            display: 'block',
                            maxWidth: 300,
                            width: '100%',
                            borderRadius: 10,
                            border: '1px solid #e0e0e0',
                            objectFit: 'contain',
                            opacity: previewImgLoaded ? 1 : 0,
                            transition: 'opacity 0.2s',
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {!previewImageUrl && advPublishSteps.every(s => s.status === 'done' || s.status === 'error') && (
                    <p style={{ marginTop: 8, fontSize: 13, color: '#888' }}>
                      {advPublishSteps.every(s => s.status === 'done') ? '✔ Publié !' : 'Certaines étapes ont échoué.'}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              {!advPublishSteps ? (
                <>
                  <button className="btn btn-ghost" onClick={() => setAdvPublishModal(false)}>Annuler</button>
                  <button className="btn btn-primary" onClick={handlePublishAdvScore}>
                    Publier le score live
                  </button>
                </>
              ) : previewImageUrl ? (
                <>
                  <button className="btn btn-ghost" onClick={() => { previewResolveRef.current?.reject(); setAdvPublishModal(false); setAdvPublishSteps(null); }}>
                    Annuler la publication
                  </button>
                  <a
                    className="btn btn-secondary"
                    href={`${API_BASE_URL}${previewImageUrl.startsWith('/') ? previewImageUrl : '/' + previewImageUrl}`}
                    download
                  >
                    ⬇ Télécharger
                  </a>
                  <button className="btn btn-primary" onClick={() => previewResolveRef.current?.resolve()}>
                    Confirmer et publier
                  </button>
                </>
              ) : advPublishSteps.every(s => s.status === 'done' || s.status === 'error') ? (
                <button className="btn btn-primary" onClick={() => { setAdvPublishModal(false); setAdvPublishSteps(null); }}>Fermer</button>
              ) : (
                <button className="btn btn-ghost" disabled>En cours...</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modale "But SCR" */}
      {goalModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !goalSteps && closeGoalModal()}>
          <div className="modal">
            <div className="modal-header">
              <h3>But SCR !</h3>
              {!goalSteps && <button className="btn-icon" onClick={closeGoalModal}>✕</button>}
            </div>
            <div className="modal-body">
              {!goalSteps ? (
                <>
                  <div className="form-group">
                    <label className="form-label">Buteur</label>
                    {joueurs.length === 0 ? (
                      <p style={{ color: '#888', fontSize: 14 }}>Aucun joueur disponible — ajoutez des joueurs dans Listes.</p>
                    ) : (
                      <select className="form-control form-select"
                        value={selectedJoueur?.id ?? ''}
                        onChange={e => setSelectedJoueur(joueurs.find(j => j.id === Number(e.target.value)) || null)}>
                        {joueurs.map(j => (
                          <option key={j.id} value={j.id}>
                            {j.prenom} {j.nom}{j.video_celebration_url ? ' 🎬' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    {selectedJoueur && !selectedJoueur.video_celebration_url && (
                      <p style={{ fontSize: 12, color: '#e67e22', marginTop: 6 }}>
                        Ce joueur n'a pas de vidéo de célébration — les étapes de publication vidéo seront simulées sans contenu.
                      </p>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: '#666', marginTop: 8 }}>
                    Enregistre le but, publie la vidéo de célébration sur Facebook et Instagram, génère le score live et le publie sur les deux réseaux.
                  </p>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
                  {goalSteps.map((step, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15 }}>
                      <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{stepIcon(step.status)}</span>
                      <span style={{ color: step.status === 'error' ? '#c0392b' : step.status === 'done' ? '#1a6b3c' : '#333' }}>
                        {step.label}
                      </span>
                    </div>
                  ))}
                  {previewImageUrl && (
                    <div style={{ marginTop: 16, textAlign: 'center' }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 8 }}>
                        Aperçu — confirmer avant publication :
                      </p>
                      <div style={{ position: 'relative', display: 'inline-block', minWidth: 60, minHeight: 60 }}>
                        {!previewImgLoaded && (
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div className="spinner" style={{ width: 28, height: 28 }} />
                          </div>
                        )}
                        <img
                          src={`${API_BASE_URL}${previewImageUrl.startsWith('/') ? previewImageUrl : '/' + previewImageUrl}`}
                          alt="Aperçu score live"
                          onLoad={() => setPreviewImgLoaded(true)}
                          onError={e => { e.target.style.opacity = '0.3'; setPreviewImgLoaded(true); }}
                          style={{
                            display: 'block',
                            maxWidth: 300,
                            width: '100%',
                            borderRadius: 10,
                            border: '1px solid #e0e0e0',
                            objectFit: 'contain',
                            opacity: previewImgLoaded ? 1 : 0,
                            transition: 'opacity 0.2s',
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {!previewImageUrl && goalSteps.every(s => s.status === 'done' || s.status === 'error') && (
                    <p style={{ marginTop: 8, fontSize: 13, color: '#888' }}>
                      {goalSteps.every(s => s.status === 'done') ? '✔ Tout est terminé !' : 'Certaines étapes ont échoué (voir ci-dessus).'}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              {!goalSteps ? (
                <>
                  <button className="btn btn-ghost" onClick={closeGoalModal}>Annuler</button>
                  <button className="btn btn-primary" onClick={handleGoalSCR} disabled={!selectedJoueur || joueurs.length === 0}>
                    ⚽ Confirmer le but
                  </button>
                </>
              ) : previewImageUrl ? (
                <>
                  <button className="btn btn-ghost" onClick={() => { previewResolveRef.current?.reject(); closeGoalModal(); }}>
                    Annuler la publication
                  </button>
                  <a
                    className="btn btn-secondary"
                    href={`${API_BASE_URL}${previewImageUrl.startsWith('/') ? previewImageUrl : '/' + previewImageUrl}`}
                    download
                  >
                    ⬇ Télécharger
                  </a>
                  <button className="btn btn-primary" onClick={() => previewResolveRef.current?.resolve()}>
                    Confirmer et publier
                  </button>
                </>
              ) : goalSteps.every(s => s.status === 'done' || s.status === 'error') ? (
                <button className="btn btn-primary" onClick={closeGoalModal}>Fermer</button>
              ) : (
                <button className="btn btn-ghost" disabled>En cours...</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modale "Démarrage du match" — story 0-0 */}
      {startModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>▶ Démarrer le match</h3>
            </div>
            <div className="modal-body">
              {startSteps && startSteps[0].status === 'loading' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                  <div className="spinner" style={{ width: 18, height: 18 }} />
                  Génération de la story 0-0...
                </div>
              )}
              {startSteps && startSteps[0].status === 'error' && (
                <p style={{ color: '#c0392b', fontSize: 14 }}>La génération a échoué. Tu peux démarrer le match sans publier.</p>
              )}
              {startSteps && startSteps.length > 1 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
                  {startSteps.map((step, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 14 }}>
                      {step.status === 'done'    && <span style={{ color: '#1a6b3c' }}>✔</span>}
                      {step.status === 'error'   && <span style={{ color: '#c0392b' }}>✗</span>}
                      {step.status === 'loading' && <div className="spinner" style={{ width: 16, height: 16, flexShrink: 0 }} />}
                      {step.status === 'pending' && <span style={{ color: '#aaa', fontSize: 12 }}>○</span>}
                      <span style={{ color: step.status === 'error' ? '#c0392b' : step.status === 'done' ? '#1a6b3c' : 'inherit' }}>
                        {step.label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {startPreviewUrl && startSteps?.length === 1 && (
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <p style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>Aperçu — Story 0-0</p>
                  {!startPreviewLoaded && <div className="spinner" style={{ width: 28, height: 28, margin: '0 auto 8px' }} />}
                  <img
                    src={`${API_BASE_URL}${startPreviewUrl.startsWith('/') ? startPreviewUrl : '/' + startPreviewUrl}`}
                    onLoad={() => setStartPreviewLoaded(true)}
                    alt="Aperçu 0-0"
                    style={{ maxWidth: 260, borderRadius: 10, border: '1px solid #e0e0e0', objectFit: 'contain', opacity: startPreviewLoaded ? 1 : 0, transition: 'opacity 0.2s', display: 'block', margin: '0 auto' }}
                  />
                </div>
              )}
            </div>
            <div className="modal-footer">
              {/* Publication en cours */}
              {startSteps && startSteps.length > 1 && !startSteps.every(s => s.status === 'done' || s.status === 'error') && (
                <button className="btn btn-ghost" disabled>En cours...</button>
              )}
              {/* Publication terminée */}
              {startSteps && startSteps.length > 1 && startSteps.every(s => s.status === 'done' || s.status === 'error') && (
                <button className="btn btn-primary" onClick={async () => { await doStartMatch(); setStartModal(false); setStartSteps(null); setStartPreviewUrl(null); }}>
                  Démarrer le match
                </button>
              )}
              {/* Aperçu prêt → Publier ou Passer */}
              {startPreviewUrl && startSteps?.length === 1 && (
                <>
                  <button className="btn btn-ghost" onClick={handleStartSkip}>
                    Passer (sans publier)
                  </button>
                  <a
                    className="btn btn-secondary"
                    href={`${API_BASE_URL}${startPreviewUrl.startsWith('/') ? startPreviewUrl : '/' + startPreviewUrl}`}
                    download
                  >
                    ⬇ Télécharger
                  </a>
                  <button className="btn btn-primary" onClick={handleStartPublish}>
                    Publier et démarrer
                  </button>
                </>
              )}
              {/* Génération échouée */}
              {startSteps && startSteps[0].status === 'error' && (
                <button className="btn btn-primary" onClick={handleStartSkip}>
                  Démarrer sans publier
                </button>
              )}
              {/* Génération en cours */}
              {startSteps && startSteps[0].status === 'loading' && (
                <button className="btn btn-ghost" disabled>Génération...</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modale "Fin de match" — story + publication */}
      {finSteps && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>🔴 Fin de match</h3>
            </div>
            <div className="modal-body">
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {finSteps.map((step, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 14 }}>
                    {step.status === 'done'    && <span style={{ color: '#1a6b3c' }}>✔</span>}
                    {step.status === 'error'   && <span style={{ color: '#c0392b' }}>✗</span>}
                    {step.status === 'loading' && <div className="spinner" style={{ width: 16, height: 16, flexShrink: 0 }} />}
                    {step.status === 'pending' && <span style={{ color: '#aaa', fontSize: 12 }}>○</span>}
                    <span style={{ color: step.status === 'error' ? '#c0392b' : step.status === 'done' ? '#1a6b3c' : 'inherit' }}>
                      {step.label}
                    </span>
                  </li>
                ))}
              </ul>
              {previewImageUrl && (
                <div style={{ marginTop: 16, textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>Aperçu — Story fin de match</p>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    {!previewImgLoaded && <div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} />}
                    <img
                      src={`${API_BASE_URL}${previewImageUrl.startsWith('/') ? previewImageUrl : '/' + previewImageUrl}`}
                      onLoad={() => setPreviewImgLoaded(true)}
                      alt="Aperçu fin de match"
                      style={{ maxWidth: 260, borderRadius: 10, border: '1px solid #e0e0e0', objectFit: 'contain', opacity: previewImgLoaded ? 1 : 0, transition: 'opacity 0.2s', display: 'block' }}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {previewImageUrl ? (
                <>
                  <button className="btn btn-ghost" onClick={() => { previewResolveRef.current?.reject(); }}>
                    Annuler la publication
                  </button>
                  <a
                    className="btn btn-secondary"
                    href={`${API_BASE_URL}${previewImageUrl.startsWith('/') ? previewImageUrl : '/' + previewImageUrl}`}
                    download
                  >
                    ⬇ Télécharger
                  </a>
                  <button className="btn btn-primary" onClick={() => previewResolveRef.current?.resolve()}>
                    Confirmer et publier
                  </button>
                </>
              ) : finSteps.every(s => s.status === 'done' || s.status === 'error') ? (
                <button className="btn btn-primary" onClick={() => setFinSteps(null)}>Fermer</button>
              ) : (
                <button className="btn btn-ghost" disabled>En cours...</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
