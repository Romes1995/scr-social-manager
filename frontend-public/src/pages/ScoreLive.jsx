import { useState, useEffect, useCallback } from 'react';
import { getScoreLive, getPublicMatchs, API_BASE_URL } from '../services/api';

function formatMinute(updatedAt) {
  if (!updatedAt) return '';
  const diff = Math.floor((Date.now() - new Date(updatedAt)) / 60000);
  return diff < 1 ? "à l'instant" : `il y a ${diff} min`;
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function MatchCard({ match }) {
  const logoUrl = match.logo_adversaire_local
    ? `${API_BASE_URL}/${match.logo_adversaire_local}`
    : null;
  const isHome = match.domicile;

  const teamSCR  = { name: match.equipe,     score: match.score_scr, logo: null };
  const teamAdv  = { name: match.adversaire, score: match.score_adv, logo: logoUrl };
  const [home, away] = isHome ? [teamSCR, teamAdv] : [teamAdv, teamSCR];

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span className="badge badge--live">
          <span className="dot-live" />
          EN COURS
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {match.division || ''} · {formatMinute(match.updated_at)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <TeamBlock team={home} align="left" />
        <div style={{ textAlign: 'center', minWidth: 80 }}>
          <div className="score-display">
            {home.score} <span style={{ color: 'var(--text-faint)' }}>-</span> {away.score}
          </div>
        </div>
        <TeamBlock team={away} align="right" />
      </div>

      {match.buteurs?.length > 0 && (
        <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-muted)', borderTop: '0.5px solid var(--border)', paddingTop: 12 }}>
          ⚽ {match.buteurs.join(', ')}
        </div>
      )}
    </div>
  );
}

function TeamBlock({ team, align }) {
  return (
    <div style={{ flex: 1, textAlign: align, display: 'flex', flexDirection: 'column', alignItems: align === 'left' ? 'flex-start' : 'flex-end', gap: 6 }}>
      {team.logo && (
        <img src={team.logo} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4 }} />
      )}
      <span style={{ fontSize: 14, fontWeight: 700 }}>{team.name}</span>
    </div>
  );
}

function NextMatchCard({ match }) {
  return (
    <div className="card">
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        Prochain match
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{match.equipe}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            vs <strong style={{ color: 'var(--text)' }}>{match.adversaire}</strong>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            {formatDate(match.date + 'T' + (match.heure || '00:00'))}
          </div>
        </div>
        <span className={`badge ${match.domicile ? 'badge--dom' : 'badge--ext'}`}>
          {match.domicile ? 'Domicile' : 'Extérieur'}
        </span>
      </div>
    </div>
  );
}

export default function ScoreLive() {
  const [liveMatches, setLiveMatches] = useState([]);
  const [nextMatch, setNextMatch]     = useState(null);
  const [lastUpdate, setLastUpdate]   = useState(null);
  const [loading, setLoading]         = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [liveRes, matchsRes] = await Promise.all([getScoreLive(), getPublicMatchs()]);
      setLiveMatches(liveRes.data);
      if (liveRes.data.length === 0) {
        const upcoming = matchsRes.data.upcoming || [];
        setNextMatch(upcoming[0] || null);
      }
      setLastUpdate(new Date());
    } catch {
      // silent — ne pas bloquer l'affichage
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Score Live</h1>
        {lastUpdate && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Mis à jour à {lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        )}
      </div>

      {loading ? (
        <div className="spinner" />
      ) : liveMatches.length > 0 ? (
        liveMatches.map(m => <MatchCard key={m.id} match={m} />)
      ) : (
        <div style={{ marginBottom: 20 }}>
          <div className="empty-state" style={{ paddingBottom: 32 }}>
            <h3>Aucun match en cours</h3>
            <p>Revenez pendant un match pour suivre le score en direct</p>
          </div>
          {nextMatch && <NextMatchCard match={nextMatch} />}
        </div>
      )}
    </div>
  );
}
