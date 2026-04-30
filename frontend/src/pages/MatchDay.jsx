import { useState, useEffect, useCallback } from 'react';
import { getMatches, generateMatchDay, API_BASE_URL } from '../services/api';

const TEAMS = [
  { num: 1, label: 'Équipe 1', division: 'D1' },
  { num: 2, label: 'Équipe 2', division: 'D5' },
  { num: 3, label: 'Équipe 3', division: 'D7' },
];

export default function MatchDay() {
  const [selectedTeam,      setSelectedTeam]      = useState(null);
  const [matches,           setMatches]           = useState([]);
  const [selectedMatch,     setSelectedMatch]     = useState(null);
  const [loading,           setLoading]           = useState(false);
  const [generating,        setGenerating]        = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState(null);
  const [error,             setError]             = useState(null);

  const loadMatches = useCallback(async (teamNum) => {
    setLoading(true);
    setMatches([]);
    setSelectedMatch(null);
    setGeneratedImageUrl(null);
    setError(null);
    try {
      const res = await getMatches({ equipe: `SCR ${teamNum}`, statut: 'programme' });
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const upcoming = (res.data || []).filter(m => !m.date || new Date(m.date) >= today);
      setMatches(upcoming);
    } catch {
      setError('Erreur lors du chargement des matchs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTeam !== null) loadMatches(selectedTeam);
  }, [selectedTeam, loadMatches]);

  const handleSelectTeam = (num) => {
    setSelectedTeam(num);
    setGeneratedImageUrl(null);
    setError(null);
  };

  const handleSelectMatch = (m) => {
    setSelectedMatch(m);
    setGeneratedImageUrl(null);
    setError(null);
  };

  const handleGenerate = async () => {
    if (!selectedMatch || !selectedTeam) return;
    setGenerating(true);
    setGeneratedImageUrl(null);
    setError(null);
    try {
      const res = await generateMatchDay(selectedMatch.id, selectedTeam);
      setGeneratedImageUrl(API_BASE_URL + res.data.story);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!generatedImageUrl || !selectedMatch) return;
    try {
      const response = await fetch(generatedImageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const adv  = (selectedMatch.adversaire || '').replace(/\s+/g, '_').toLowerCase();
      const date = selectedMatch.date ? selectedMatch.date.slice(0, 10) : 'sans-date';
      a.download = `matchday_equipe${selectedTeam}_${adv}_${date}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('Erreur lors du téléchargement');
    }
  };

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('fr-FR', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Match Day</h1>
          <p className="page-subtitle">Générer le visuel d'affiche de match</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">❌ {error}</div>
      )}

      {/* ── ÉTAPE 1 : Sélection équipe ──────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2>1. Sélectionner l'équipe</h2>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {TEAMS.map(t => (
            <button
              key={t.num}
              onClick={() => handleSelectTeam(t.num)}
              style={{
                flex: '1 1 140px',
                padding: '20px 16px',
                borderRadius: 12,
                border: '2px solid',
                borderColor: selectedTeam === t.num ? 'var(--scr-green, #1a6b3c)' : '#e0e0e0',
                background: selectedTeam === t.num ? '#f0f9f4' : '#fafafa',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 16,
                color: selectedTeam === t.num ? 'var(--scr-green, #1a6b3c)' : '#333',
                textAlign: 'center',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 6 }}>⚽</div>
              <div>{t.label}</div>
              <div style={{ fontWeight: 400, fontSize: 13, color: '#888', marginTop: 4 }}>{t.division}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── ÉTAPE 2 : Liste des matchs ──────────────────────────────────────── */}
      {selectedTeam !== null && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>2. Sélectionner le match</h2>
            {!loading && (
              <span className="badge badge-programme">
                {matches.length} match{matches.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {loading ? (
            <div className="loading-center">
              <div className="spinner"></div>
              <span>Chargement...</span>
            </div>
          ) : matches.length === 0 ? (
            <div className="empty-state">
              <span className="icon">📅</span>
              <h3>Aucun match à venir</h3>
              <p>Aucun match programmé pour SCR {selectedTeam}</p>
            </div>
          ) : (
            <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {matches.map(m => (
                <button
                  key={m.id}
                  onClick={() => handleSelectMatch(m)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '12px 16px', borderRadius: 10, border: '2px solid',
                    borderColor: selectedMatch?.id === m.id ? 'var(--scr-green, #1a6b3c)' : '#e0e0e0',
                    background: selectedMatch?.id === m.id ? '#f0f9f4' : '#fafafa',
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: selectedMatch?.id === m.id ? 'var(--scr-green, #1a6b3c)' : '#ccc',
                  }} />
                  <span style={{ fontWeight: 600, fontSize: 15, minWidth: 180 }}>
                    vs {m.adversaire}
                  </span>
                  <span style={{ color: '#555', fontSize: 13 }}>{formatDate(m.date)}</span>
                  {m.heure && (
                    <span style={{ color: '#555', fontSize: 13 }}>{m.heure.slice(0, 5)}</span>
                  )}
                  {m.lieu && (
                    <span style={{ color: '#888', fontSize: 13, marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                      {m.lieu}
                    </span>
                  )}
                  <span
                    className={`badge ${m.domicile ? 'badge-programme' : 'badge-termine'}`}
                    style={{ flexShrink: 0 }}
                  >
                    {m.domicile ? 'Dom' : 'Ext'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ÉTAPE 3 : Générer + prévisualisation ───────────────────────────── */}
      {selectedTeam !== null && !loading && matches.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>3. Générer le visuel</h2>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={!selectedMatch || generating}
              style={{ fontSize: 15, padding: '12px 28px' }}
            >
              {generating ? '⏳ Génération en cours...' : '🖼️ Générer le visuel Match Day'}
            </button>
            {!selectedMatch && (
              <p style={{ marginTop: 8, fontSize: 13, color: '#888' }}>
                Sélectionnez un match à l'étape 2 pour continuer.
              </p>
            )}
          </div>

          {generatedImageUrl && (
            <div style={{ padding: '20px', borderTop: '1px solid #f0f0f0' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: '#333' }}>
                Aperçu du visuel généré
              </h3>
              <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <img
                  src={generatedImageUrl}
                  alt="Visuel Match Day"
                  style={{
                    maxWidth: 320, width: '100%',
                    borderRadius: 12,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                    display: 'block',
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button className="btn btn-primary" onClick={handleDownload}>
                    ⬇️ Télécharger
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => { setGeneratedImageUrl(null); setSelectedMatch(null); }}
                  >
                    🔄 Recommencer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
