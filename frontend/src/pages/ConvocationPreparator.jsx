import { useState, useEffect, useCallback, useMemo } from 'react';
import { getConvocationMatchesWeekend, getConvocationJoueurs, generateConvocationVisual, publishFacebook, publishInstagram } from '../services/api';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function parseLocalDate(dateVal) {
  if (!dateVal) return null;
  const s = typeof dateVal === 'string' ? dateVal.slice(0, 10) : dateVal.toISOString().slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtTime(heureStr) {
  if (!heureStr) return '';
  const [h, m] = heureStr.split(':').map(Number);
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

function calcRdvTimes(heureStr) {
  if (!heureStr) return { away: '', home: '' };
  const [h, m] = heureStr.split(':').map(Number);
  const total = h * 60 + m;
  const fmt = (min) => {
    const hh = Math.floor(min / 60);
    const mm = min % 60;
    return mm === 0 ? `${hh}h` : `${hh}h${String(mm).padStart(2, '0')}`;
  };
  return { away: fmt(total - 60), home: fmt(total - 105) };
}

function formatMatchDate(dateVal) {
  const d = parseLocalDate(dateVal);
  if (!d) return '-';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });
}

// Regroupe un tableau de matchs par date (clé "YYYY-MM-DD")
function groupByDate(list) {
  const groups = {};
  list.forEach(m => {
    const key = m.date ? String(m.date).slice(0, 10) : 'sans-date';
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  });
  return groups;
}

export default function ConvocationPreparator() {
  const [matches,        setMatches]        = useState([]);
  const [isPast,         setIsPast]         = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [selectedMatch,  setSelectedMatch]  = useState(null);
  const [joueurs,        setJoueurs]        = useState([]);
  const [loadingJoueurs, setLoadingJoueurs] = useState(false);
  const [selectedIds,    setSelectedIds]    = useState([]);
  const [rdvAway,        setRdvAway]        = useState('');
  const [rdvHome,        setRdvHome]        = useState('');
  const [customTime,     setCustomTime]     = useState('');
  const [copied,         setCopied]         = useState(false);
  const [error,          setError]          = useState(null);
  const [visual,         setVisual]         = useState(null);   // { url, full_url }
  const [generatingVisual, setGeneratingVisual] = useState(false);
  const [publishingVisual, setPublishingVisual] = useState(null);

  const loadJoueurs = useCallback(async (equipe) => {
    setLoadingJoueurs(true);
    try {
      const res = await getConvocationJoueurs(equipe);
      setJoueurs(res.data || []);
    } catch {
      setError('Erreur lors du chargement des joueurs');
    } finally {
      setLoadingJoueurs(false);
    }
  }, []);

  const handleGenerateVisual = useCallback(async () => {
    if (!selectedMatch || selectedIds.length === 0) return;
    setGeneratingVisual(true);
    setVisual(null);
    try {
      const res = await generateConvocationVisual({
        match_id:          selectedMatch.id,
        joueur_ids:        selectedIds,
        rdv_stade:         rdvHome,
        rdv_la_bas:        selectedMatch.domicile ? null : rdvAway,
        custom_match_time: customTime,
      });
      setVisual(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la génération du visuel');
    } finally {
      setGeneratingVisual(false);
    }
  }, [selectedMatch, selectedIds, rdvHome, rdvAway, customTime]);

  const handlePublishVisual = useCallback(async (platform) => {
    if (!visual) return;
    setPublishingVisual(platform);
    try {
      const fn = platform === 'facebook' ? publishFacebook : publishInstagram;
      await fn({ image_url: visual.full_url, message: `Convocation - ${selectedMatch?.adversaire || ''}` });
    } catch (err) {
      setError(err.response?.data?.error || `Erreur publication ${platform}`);
    } finally {
      setPublishingVisual(null);
    }
  }, [visual, selectedMatch]);

  const applyMatch = useCallback((m) => {
    setSelectedMatch(m);
    setSelectedIds([]);
    setVisual(null);
    const { away, home } = calcRdvTimes(m.heure);
    setRdvAway(away);
    setRdvHome(home);
    setCustomTime(fmtTime(m.heure));
  }, []);

  // Chargement des matchs du week-end
  useEffect(() => {
    (async () => {
      setLoadingMatches(true);
      try {
        const res = await getConvocationMatchesWeekend();
        const list = res.data || [];
        setMatches(list);
        // Détecte si le backend a renvoyé des matchs passés (fallback)
        const today = new Date().toISOString().slice(0, 10);
        const allPast = list.length > 0 && list.every(m => String(m.date).slice(0, 10) < today);
        setIsPast(allPast);
        if (list.length === 1) {
          applyMatch(list[0]);
          const jr = await getConvocationJoueurs(list[0].equipe);
          setJoueurs(jr.data || []);
        }
      } catch {
        setError('Erreur lors du chargement des matchs du week-end');
      } finally {
        setLoadingMatches(false);
      }
    })();
  }, [applyMatch]);

  const handleSelectMatch = useCallback(async (m) => {
    applyMatch(m);
    await loadJoueurs(m.equipe);
  }, [applyMatch, loadJoueurs]);

  const togglePlayer = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const movePlayer = (index, dir) => {
    setSelectedIds(prev => {
      const arr = [...prev];
      const next = index + dir;
      if (next < 0 || next >= arr.length) return arr;
      [arr[index], arr[next]] = [arr[next], arr[index]];
      return arr;
    });
  };

  // Génération du texte en temps réel (client-side)
  const generatedText = useMemo(() => {
    const needAway = !selectedMatch?.domicile;
    if (!selectedMatch || selectedIds.length === 0 || !rdvHome || (needAway && !rdvAway)) return '';

    const d = parseLocalDate(selectedMatch.date);
    const jourStr = d ? JOURS[d.getDay()] : '';
    const heureMatch = customTime || fmtTime(selectedMatch.heure);
    const joueurMap = Object.fromEntries(joueurs.map(j => [j.id, j]));
    const ordered = selectedIds.map(id => joueurMap[id]).filter(Boolean);

    const lines = ordered.map((j, i) => {
      const initiale = j.nom ? j.nom[0].toUpperCase() + '.' : '';
      return ` ${i + 1}. ${j.prenom} ${initiale}`;
    }).join('\n');

    const rdvPhrase = selectedMatch.domicile
      ? `Rdv ${rdvHome} au stade pour :`
      : `Rdv ${rdvAway} là-bas ou ${rdvHome} au stade pour :`;

    return `Salut à tous,\nmatch contre ${selectedMatch.adversaire} ${jourStr} à ${heureMatch}. ${rdvPhrase}\n${lines}`;
  }, [selectedMatch, selectedIds, joueurs, rdvAway, rdvHome, customTime]);

  const handleCopy = async () => {
    if (!generatedText) return;
    try {
      await navigator.clipboard.writeText(generatedText);
    } catch {
      const el = document.createElement('textarea');
      el.value = generatedText;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const selectedJoueurs = selectedIds.map(id => joueurs.find(j => j.id === id)).filter(Boolean);

  // ─────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Convocation</h1>
          <p className="page-subtitle">Prépare le message WhatsApp de convocation</p>
        </div>
      </div>

      {error && <div className="alert alert-error">❌ {error}</div>}

      {/* ── ÉTAPE 1 : Sélection du match ────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2>1. Sélectionner le match</h2>
          {!loadingMatches && matches.length > 0 && (
            <span className="badge badge-programme">
              {matches.length} match{matches.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {loadingMatches ? (
          <div className="loading-center">
            <div className="spinner" />
            <span>Chargement des matchs...</span>
          </div>
        ) : matches.length === 0 ? (
          <div className="empty-state">
            <span className="icon">📅</span>
            <h3>Aucun match disponible</h3>
            <p>Aucun match enregistré dans la base de données</p>
          </div>
        ) : (
          <div style={{ padding: '12px 20px 16px' }}>
            {isPast && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
                ℹ️ Aucun match à venir — affichage des derniers matchs passés
              </div>
            )}
            {Object.entries(groupByDate(matches)).map(([dateKey, group]) => (
              <div key={dateKey} style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: '#888',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  marginBottom: 8, paddingBottom: 4,
                  borderBottom: '1px solid #f0f0f0',
                }}>
                  {formatMatchDate(dateKey)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {group.map(m => {
                    const active = selectedMatch?.id === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => handleSelectMatch(m)}
                        style={{
                          flex: '1 1 240px',
                          padding: '14px 16px',
                          borderRadius: 10,
                          border: `2px solid ${active ? 'var(--vert, #1a6b3c)' : '#e0e0e0'}`,
                          background: active ? '#f0f9f4' : '#fafafa',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--vert, #1a6b3c)' }}>
                            {m.equipe}
                          </span>
                          <span className={`badge ${m.domicile ? 'badge-programme' : 'badge-termine'}`}>
                            {m.domicile ? 'Dom.' : 'Ext.'}
                          </span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>vs {m.adversaire}</div>
                        {m.heure && (
                          <div style={{ color: '#666', fontSize: 13, marginTop: 3 }}>
                            🕐 {fmtTime(m.heure)}
                          </div>
                        )}
                        {m.lieu && (
                          <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>📍 {m.lieu}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── ÉTAPE 2 : Horaires RDV ──────────────────────────────────────── */}
      {selectedMatch && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>2. Horaires de rendez-vous</h2>
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: 20 }}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Heure du match</span>
              <input
                type="text"
                value={customTime}
                onChange={e => setCustomTime(e.target.value)}
                placeholder="ex: 15h"
                style={inputStyle}
              />
            </label>
            {!selectedMatch.domicile && (
              <label style={labelStyle}>
                <span style={labelTextStyle}>RDV là-bas (ext.)</span>
                <input
                  type="text"
                  value={rdvAway}
                  onChange={e => setRdvAway(e.target.value)}
                  placeholder="ex: 14h"
                  style={inputStyle}
                />
              </label>
            )}
            <label style={labelStyle}>
              <span style={labelTextStyle}>RDV au stade</span>
              <input
                type="text"
                value={rdvHome}
                onChange={e => setRdvHome(e.target.value)}
                placeholder="ex: 13h15"
                style={inputStyle}
              />
            </label>
          </div>
        </div>
      )}

      {/* ── ÉTAPE 3 : Sélection des joueurs ────────────────────────────── */}
      {selectedMatch && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>3. Joueurs</h2>
            {!loadingJoueurs && (
              <span className="badge badge-programme">
                {selectedIds.length} / {joueurs.length}
              </span>
            )}
          </div>

          {loadingJoueurs ? (
            <div className="loading-center">
              <div className="spinner" />
              <span>Chargement des joueurs...</span>
            </div>
          ) : (
            <>
              {/* Boutons rapides */}
              <div style={{ padding: '8px 20px 4px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 13 }}
                  onClick={() => setSelectedIds(joueurs.slice(0, 11).map(j => j.id))}
                >
                  11 premiers
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 13 }}
                  onClick={() => setSelectedIds([])}
                >
                  Tout désélectionner
                </button>
              </div>

              {/* Liste des joueurs */}
              <div style={{ padding: '4px 20px 16px' }}>
                {joueurs.length === 0 ? (
                  <div className="empty-state">
                    <span className="icon">👥</span>
                    <h3>Aucun joueur</h3>
                    <p>Aucun joueur dans la base de données</p>
                  </div>
                ) : (
                  joueurs.map(j => {
                    const checked = selectedIds.includes(j.id);
                    const rank = checked ? selectedIds.indexOf(j.id) + 1 : null;
                    return (
                      <div
                        key={j.id}
                        onClick={() => togglePlayer(j.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 4px',
                          borderBottom: '1px solid #f0f0f0',
                          cursor: 'pointer',
                          background: checked ? '#f7fdf9' : 'transparent',
                          transition: 'background 0.1s',
                        }}
                      >
                        <div style={{
                          width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                          border: `2px solid ${checked ? 'var(--vert, #1a6b3c)' : '#ccc'}`,
                          background: checked ? 'var(--vert, #1a6b3c)' : 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {checked && (
                            <span style={{ color: 'white', fontSize: 11, lineHeight: 1, fontWeight: 700 }}>✓</span>
                          )}
                        </div>
                        <span style={{ flex: 1, fontWeight: checked ? 600 : 400, fontSize: 14 }}>
                          {j.prenom} {j.nom}
                        </span>
                        {j.categorie && (
                          <span style={{ fontSize: 12, color: '#aaa' }}>{j.categorie}</span>
                        )}
                        {rank && (
                          <span style={{ fontSize: 13, color: 'var(--vert, #1a6b3c)', fontWeight: 700, minWidth: 24, textAlign: 'right' }}>
                            #{rank}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Réordonnancement ────────────────────────────────────────────── */}
      {selectedJoueurs.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>Ordre de la liste</h2>
            <span style={{ fontSize: 13, color: '#888' }}>↕ Réorganiser</span>
          </div>
          <div style={{ padding: '8px 20px 16px' }}>
            {selectedJoueurs.map((j, i) => (
              <div
                key={j.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 4px',
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                <span style={{ width: 28, color: '#999', fontSize: 13, textAlign: 'right', flexShrink: 0 }}>
                  {i + 1}.
                </span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>
                  {j.prenom} {j.nom}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => movePlayer(i, -1)}
                    disabled={i === 0}
                    style={arrowBtnStyle(i === 0)}
                  >↑</button>
                  <button
                    onClick={() => movePlayer(i, 1)}
                    disabled={i === selectedJoueurs.length - 1}
                    style={arrowBtnStyle(i === selectedJoueurs.length - 1)}
                  >↓</button>
                  <button
                    onClick={() => togglePlayer(j.id)}
                    style={{ ...arrowBtnStyle(false), color: '#e53e3e', borderColor: '#fca5a5' }}
                    title="Retirer"
                  >✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ÉTAPE 4 : Aperçu + copie ────────────────────────────────────── */}
      {generatedText ? (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>4. Message WhatsApp</h2>
            <button
              className={`btn ${copied ? 'btn-secondary' : 'btn-primary'}`}
              onClick={handleCopy}
              style={{ fontSize: 13, minWidth: 120 }}
            >
              {copied ? '✅ Copié !' : '📋 Copier le texte'}
            </button>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <textarea
              readOnly
              value={generatedText}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                minHeight: 200,
                fontFamily: "'Courier New', monospace",
                fontSize: 14,
                lineHeight: 1.7,
                padding: '12px 14px',
                borderRadius: 8,
                border: '1px solid #e0e0e0',
                background: '#f9fafb',
                resize: 'vertical',
                color: '#1a1a1a',
              }}
            />
          </div>
        </div>
      ) : selectedMatch && selectedIds.length === 0 && !loadingJoueurs && joueurs.length > 0 ? (
        <div style={{ marginTop: 20, padding: '14px 20px', background: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a', color: '#92400e', fontSize: 14 }}>
          💡 Sélectionne au moins un joueur pour générer le message.
        </div>
      ) : null}

      {/* ── ÉTAPE 5 : Visuel "Le Groupe" ────────────────────────────────── */}
      {selectedMatch && selectedIds.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>5. Visuel "Le Groupe"</h2>
            <button
              className="btn btn-primary"
              onClick={handleGenerateVisual}
              disabled={generatingVisual}
              style={{ fontSize: 13 }}
            >
              {generatingVisual ? '⏳ Génération...' : '🖼️ Générer le visuel'}
            </button>
          </div>

          {visual && (
            <div style={{ padding: '16px 20px' }}>
              <img
                src={visual.full_url}
                alt="Visuel convocation"
                style={{
                  width: '100%', maxWidth: 640,
                  borderRadius: 10,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                  display: 'block', marginBottom: 14,
                }}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a
                  href={visual.full_url}
                  download
                  className="btn btn-ghost"
                  style={{ fontSize: 13 }}
                >
                  ⬇️ Télécharger
                </a>
                <button
                  className="btn btn-primary"
                  onClick={() => handlePublishVisual('instagram')}
                  disabled={publishingVisual !== null}
                  style={{ fontSize: 13 }}
                >
                  {publishingVisual === 'instagram' ? '⏳' : '📸'} Instagram
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => handlePublishVisual('facebook')}
                  disabled={publishingVisual !== null}
                  style={{ fontSize: 13, background: '#1877f2', borderColor: '#1877f2' }}
                >
                  {publishingVisual === 'facebook' ? '⏳' : '👍'} Facebook
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles partagés ──────────────────────────────────────────────────────────

const labelStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const labelTextStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: '#555',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const inputStyle = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #ddd',
  fontSize: 14,
  width: 110,
  color: '#222',
};

const arrowBtnStyle = (disabled) => ({
  padding: '3px 8px',
  borderRadius: 5,
  border: '1px solid #ddd',
  background: 'white',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.3 : 1,
  fontSize: 13,
  lineHeight: 1.4,
  transition: 'opacity 0.1s',
});
