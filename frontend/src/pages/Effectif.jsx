import { useState, useEffect, useMemo } from 'react';
import { getJoueurs, API_BASE_URL } from '../services/api';
import './Effectif.css';

const CATEGORIES = ['Toutes', 'Senior', 'Senior U20', 'Vétéran', 'U19', 'U18'];

const CATEGORIE_COLORS = {
  'Senior':     { bg: '#dbeafe', color: '#1d4ed8' },
  'Senior U20': { bg: '#ede9fe', color: '#6d28d9' },
  'Vétéran':    { bg: '#fef3c7', color: '#b45309' },
  'U19':        { bg: '#dcfce7', color: '#15803d' },
  'U18':        { bg: '#fee2e2', color: '#b91c1c' },
};

function formatDdn(ddn) {
  if (!ddn) return null;
  const d = new Date(ddn);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function calcAge(ddn) {
  if (!ddn) return null;
  const today = new Date();
  const birth = new Date(ddn);
  let age = today.getFullYear() - birth.getFullYear();
  if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age--;
  return age;
}

function PlayerCard({ joueur }) {
  const [imgError, setImgError] = useState(false);
  const photoUrl = joueur.photo && !imgError
    ? `${API_BASE_URL}${joueur.photo.startsWith('/') ? joueur.photo : '/' + joueur.photo}`
    : null;
  const age = calcAge(joueur.ddn);
  const catStyle = CATEGORIE_COLORS[joueur.categorie] || { bg: '#f3f4f6', color: '#4b5563' };

  return (
    <div className="player-card">
      <div className="player-photo">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={`${joueur.prenom} ${joueur.nom}`}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="player-photo-placeholder">
            <span>{joueur.prenom[0]}{joueur.nom[0]}</span>
          </div>
        )}
        {joueur.categorie && (
          <span
            className="player-categorie-badge"
            style={{ background: catStyle.bg, color: catStyle.color }}
          >
            {joueur.categorie}
          </span>
        )}
      </div>
      <div className="player-info">
        <div className="player-prenom">{joueur.prenom}</div>
        <div className="player-nom">{joueur.nom}</div>
        {joueur.ddn && (
          <div className="player-ddn">
            {formatDdn(joueur.ddn)}{age !== null ? <span className="player-age">{age} ans</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Effectif() {
  const [joueurs, setJoueurs]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [categorie, setCategorie] = useState('Toutes');
  const [search, setSearch]     = useState('');

  useEffect(() => {
    getJoueurs()
      .then(r => setJoueurs(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = joueurs;
    if (categorie !== 'Toutes') list = list.filter(j => j.categorie === categorie);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(j =>
        j.nom.toLowerCase().includes(q) || j.prenom.toLowerCase().includes(q)
      );
    }
    return list;
  }, [joueurs, categorie, search]);

  // Comptes par catégorie pour les badges sur les filtres
  const counts = useMemo(() => {
    const map = { 'Toutes': joueurs.length };
    for (const j of joueurs) {
      if (j.categorie) map[j.categorie] = (map[j.categorie] || 0) + 1;
    }
    return map;
  }, [joueurs]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Effectif SCR Roeschwoog</h1>
          <p className="page-subtitle">{joueurs.length} joueurs enregistrés</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="effectif-filters">
        <div className="effectif-categories">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`effectif-cat-btn ${categorie === cat ? 'active' : ''}`}
              onClick={() => setCategorie(cat)}
            >
              {cat}
              {counts[cat] !== undefined && (
                <span className="effectif-cat-count">{counts[cat]}</span>
              )}
            </button>
          ))}
        </div>
        <input
          className="effectif-search"
          type="text"
          placeholder="Rechercher un joueur..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Grille */}
      {loading ? (
        <div className="loading-center">
          <div className="spinner" />
          <span>Chargement...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="icon">👤</span>
          <h3>Aucun joueur trouvé</h3>
          <p>{search ? 'Modifier la recherche' : 'Aucun joueur dans cette catégorie'}</p>
        </div>
      ) : (
        <>
          <p className="effectif-count">{filtered.length} joueur{filtered.length > 1 ? 's' : ''}</p>
          <div className="player-grid">
            {filtered.map(j => <PlayerCard key={j.id} joueur={j} />)}
          </div>
        </>
      )}
    </div>
  );
}
