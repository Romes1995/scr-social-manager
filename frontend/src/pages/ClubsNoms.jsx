import { useState, useEffect, useCallback, useMemo } from 'react';
import { getClubsSaison, updateClubNoms, API_BASE_URL } from '../services/api';

// ─── Noms des clubs ───────────────────────────────────────────────────────────
// Clubs adverses rattachés à la FFF (cl_no) et rencontrés cette saison.
// Le site affiche le nom d'affichage s'il existe, sinon le nom FFF, suivi du
// numéro d'équipe s'il est supérieur à 1. Le nom court sert aux affichages étroits.

const MAX = { nom_affiche: 100, nom_court: 40 };

function logoSrc(url) {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  return `${API_BASE_URL}${url.startsWith('/') ? url : '/' + url}`;
}

function LogoThumb({ src, label }) {
  const [err, setErr] = useState(false);
  return (
    <div title={label} style={{
      width: 36, height: 36, borderRadius: 6, border: '1px solid #e0e0e0',
      background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', flexShrink: 0,
    }}>
      {src && !err
        ? <img src={src} alt={label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={() => setErr(true)} />
        : <span style={{ fontSize: 16, opacity: 0.3 }}>?</span>}
    </div>
  );
}

const nettoyer = (v) => (v || '').trim().replace(/\s+/g, ' ');

function ClubRow({ club, onSaved, onAlert }) {
  const [nomAffiche, setNomAffiche] = useState(club.nom_affiche || '');
  const [nomCourt,   setNomCourt]   = useState(club.nom_court || '');
  const [saving,     setSaving]     = useState(false);

  const modifie = nettoyer(nomAffiche) !== (club.nom_affiche || '')
               || nettoyer(nomCourt)   !== (club.nom_court || '');

  const apercu = nettoyer(nomAffiche) || club.nom_fff || club.nom;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await updateClubNoms(club.id, { nom_affiche: nomAffiche, nom_court: nomCourt });
      setNomAffiche(data.nom_affiche || '');
      setNomCourt(data.nom_court || '');
      onSaved(data);
      onAlert('success', `${club.nom_fff} : ${data.nom_affiche ? `affiché « ${data.nom_affiche} »` : 'retour au nom FFF'}`);
    } catch (err) {
      onAlert('error', err.response?.data?.error || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && modifie && !saving) handleSave();
    if (e.key === 'Escape') { setNomAffiche(club.nom_affiche || ''); setNomCourt(club.nom_court || ''); }
  };

  return (
    <tr>
      <td><LogoThumb src={logoSrc(club.logo_url || club.logo_fff)} label={club.logo_url ? 'Logo local' : 'Logo FFF'} /></td>
      <td>
        <strong>{club.nom_fff}</strong>
        {!club.nom_affiche && (
          <span className="badge badge-programme" style={{ marginLeft: 8 }}>sans nom d'affichage</span>
        )}
      </td>
      <td>
        <input className="form-control" value={nomAffiche} maxLength={MAX.nom_affiche}
          placeholder={club.nom_fff} onChange={e => setNomAffiche(e.target.value)} onKeyDown={handleKey} />
        <div style={{ fontSize: 12, color: 'var(--texte-gris)', marginTop: 4 }}>
          Site : {apercu}{club.equipes_no?.some(n => n > 1) && ` (+ n° d'équipe : ${club.equipes_no.filter(n => n > 1).join(', ')})`}
        </div>
      </td>
      <td>
        <input className="form-control" value={nomCourt} maxLength={MAX.nom_court}
          placeholder={nettoyer(nomAffiche) || club.nom_fff} onChange={e => setNomCourt(e.target.value)} onKeyDown={handleKey} />
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>{(club.equipes_scr || []).join(', ')}</td>
      <td>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!modifie || saving}>
          {saving ? '⏳' : 'Enregistrer'}
        </button>
      </td>
    </tr>
  );
}

export default function ClubsNoms() {
  const [clubs,      setClubs]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [sansNom,    setSansNom]    = useState(false);
  const [search,     setSearch]     = useState('');
  const [alert,      setAlert]      = useState(null);

  const showAlert = (type, msg) => { setAlert({ type, msg }); setTimeout(() => setAlert(null), 3500); };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await getClubsSaison();
      setClubs(data);
    } catch {
      showAlert('error', 'Impossible de charger les clubs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Mise à jour locale : l'ordre reste stable jusqu'au prochain chargement
  const handleSaved = (row) => setClubs(prev => prev.map(c => (c.id === row.id ? { ...c, ...row } : c)));

  const nbSansNom = clubs.filter(c => !c.nom_affiche).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clubs.filter(c =>
      (!sansNom || !c.nom_affiche) &&
      (!q || [c.nom_fff, c.nom_affiche, c.nom_court].some(v => v && v.toLowerCase().includes(q))));
  }, [clubs, sansNom, search]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Noms des clubs</h1>
          <p className="page-subtitle">
            Nom affiché sur le site pour chaque club adverse. Vide : nom FFF. Le numéro d'équipe (2, 3…) est ajouté automatiquement.
          </p>
        </div>
      </div>

      {alert && (
        <div className={`alert alert-${alert.type}`}>
          {alert.type === 'success' ? '✅' : '❌'} {alert.msg}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Clubs rencontrés cette saison ({clubs.length}, dont {nbSansNom} sans nom d'affichage)</h2>
          <div className="actions-bar">
            <input className="form-control" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher..." style={{ width: 200 }} />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={sansNom} onChange={e => setSansNom(e.target.checked)} />
              Sans nom d'affichage
            </label>
          </div>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner"></div></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <span className="icon">🏟</span>
            <h3>Aucun club</h3>
            <p>{clubs.length === 0 ? 'Lancez un import FFF pour rattacher les clubs de la saison' : 'Aucun club pour ce filtre'}</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 56 }}>Logo</th>
                  <th style={{ width: 260 }}>Nom FFF</th>
                  <th>Nom d'affichage</th>
                  <th style={{ width: 200 }}>Nom court</th>
                  <th style={{ width: 130 }}>Équipes SCR</th>
                  <th style={{ width: 110 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <ClubRow key={c.id} club={c} onSaved={handleSaved} onAlert={showAlert} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
