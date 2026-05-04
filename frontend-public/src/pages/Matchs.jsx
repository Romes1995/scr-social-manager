import { useState, useEffect } from 'react';
import { getPublicMatchs } from '../services/api';

const EQUIPES = ['SCR 1', 'SCR 2', 'SCR 3'];

function formatDate(d, h) {
  if (!d) return '-';
  const date = new Date(d);
  const day  = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return h ? `${day} · ${h.slice(0, 5)}` : day;
}

function MatchRow({ match, isResult }) {
  const res = isResult
    ? match.score_scr > match.score_adv ? 'V'
    : match.score_scr < match.score_adv ? 'D' : 'N'
    : null;
  const resColor = res === 'V' ? 'var(--accent)' : res === 'D' ? 'var(--rouge)' : 'var(--text-muted)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid var(--border)', gap: 10 }}>
      <span style={{ fontSize: 11, color: 'var(--text-faint)', minWidth: 80 }}>
        {formatDate(match.date, match.heure)}
      </span>
      <div style={{ flex: 1, fontSize: 13 }}>
        <span style={{ color: 'var(--text-muted)' }}>vs </span>
        <strong>{match.adversaire}</strong>
      </div>
      {isResult ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: -0.5 }}>
            {match.score_scr} - {match.score_adv}
          </span>
          <span style={{ fontSize: 11, fontWeight: 800, color: resColor, minWidth: 16, textAlign: 'center' }}>
            {res}
          </span>
        </div>
      ) : (
        <span className={`badge ${match.domicile ? 'badge--dom' : 'badge--ext'}`}>
          {match.domicile ? 'Dom' : 'Ext'}
        </span>
      )}
    </div>
  );
}

function TeamSection({ equipe, upcoming, results }) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16, color: 'var(--accent)' }}>{equipe}</div>

      {upcoming.length > 0 && (
        <>
          <div className="section-title">À venir</div>
          {upcoming.map(m => <MatchRow key={m.id} match={m} isResult={false} />)}
        </>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: upcoming.length > 0 ? 16 : 0 }}>
          <div className="section-title">Résultats récents</div>
          {results.map(m => <MatchRow key={m.id} match={m} isResult={true} />)}
        </div>
      )}

      {upcoming.length === 0 && results.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Aucun match enregistré</p>
      )}
    </div>
  );
}

export default function Matchs() {
  const [data, setData]     = useState({ upcoming: [], results: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPublicMatchs()
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 24 }}>Matchs</h1>
      {loading ? <div className="spinner" /> : (
        EQUIPES.map(eq => (
          <TeamSection
            key={eq}
            equipe={eq}
            upcoming={(data.upcoming || []).filter(m => m.equipe === eq)}
            results={(data.results  || []).filter(m => m.equipe === eq)}
          />
        ))
      )}
    </div>
  );
}
