import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  getClubs, createClub, deleteClub,
  getClubsDoublons, previewFusionClubs, fusionnerClubs,
  previewSyncLogos, syncLogos, getDossiersDrive, getVarianteLogoActive, setVarianteLogoActive,
  getLogosClub, setDossierDriveClub, corrigerVarianteLogo,
  getJoueurs, createJoueur, updateJoueur, deleteJoueur,
  uploadClubLogo, uploadScrLogo, uploadScrLogoMono, bulkUploadLogos, saveLogoAssociations,
  getLogosTemporaires, createLogoTemporaire, updateLogoTemporaire, deleteLogoTemporaire, toggleLogoTemporaire,
  previewExcel, confirmImportJoueurs, uploadCelebrationVideo,
  getScoreLiveTemplateStatus, getResultatsTemplateStatus,
  uploadScoreLiveTemplate, uploadResultatTemplate,
  uploadJoueurImages,
  API_BASE_URL,
} from '../services/api';
import './Effectif.css';

// ─── Constantes et helpers Effectif ──────────────────────────────────────────

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


function ImageUploadZone({ src, label, fieldName, joueurId, onUploaded, placeholder }) {
  const inputRef = useRef(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [localSrc, setLocalSrc] = useState(src);
  const [imgErr, setImgErr]     = useState(false);

  useEffect(() => { setLocalSrc(src); setImgErr(false); }, [src]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setLoading(true);
    setError(null);
    const fd = new FormData();
    fd.append(fieldName, file);
    try {
      const res = await uploadJoueurImages(joueurId, fd);
      const updated = res.data.joueur;
      const newPath = fieldName === 'photo' ? updated.photo : updated.celebration_url;
      setLocalSrc(newPath ? `${API_BASE_URL}${newPath.startsWith('/') ? newPath : '/' + newPath}?v=${Date.now()}` : null);
      setImgErr(false);
      onUploaded(updated);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur upload');
    } finally {
      setLoading(false);
    }
  };

  const hasImg = localSrc && !imgErr;

  return (
    <div className="img-upload-zone" onClick={() => !loading && inputRef.current?.click()}>
      {hasImg ? (
        <img src={localSrc} alt={label} className="img-upload-preview" onError={() => setImgErr(true)} />
      ) : (
        <div className="img-upload-placeholder">{placeholder}</div>
      )}
      <div className={`img-upload-overlay ${loading ? 'img-upload-overlay--loading' : ''}`}>
        {loading ? <span className="img-upload-spinner" /> : <span className="img-upload-icon">📷</span>}
      </div>
      {error && <div className="img-upload-error">{error}</div>}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
    </div>
  );
}

function PlayerCard({ joueur, onUpdate }) {
  const age = calcAge(joueur.ddn);
  const catStyle = CATEGORIE_COLORS[joueur.categorie] || { bg: '#f3f4f6', color: '#4b5563' };

  const photoSrc = joueur.photo
    ? `${API_BASE_URL}${joueur.photo.startsWith('/') ? joueur.photo : '/' + joueur.photo}`
    : `${API_BASE_URL}/assets/player_placeholder.png`;
  const celebSrc = joueur.celebration_url
    ? `${API_BASE_URL}${joueur.celebration_url.startsWith('/') ? joueur.celebration_url : '/' + joueur.celebration_url}`
    : null;

  return (
    <div className="player-card">
      <div className="player-photo">
        <ImageUploadZone
          src={photoSrc}
          label={`Photo de ${joueur.prenom}`}
          fieldName="photo"
          joueurId={joueur.id}
          onUploaded={onUpdate}
          placeholder={null}
        />
        {joueur.categorie && (
          <span className="player-categorie-badge" style={{ background: catStyle.bg, color: catStyle.color }}>
            {joueur.categorie}
          </span>
        )}
      </div>
      <div className="player-info">
        <div className="player-prenom">{joueur.prenom}</div>
        <div className="player-nom">{joueur.nom}</div>
        {joueur.ddn && (
          <div className="player-ddn">
            {formatDdn(joueur.ddn)}
            {age !== null && <span className="player-age">{age} ans</span>}
          </div>
        )}
      </div>
      <div className="player-celebration">
        <span className="player-celebration-label">Célébration</span>
        <ImageUploadZone
          src={celebSrc}
          label={`Célébration de ${joueur.prenom}`}
          fieldName="celebration"
          joueurId={joueur.id}
          onUploaded={onUpdate}
          placeholder={<span className="player-celebration-placeholder-icon">🎉</span>}
        />
      </div>
    </div>
  );
}

function EffectifPanel() {
  const [joueurs, setJoueurs]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [categorie, setCategorie] = useState('Toutes');
  const [search, setSearch]       = useState('');

  useEffect(() => {
    getJoueurs()
      .then(r => setJoueurs(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleUpdate = (updated) => {
    setJoueurs(prev => prev.map(j => j.id === updated.id ? updated : j));
  };

  const filtered = useMemo(() => {
    let list = joueurs;
    if (categorie !== 'Toutes') list = list.filter(j => j.categorie === categorie);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(j => j.nom.toLowerCase().includes(q) || j.prenom.toLowerCase().includes(q));
    }
    return list;
  }, [joueurs, categorie, search]);

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
      <div className="effectif-filters">
        <div className="effectif-categories">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`effectif-cat-btn ${categorie === cat ? 'active' : ''}`}
              onClick={() => setCategorie(cat)}
            >
              {cat}
              {counts[cat] !== undefined && <span className="effectif-cat-count">{counts[cat]}</span>}
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
      {loading ? (
        <div className="loading-center"><div className="spinner" /><span>Chargement...</span></div>
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
            {filtered.map(j => <PlayerCard key={j.id} joueur={j} onUpdate={handleUpdate} />)}
          </div>
        </>
      )}
    </div>
  );
}

export default function Listes() {
  const [activeTab, setActiveTab] = useState('clubs');

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Listes</h1>
          <p className="page-subtitle">Gérez les clubs adversaires et les joueurs SCR</p>
        </div>
      </div>

      <ScrLogoSection />

      <LogosTemporairesSection />

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className={`btn ${activeTab === 'clubs'   ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('clubs')}>
          Clubs adversaires
        </button>
        <button className={`btn ${activeTab === 'joueurs' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('joueurs')}>
          Joueurs SCR
        </button>
        <button className={`btn ${activeTab === 'modeles' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('modeles')}>
          Modèles visuels
        </button>
        <button className={`btn ${activeTab === 'effectif' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('effectif')}>
          Effectif
        </button>
      </div>

      {activeTab === 'clubs'   && <ClubsPanel />}
      {activeTab === 'joueurs' && <JoueursPanel />}
      {activeTab === 'modeles' && <ModelesPanel />}
      {activeTab === 'effectif' && <EffectifPanel />}
    </div>
  );
}

// ─── Logo SCR ─────────────────────────────────────────────────────────────────

function ScrLogoSection() {
  const base     = `${API_BASE_URL}/uploads/logos/scr.png`;
  const baseMono = `${API_BASE_URL}/uploads/logos/scr_monochrome.png`;
  // URLs avec horodatage dès le premier rendu (contourne le cache navigateur)
  const [logoSrc, setLogoSrc]         = useState(() => `${base}?t=${Date.now()}`);
  const [monoSrc, setMonoSrc]         = useState(() => `${baseMono}?t=${Date.now()}`);
  const [uploading, setUploading]     = useState(false);
  const [uploadingMono, setUploadingMono] = useState(false);
  const [msg, setMsg]                 = useState(null);
  const fileRef     = useRef(null);
  const fileRefMono = useRef(null);

  const showMsg = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000); };

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('logo', file);
    setUploading(true);
    try {
      await uploadScrLogo(fd);
      setLogoSrc(`${base}?t=${Date.now()}`);
      showMsg('success', 'Logo SCR mis à jour');
    } catch { showMsg('error', "Erreur lors de l'upload"); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleChangeMono = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('logo', file);
    setUploadingMono(true);
    try {
      await uploadScrLogoMono(fd);
      setMonoSrc(`${baseMono}?t=${Date.now()}`);
      showMsg('success', 'Logo monochrome mis à jour');
    } catch { showMsg('error', "Erreur lors de l'upload"); }
    finally { setUploadingMono(false); e.target.value = ''; }
  };

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <h2>Logo SCR Roeschwoog</h2>
        <span style={{ fontSize: 13, color: '#888' }}>Utilisé sur tous les visuels générés</span>
      </div>
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 40, flexWrap: 'wrap' }}>

        {/* Logo couleur */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 90, height: 90, borderRadius: 10, border: '2px dashed #ddd', background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            {logoSrc
              ? <img src={logoSrc} alt="Logo SCR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={() => setLogoSrc(null)} />
              : <span style={{ fontSize: 32 }}>⚽</span>}
          </div>
          <div>
            <p style={{ margin: '0 0 8px', color: '#555', fontSize: 14 }}>Fichier : <code>uploads/logos/scr.png</code></p>
            <input type="file" accept=".png,.jpg,.jpeg,.webp" ref={fileRef} style={{ display: 'none' }} onChange={handleChange} />
            <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? '⏳ Upload...' : 'Changer le logo SCR'}
            </button>
          </div>
        </div>

        {/* Séparateur */}
        <div style={{ width: 1, background: '#e5e7eb', alignSelf: 'stretch' }} />

        {/* Logo monochrome */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 90, height: 90, borderRadius: 10, border: '2px dashed #555', background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            {monoSrc
              ? <img src={monoSrc} alt="Logo SCR monochrome" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={() => setMonoSrc(null)} />
              : <span style={{ fontSize: 32 }}>⚽</span>}
          </div>
          <div>
            <p style={{ margin: '0 0 4px', color: '#555', fontSize: 14 }}>Fichier : <code>uploads/logos/scr_monochrome.png</code></p>
            <p style={{ margin: '0 0 8px', color: '#888', fontSize: 12 }}>Utilisé pour le score live (fond sombre)</p>
            <input type="file" accept=".png,.jpg,.jpeg,.webp" ref={fileRefMono} style={{ display: 'none' }} onChange={handleChangeMono} />
            <button className="btn btn-secondary btn-sm" onClick={() => fileRefMono.current?.click()} disabled={uploadingMono}>
              {uploadingMono ? '⏳ Upload...' : 'Changer le logo monochrome SCR'}
            </button>
          </div>
        </div>

      </div>
      {msg && <p style={{ margin: '0 20px 12px', fontSize: 13, color: msg.type === 'success' ? '#1a6b3c' : '#c0392b' }}>{msg.text}</p>}
    </div>
  );
}

// ─── Logos temporaires (Octobre Rose, Movember…) ─────────────────────────────

const STATUT_TEMP = {
  en_cours: { label: 'En cours', bg: '#fce7f3', color: '#be185d' },
  a_venir:  { label: 'À venir',  bg: 'var(--bleu-light)', color: 'var(--bleu)' },
  termine:  { label: 'Terminé',  bg: '#f0f2f5', color: '#888' },
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function statutTemp(row, today) {
  const debut = String(row.date_debut).slice(0, 10);
  const fin   = String(row.date_fin).slice(0, 10);
  if (fin < today)   return 'termine';
  if (debut > today) return 'a_venir';
  return 'en_cours';
}

function fmtDateFr(d) {
  const [y, m, j] = String(d || '').slice(0, 10).split('-');
  return y ? `${j}/${m}/${y}` : '';
}

const EMPTY_TEMP_FORM = { clubId: 'SCR', clubIds: ['SCR'], nom: '', debut: '', fin: '' };

function LogosTemporairesSection() {
  const [rows, setRows]       = useState([]);
  const [clubs, setClubs]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert]     = useState(null);
  const [form, setForm]       = useState(EMPTY_TEMP_FORM);
  const [multi, setMulti]     = useState(false);
  const [file, setFile]       = useState(null);
  const [saving, setSaving]   = useState(false);
  const [editing, setEditing] = useState(null); // ligne en cours de modification
  const fileRef = useRef(null);

  const showAlert = (type, msg) => { setAlert({ type, msg }); setTimeout(() => setAlert(null), 5000); };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [r, c] = await Promise.all([getLogosTemporaires(), getClubs()]);
      setRows(r.data);
      setClubs(c.data);
    } catch { showAlert('error', 'Erreur lors du chargement des logos temporaires'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Un choix par club (toutes les équipes d'un même club partagent le logo) — SCR en premier
  const clubOptions = useMemo(() => {
    const map = {};
    clubs.forEach(c => {
      const key = c.nom.trim().toLowerCase();
      if (!map[key] || c.id < map[key].id) map[key] = { id: c.id, nom: c.nom };
    });
    const list = Object.values(map).sort((a, b) => a.nom.localeCompare(b.nom));
    return [{ id: 'SCR', nom: 'SC Roeschwoog (SCR)' }, ...list];
  }, [clubs]);

  const imgSrc = (url) => (url ? `${API_BASE_URL}${url}` : null);

  const toggleClubInMulti = (id) => {
    setForm(f => ({
      ...f,
      clubIds: f.clubIds.includes(id) ? f.clubIds.filter(x => x !== id) : [...f.clubIds, id],
    }));
  };

  const validate = (f, needFile) => {
    if (!f.nom.trim())              return 'Le nom de l\'événement est requis';
    if (!f.debut || !f.fin)         return 'Dates de début et de fin requises';
    if (f.fin < f.debut)            return 'La date de fin doit être après la date de début';
    if (needFile && !file)          return 'Choisissez un fichier PNG';
    return null;
  };

  const handleCreate = async () => {
    const err = validate(form, true) || (multi && form.clubIds.length === 0 ? 'Sélectionnez au moins un club' : null);
    if (err) return showAlert('error', err);
    const fd = new FormData();
    fd.append('logo', file);
    fd.append('club_ids', JSON.stringify(multi ? form.clubIds : [form.clubId]));
    fd.append('nom_evenement', form.nom.trim());
    fd.append('date_debut', form.debut);
    fd.append('date_fin', form.fin);
    setSaving(true);
    try {
      const r = await createLogoTemporaire(fd);
      const n = r.data.created?.length || 1;
      showAlert('success', n > 1 ? `Logo temporaire ajouté pour ${n} clubs` : 'Logo temporaire ajouté');
      setForm(EMPTY_TEMP_FORM);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (e) { showAlert('error', e.response?.data?.error || 'Erreur lors de l\'ajout'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (row) => {
    try { await toggleLogoTemporaire(row.id); load(); }
    catch { showAlert('error', 'Erreur lors du changement d\'état'); }
  };

  const handleDelete = async (row) => {
    const club = row.club_id ? row.club_nom : 'SCR';
    if (!confirm(`Supprimer le logo temporaire "${row.nom_evenement}" (${club}) ?`)) return;
    try { await deleteLogoTemporaire(row.id); showAlert('success', 'Logo temporaire supprimé'); load(); }
    catch { showAlert('error', 'Erreur lors de la suppression'); }
  };

  const today = todayIso();

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <h2>Logos temporaires</h2>
        <span style={{ fontSize: 13, color: '#888' }}>Remplacent le logo normal pour les matchs compris dans la période (Octobre Rose, Movember…)</span>
      </div>

      {alert && (
        <div className={`alert alert-${alert.type}`} style={{ margin: '12px 20px 0' }}>
          {alert.type === 'success' ? '✅' : '❌'} {alert.msg}
        </div>
      )}

      {/* ── Formulaire d'ajout ── */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0, minWidth: 220 }}>
            <label className="form-label">
              Club{multi ? 's' : ''}{' '}
              <button type="button" className="btn btn-sm btn-ghost" style={{ fontSize: 12, padding: '0 6px', marginLeft: 4 }}
                onClick={() => setMulti(v => !v)}>
                {multi ? '↩ Un seul club' : '➕ Appliquer à plusieurs clubs'}
              </button>
            </label>
            {!multi && (
              <select className="form-control" value={form.clubId} onChange={e => setForm(f => ({ ...f, clubId: e.target.value }))}>
                {clubOptions.map(o => <option key={o.id} value={o.id}>{o.nom}</option>)}
              </select>
            )}
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: 180 }}>
            <label className="form-label">Événement *</label>
            <input className="form-control" value={form.nom} placeholder="Ex: Octobre Rose"
              onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Du *</label>
            <input type="date" className="form-control" value={form.debut}
              onChange={e => setForm(f => ({ ...f, debut: e.target.value, fin: f.fin && f.fin < e.target.value ? e.target.value : f.fin }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Au *</label>
            <input type="date" className="form-control" value={form.fin} min={form.debut || undefined}
              onChange={e => setForm(f => ({ ...f, fin: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Logo PNG *</label>
            <input type="file" accept=".png,image/png" ref={fileRef} className="form-control"
              onChange={e => setFile(e.target.files?.[0] || null)} />
          </div>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? '⏳...' : '+ Ajouter'}
          </button>
        </div>

        {multi && (
          <div style={{ marginTop: 12, maxHeight: 180, overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 8, padding: 10,
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 4 }}>
            {clubOptions.map(o => (
              <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.clubIds.includes(o.id)} onChange={() => toggleClubInMulti(o.id)} />
                {o.nom}
              </label>
            ))}
          </div>
        )}
        {multi && <p style={{ fontSize: 12, color: '#888', margin: '6px 0 0' }}>{form.clubIds.length} club(s) sélectionné(s) — le même logo et la même période seront créés pour chacun.</p>}
      </div>

      {/* ── Liste ── */}
      {loading ? (
        <div className="loading-center"><div className="spinner"></div></div>
      ) : rows.length === 0 ? (
        <p style={{ padding: '16px 20px', margin: 0, color: '#888', fontSize: 14 }}>Aucun logo temporaire pour le moment.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Club</th>
                <th style={{ width: 110 }}>Logos</th>
                <th>Événement</th>
                <th>Période</th>
                <th>Statut</th>
                <th>Actif</th>
                <th style={{ width: 150 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const st = STATUT_TEMP[statutTemp(row, today)];
                return (
                  <tr key={row.id} style={{ opacity: row.actif ? 1 : 0.5 }}>
                    <td><strong>{row.club_id ? row.club_nom : 'SCR'}</strong></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <LogoThumb src={imgSrc(row.logo_defaut)} label="Logo normal" />
                        <span style={{ color: '#aaa', fontSize: 12 }}>→</span>
                        <LogoThumb src={imgSrc(row.fichier)} label={`Logo ${row.nom_evenement}`} />
                      </div>
                    </td>
                    <td>{row.nom_evenement}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDateFr(row.date_debut)} → {fmtDateFr(row.date_fin)}</td>
                    <td><span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span></td>
                    <td>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                        <input type="checkbox" checked={!!row.actif} onChange={() => handleToggle(row)} />
                        {row.actif ? 'Oui' : 'Non'}
                      </label>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => setEditing(row)}>Modifier</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(row)}>Supprimer</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditLogoTemporaireModal
          row={editing}
          clubOptions={clubOptions}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); showAlert('success', 'Logo temporaire modifié'); load(); }}
        />
      )}
    </div>
  );
}

function EditLogoTemporaireModal({ row, clubOptions, onClose, onSaved }) {
  const [form, setForm]     = useState({
    clubId: row.club_id ?? 'SCR',
    nom:    row.nom_evenement,
    debut:  String(row.date_debut).slice(0, 10),
    fin:    String(row.date_fin).slice(0, 10),
  });
  const [file, setFile]     = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const handleSave = async () => {
    if (!form.nom.trim())       return setError('Le nom de l\'événement est requis');
    if (!form.debut || !form.fin) return setError('Dates requises');
    if (form.fin < form.debut)  return setError('La date de fin doit être après la date de début');
    const fd = new FormData();
    if (file) fd.append('logo', file);
    fd.append('club_id', String(form.clubId));
    fd.append('nom_evenement', form.nom.trim());
    fd.append('date_debut', form.debut);
    fd.append('date_fin', form.fin);
    setSaving(true);
    try { await updateLogoTemporaire(row.id, fd); onSaved(); }
    catch (e) { setError(e.response?.data?.error || 'Erreur lors de la modification'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>Modifier le logo temporaire</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Club</label>
            <select className="form-control" value={form.clubId} onChange={e => setForm(f => ({ ...f, clubId: e.target.value }))}>
              {clubOptions.map(o => <option key={o.id} value={o.id}>{o.nom}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Événement *</label>
            <input className="form-control" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Du *</label>
              <input type="date" className="form-control" value={form.debut} onChange={e => setForm(f => ({ ...f, debut: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Au *</label>
              <input type="date" className="form-control" value={form.fin} min={form.debut || undefined} onChange={e => setForm(f => ({ ...f, fin: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Remplacer le logo <span style={{ fontWeight: 400, color: '#888' }}>(optionnel, PNG)</span></label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <LogoThumb src={`${API_BASE_URL}${row.fichier}`} label="Logo actuel" />
              <input type="file" accept=".png,image/png" className="form-control" onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          {error && <p style={{ color: '#c0392b', fontSize: 13, margin: 0 }}>❌ {error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? '⏳...' : '✔ Enregistrer'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Panel Clubs ──────────────────────────────────────────────────────────────

function ClubsPanel() {
  const [clubs, setClubs]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [alert, setAlert]         = useState(null);
  const [search, setSearch]       = useState('');
  const [uploadingNom, setUploadingNom] = useState(null);
  const [showImport, setShowImport]     = useState(false);
  const [addingTeam, setAddingTeam]     = useState({}); // { nom: bool }
  const [newTeamName, setNewTeamName]   = useState({}); // { nom: string }
  const [showAddModal, setShowAddModal] = useState(false);
  const [newClubForm, setNewClubForm]   = useState({ nom: '', equipe: '' });
  const [saving, setSaving]             = useState(false);
  const [selection, setSelection]       = useState([]);     // ids cochés, dans l'ordre de sélection
  const [doublons, setDoublons]         = useState([]);
  const [fusion, setFusion]             = useState(null);   // { ids, conserveId } : modale ouverte
  const [showSyncDrive, setShowSyncDrive] = useState(false);
  const [ficheClubId, setFicheClubId]   = useState(null);   // fiche logos d'un club
  const fileRefs = useRef({});

  const showAlert = (type, msg) => { setAlert({ type, msg }); setTimeout(() => setAlert(null), 5000); };

  const loadClubs = useCallback(async () => {
    try {
      setLoading(true);
      const [r, d] = await Promise.all([getClubs(), getClubsDoublons()]);
      setClubs(r.data);
      setDoublons(d.data);
      const ids = new Set(r.data.map(c => c.id));
      setSelection(sel => sel.filter(id => ids.has(id)));
    }
    catch { showAlert('error', 'Erreur lors du chargement'); }
    finally { setLoading(false); }
  }, []);

  // Case d'un groupe : coche ou décoche toutes ses lignes
  const toggleGroupe = (group) => {
    const ids = group.clubs.map(c => c.id);
    setSelection(sel => ids.every(id => sel.includes(id))
      ? sel.filter(id => !ids.includes(id))
      : [...sel, ...ids.filter(id => !sel.includes(id))]);
  };

  useEffect(() => { loadClubs(); }, [loadClubs]);

  // Grouper par nom de club (toutes équipes partagent le même logo)
  const groups = useMemo(() => {
    const map = {};
    clubs.forEach(c => {
      const key = c.nom.trim().toLowerCase();
      if (!map[key]) map[key] = { nom: c.nom, clubs: [], logoUrl: null };
      map[key].clubs.push(c);
      if (c.logo_url && !map[key].logoUrl) map[key].logoUrl = c.logo_url;
    });
    return Object.values(map).sort((a, b) => a.nom.localeCompare(b.nom));
  }, [clubs]);

  const filtered = groups.filter(g => g.nom.toLowerCase().includes(search.toLowerCase()));

  const logoSrc = (url) => {
    if (!url) return null;
    return url.startsWith('/uploads/') ? `${API_BASE_URL}${url}?t=${Date.now()}` : url;
  };

  // Upload logo pour tout le groupe (propagé à toutes les équipes du même nom)
  const handleLogoUpload = async (nom, anyId, file) => {
    const fd = new FormData();
    fd.append('logo', file);
    setUploadingNom(nom);
    try {
      await uploadClubLogo(anyId, fd);
      showAlert('success', `Logo de ${nom} mis à jour`);
      loadClubs();
    } catch { showAlert('error', 'Erreur lors de l\'upload'); }
    finally { setUploadingNom(null); }
  };

  // Ajouter une équipe à un groupe existant
  const handleAddTeam = async (nom) => {
    const equipe = (newTeamName[nom] || '').trim();
    if (!equipe) return;
    try {
      await createClub({ nom, equipe });
      showAlert('success', `Équipe "${equipe}" ajoutée`);
      setAddingTeam(prev => ({ ...prev, [nom]: false }));
      setNewTeamName(prev => ({ ...prev, [nom]: '' }));
      loadClubs();
    } catch (err) { showAlert('error', err.response?.data?.error || 'Erreur'); }
  };

  // Supprimer une équipe (une ligne club)
  const handleDeleteTeam = async (group, club) => {
    const isLast = group.clubs.length === 1;
    const label  = club.equipe || club.nom;
    const msg    = isLast
      ? `Supprimer le club "${club.nom}" entièrement ?`
      : `Supprimer l'équipe "${label}" ?`;
    if (!confirm(msg)) return;
    try {
      await deleteClub(club.id);
      showAlert('success', 'Supprimé');
      loadClubs();
    } catch { showAlert('error', 'Erreur lors de la suppression'); }
  };

  // Ajouter un nouveau club (nouveau nom)
  const handleAddClub = async () => {
    if (!newClubForm.nom.trim()) return showAlert('error', 'Le nom est requis');
    setSaving(true);
    try {
      await createClub(newClubForm);
      showAlert('success', 'Club ajouté');
      setShowAddModal(false);
      setNewClubForm({ nom: '', equipe: '' });
      loadClubs();
    } catch (err) { showAlert('error', err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  return (
    <>
      {alert && (
        <div className={`alert alert-${alert.type}`}>
          {alert.type === 'success' ? '✅' : '❌'} {alert.msg}
        </div>
      )}

      <LogosDriveBloc onSync={() => setShowSyncDrive(true)} onAlert={showAlert} />

      {showSyncDrive && (
        <SyncDriveModal
          logoSrc={logoSrc}
          onClose={() => setShowSyncDrive(false)}
          onDone={() => { setShowSyncDrive(false); loadClubs(); }}
        />
      )}

      {ficheClubId && (
        <FicheLogosModal
          clubId={ficheClubId}
          logoSrc={logoSrc}
          onClose={() => setFicheClubId(null)}
          onChanged={loadClubs}
        />
      )}

      {doublons.length > 0 && (
        <DoublonsSuggeres
          groupes={doublons}
          logoSrc={logoSrc}
          onFusionner={(g) => setFusion({ ids: g.clubs.map(c => c.id), conserveId: g.conserve_suggere })}
        />
      )}

      {fusion && (
        <FusionModal
          clubs={fusion.ids.map(id => clubs.find(c => c.id === id)).filter(Boolean)}
          conserveInitial={fusion.conserveId}
          logoSrc={logoSrc}
          onClose={() => setFusion(null)}
          onDone={(bilan) => {
            setFusion(null);
            setSelection([]);
            showAlert('success', `${bilan.absorbes.length + 1} clubs fusionnés dans « ${bilan.conserve.nom} »`
              + (bilan.nb_matchs ? ` (${bilan.nb_matchs} match${bilan.nb_matchs > 1 ? 's' : ''} mis à jour)` : ''));
            loadClubs();
          }}
        />
      )}

      {showImport && (
        <ImportLogosPanel
          clubs={clubs}
          onClose={() => { setShowImport(false); loadClubs(); }}
          onAlert={showAlert}
        />
      )}

      <div className="card">
        <div className="card-header">
          <h2>Clubs adversaires</h2>
          <div className="actions-bar">
            <input className="form-control" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher..." style={{ width: 200 }} />
            {selection.length >= 2 && (
              <button className="btn btn-primary btn-sm"
                onClick={() => setFusion({ ids: selection, conserveId: null })}
                title="Fusionner les clubs cochés en un seul">
                Fusionner ({selection.length})
              </button>
            )}
            {selection.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setSelection([])}>Décocher</button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(v => !v)}>
              Importer des logos
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => { setNewClubForm({ nom: '', equipe: '' }); setShowAddModal(true); }}>
              + Ajouter
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner"></div></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <span className="icon">🏟</span>
            <h3>{search ? 'Aucun résultat' : 'Aucun club'}</h3>
            <p>{search ? `Aucun club pour "${search}"` : 'Ajoutez les clubs adversaires du SCR'}</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th style={{ width: 40 }}>#</th>
                  <th style={{ width: 80 }}>Logo</th>
                  <th style={{ width: 200 }}>Club</th>
                  <th>Équipes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((group, idx) => {
                  const src     = logoSrc(group.logoUrl);
                  const anyId   = group.clubs[0].id;
                  const refKey  = group.nom;
                  const loading = uploadingNom === group.nom;
                  const coche   = group.clubs.every(c => selection.includes(c.id));
                  return (
                    <tr key={group.nom} style={coche ? { background: '#eef4ff' } : undefined}>
                      <td>
                        <input type="checkbox" checked={coche} onChange={() => toggleGroupe(group)}
                          title="Sélectionner pour une fusion" style={{ cursor: 'pointer', width: 16, height: 16 }} />
                      </td>
                      <td style={{ color: 'var(--texte-gris)' }}>{idx + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <LogoThumb src={src} label="Logo" />
                          <input type="file" accept=".png,.jpg,.jpeg,.webp" style={{ display: 'none' }}
                            ref={el => { if (el) fileRefs.current[refKey] = el; }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) { handleLogoUpload(group.nom, anyId, f); e.target.value = ''; } }} />
                          <button
                            className="btn btn-sm btn-ghost" title="Uploader le logo (partagé entre toutes les équipes)"
                            disabled={loading}
                            onClick={() => fileRefs.current[refKey]?.click()}
                            style={{ fontSize: 13, padding: '2px 6px' }}
                          >
                            {loading ? '⏳' : '⬆'}
                          </button>
                        </div>
                      </td>
                      <td>
                        <button className="btn-link" onClick={() => setFicheClubId(anyId)} title="Logos du club (classique, octobre rose, monochrome, dossier Drive)"
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit' }}>
                          <strong style={{ textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>{group.nom}</strong>
                        </button>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '4px 0' }}>
                          {group.clubs.map(c => (
                            <span key={c.id} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              background: '#f0f2f5', borderRadius: 20, padding: '3px 8px 3px 10px',
                              fontSize: 13, border: '1px solid #e0e0e0',
                            }}>
                              {c.equipe || c.nom}
                              <button
                                onClick={() => handleDeleteTeam(group, c)}
                                title="Supprimer cette équipe"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#aaa', padding: '0 0 0 3px', lineHeight: 1, display: 'flex', alignItems: 'center' }}
                              >✕</button>
                            </span>
                          ))}

                          {addingTeam[group.nom] ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <input
                                className="form-control"
                                style={{ width: 150, height: 28, fontSize: 13, padding: '2px 8px' }}
                                value={newTeamName[group.nom] || ''}
                                onChange={e => setNewTeamName(prev => ({ ...prev, [group.nom]: e.target.value }))}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleAddTeam(group.nom);
                                  if (e.key === 'Escape') setAddingTeam(prev => ({ ...prev, [group.nom]: false }));
                                }}
                                placeholder={`${group.nom} 2`}
                                autoFocus
                              />
                              <button className="btn btn-sm btn-primary" onClick={() => handleAddTeam(group.nom)} style={{ height: 28, padding: '0 8px' }}>✔</button>
                              <button className="btn btn-sm btn-ghost" onClick={() => setAddingTeam(prev => ({ ...prev, [group.nom]: false }))} style={{ height: 28, padding: '0 8px' }}>✕</button>
                            </span>
                          ) : (
                            <button
                              className="btn btn-sm btn-ghost"
                              title="Ajouter une équipe à ce club"
                              onClick={() => setAddingTeam(prev => ({ ...prev, [group.nom]: true }))}
                              style={{ borderRadius: 20, fontSize: 12, padding: '2px 10px', border: '1px dashed #ccc', color: '#999' }}
                            >
                              + équipe
                            </button>
                          )}
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

      {showAddModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Nouveau club</h3>
              <button className="btn-icon" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nom du club *</label>
                <input className="form-control" value={newClubForm.nom}
                  onChange={e => setNewClubForm(f => ({ ...f, nom: e.target.value }))}
                  placeholder="Ex: AS Gambsheim" autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Équipe <span style={{ fontWeight: 400, color: '#888' }}>(optionnel)</span></label>
                <input className="form-control" value={newClubForm.equipe}
                  onChange={e => setNewClubForm(f => ({ ...f, equipe: e.target.value }))}
                  placeholder="Ex: AS Gambsheim 2" />
                <p style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                  Laissez vide pour l'équipe principale. D'autres équipes peuvent être ajoutées depuis la liste.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleAddClub} disabled={saving}>
                {saving ? '⏳...' : '✔ Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Logos Google Drive ───────────────────────────────────────────────────────
// La synchro complète les logos existants sans jamais les remplacer :
// elle ne télécharge que les variantes absentes (backend/services/driveLogos.js).

const VARIANTE_LABEL = { classique: 'Classique', octobre_rose: 'Octobre rose', monochrome: 'Monochrome' };
const ACTION_LOGO = {
  telecharger:   { label: 'à télécharger', couleur: '#1d4ed8', fond: '#dbeafe' },
  a_jour:        { label: 'à jour', couleur: '#15803d', fond: '#dcfce7' },
  deja_en_place: { label: 'déjà en place', couleur: '#555', fond: '#f0f2f5' },
  manuel:        { label: 'corrigé à la main', couleur: '#555', fond: '#f0f2f5' },
  a_trancher:    { label: 'à trancher', couleur: '#b45309', fond: '#fef3c7' },
  ignore:        { label: 'ignoré', couleur: '#999', fond: '#f7f7f7' },
};

function PastilleFichier({ f, etatSeul = false }) {
  const a = ACTION_LOGO[f.action] || ACTION_LOGO.ignore;
  return (
    <span title={`${f.nom}${f.raison ? ` — ${f.raison}` : ''}`} style={{
      display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 11, padding: '2px 8px',
      borderRadius: 10, background: a.fond, color: a.couleur, whiteSpace: 'nowrap',
    }}>
      {etatSeul ? a.label : <>{f.variante ? VARIANTE_LABEL[f.variante] : f.nom.slice(0, 24)} · {a.label}</>}
    </span>
  );
}

// Réglage global et bouton de synchronisation
function LogosDriveBloc({ onSync, onAlert }) {
  const [variante, setVariante] = useState(null);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    getVarianteLogoActive().then(r => setVariante(r.data.variante)).catch(() => setVariante('classique'));
  }, []);

  const changer = async (v) => {
    setSaving(true);
    try {
      await setVarianteLogoActive(v);
      setVariante(v);
      onAlert('success', v === 'octobre_rose'
        ? 'Variante active : octobre rose (logo classique pour les clubs qui n’en ont pas)'
        : 'Variante active : classique');
    } catch (err) { onAlert('error', err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>Logos des clubs</h2>
          <p style={{ fontSize: 13, color: 'var(--texte-gris)', margin: '4px 0 0' }}>
            La synchro Drive complète les logos manquants sans remplacer ceux déjà en place.
          </p>
        </div>
        <div className="actions-bar" style={{ alignItems: 'center' }}>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            Variante active des visuels
            <select className="form-control" style={{ width: 160 }} value={variante || ''} disabled={!variante || saving}
              onChange={e => changer(e.target.value)}>
              <option value="classique">Classique</option>
              <option value="octobre_rose">Octobre rose</option>
            </select>
          </label>
          <button className="btn btn-primary btn-sm" onClick={onSync}>Synchroniser les logos Drive</button>
        </div>
      </div>
    </div>
  );
}

// Aperçu puis synchronisation
function SyncDriveModal({ logoSrc, onClose, onDone }) {
  const [plan, setPlan]           = useState(null);
  const [choix, setChoix]         = useState({});      // folder_id → club_id | 'ignorer'
  const [variantes, setVariantes] = useState({});      // file_id → variante | 'ignorer'
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi]         = useState(false);
  const [erreur, setErreur]       = useState(null);
  const [bilan, setBilan]         = useState(null);
  const [voirSurs, setVoirSurs]   = useState(false);
  const origine = useRef(null);                        // statut initial de chaque dossier

  useEffect(() => {
    let annule = false;
    setChargement(true);
    previewSyncLogos({ choix, variantes })
      .then(r => {
        if (annule) return;
        if (!origine.current) origine.current = Object.fromEntries(r.data.dossiers.map(d => [d.folder_id, d.statut]));
        setPlan(r.data);
        setErreur(null);
      })
      .catch(err => { if (!annule) setErreur(err.response?.data?.error || 'Erreur lors de la lecture du Drive'); })
      .finally(() => { if (!annule) setChargement(false); });
    return () => { annule = true; };
  }, [choix, variantes]);

  const groupe = (statuts) => (plan?.dossiers || []).filter(d => statuts.includes(origine.current?.[d.folder_id]));
  const surs = groupe(['lie', 'sur']);
  const ambigus = groupe(['ambigu']);
  const aucun = groupe(['aucun']);
  const ignores = groupe(['ignore', 'scr']);
  const clubsTries = useMemo(() => [...(plan?.clubs || [])].sort((a, b) => a.nom.localeCompare(b.nom)), [plan]);

  const synchroniser = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await syncLogos({ choix, variantes });
      setBilan(r.data);
    } catch (err) { setErreur(err.response?.data?.error || 'Erreur lors de la synchronisation'); }
    finally { setEnvoi(false); }
  };

  const fichiersDe = (d) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {(d.fichiers || []).map(f => f.action === 'a_trancher' || (variantes[f.id] && f.action) ? (
        <select key={f.id} className="form-control" title={f.nom}
          style={{ width: 'auto', height: 26, fontSize: 11, padding: '0 6px' }}
          value={variantes[f.id] || ''}
          onChange={e => setVariantes(v => ({ ...v, [f.id]: e.target.value }))}>
          <option value="">{f.nom.slice(0, 28)} : à trancher…</option>
          {Object.entries(VARIANTE_LABEL).map(([k, l]) => <option key={k} value={k}>{f.nom.slice(0, 20)} → {l}</option>)}
          <option value="ignorer">{f.nom.slice(0, 20)} → ignorer</option>
        </select>
      ) : f.action ? <PastilleFichier key={f.id} f={f} /> : (
        <span key={f.id} style={{ fontSize: 11, color: '#999' }}>{f.nom}</span>
      ))}
    </div>
  );

  const ligneAChoisir = (d) => (
    <div key={d.folder_id} style={{ padding: '8px 10px', border: '1px solid #e0e0e0', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13, flex: 1 }}>📁 {d.nom} <span style={{ fontWeight: 400, color: '#999' }}>({d.nb_fichiers})</span></strong>
        <select className="form-control" style={{ width: 240, height: 30, fontSize: 13 }}
          value={choix[d.folder_id] ?? ''}
          onChange={e => setChoix(c => {
            const n = { ...c };
            if (e.target.value === '') delete n[d.folder_id]; else n[d.folder_id] = e.target.value;
            return n;
          })}>
          <option value="">— Choisir le club —</option>
          {d.candidats.length > 0 && (
            <optgroup label="Suggestions">
              {d.candidats.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </optgroup>
          )}
          <optgroup label="Tous les clubs">
            {clubsTries.filter(c => !c.drive_folder_id).map(c => <option key={c.id} value={c.id}>{c.nom}{c.equipe && c.equipe !== c.nom ? ` (${c.equipe})` : ''}</option>)}
          </optgroup>
          <option value="ignorer">Ignorer ce dossier</option>
        </select>
      </div>
      {d.regle && <div style={{ fontSize: 11, color: '#999' }}>{d.regle}</div>}
      {d.statut === 'choisi' && fichiersDe(d)}
    </div>
  );

  const section = { fontSize: 14, fontWeight: 600, margin: '18px 0 8px' };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !envoi && onClose()}>
      <div className="modal" style={{ maxWidth: 820 }}>
        <div className="modal-header">
          <h3>Synchroniser les logos Drive</h3>
          <button className="btn-icon" onClick={onClose} disabled={envoi}>✕</button>
        </div>
        <div className="modal-body">
          {erreur && <div className="alert alert-error">❌ {erreur}</div>}
          {!plan && chargement && <div className="loading-center"><div className="spinner"></div></div>}

          {bilan ? (
            <div style={{ fontSize: 14 }}>
              <div className="alert alert-success">✅ Synchronisation terminée</div>
              <ul style={{ lineHeight: 1.8, paddingLeft: 18 }}>
                <li>{bilan.associes.length} dossier(s) associé(s)</li>
                <li>{bilan.telecharges.length} logo(s) téléchargé(s)
                  {bilan.telecharges.length > 0 && (
                    <ul style={{ color: '#555' }}>
                      {bilan.telecharges.map(t => <li key={t.url}>{t.club} · {VARIANTE_LABEL[t.variante]}</li>)}
                    </ul>
                  )}
                </li>
                <li>{bilan.a_jour} logo(s) déjà à jour</li>
                {bilan.ignores.length > 0 && <li>Dossier(s) ignoré(s) : {bilan.ignores.join(', ')}</li>}
              </ul>
              {bilan.erreurs.length > 0 && (
                <div className="alert alert-error" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                  <strong>{bilan.erreurs.length} erreur(s)</strong>
                  {bilan.erreurs.map(e => <div key={e.club + e.fichier}>{e.club} / {e.fichier} : {e.erreur}</div>)}
                </div>
              )}
            </div>
          ) : plan && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
                {[
                  [`${plan.resume.dossiers} dossiers`, '#f0f2f5', '#333'],
                  [`${surs.length} associés sûrs`, '#dcfce7', '#15803d'],
                  [`${ambigus.length} ambigus`, '#fef3c7', '#b45309'],
                  [`${aucun.length} sans correspondance`, '#fee2e2', '#b91c1c'],
                  [`${plan.resume.a_telecharger} logo(s) à télécharger`, '#dbeafe', '#1d4ed8'],
                ].map(([t, bg, c]) => <span key={t} style={{ padding: '4px 10px', borderRadius: 12, background: bg, color: c }}>{t}</span>)}
                {chargement && <span style={{ color: '#999' }}>⏳ mise à jour…</span>}
              </div>

              <div style={section}>Ambigus ({ambigus.length})</div>
              {ambigus.length === 0 ? <p style={{ fontSize: 13, color: '#999' }}>Aucun</p>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{ambigus.map(ligneAChoisir)}</div>}

              <div style={section}>Sans correspondance ({aucun.length})</div>
              {aucun.length === 0 ? <p style={{ fontSize: 13, color: '#999' }}>Aucun</p>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{aucun.map(ligneAChoisir)}</div>}

              <div style={{ ...section, display: 'flex', alignItems: 'center', gap: 8 }}>
                Associés sûrs ({surs.length})
                <button className="btn btn-ghost btn-sm" onClick={() => setVoirSurs(v => !v)}>{voirSurs ? 'Masquer' : 'Afficher'}</button>
              </div>
              {(voirSurs ? surs : surs.filter(d => d.fichiers.some(f => ['telecharger', 'a_trancher'].includes(f.action) || variantes[f.id])))
                .map(d => (
                  <div key={d.folder_id} style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <LogoThumb src={logoSrc(d.club?.logo_url)} label={d.club?.nom} />
                      <span style={{ flex: 1 }}>📁 {d.nom} → <strong>{d.club?.nom}</strong></span>
                    </div>
                    {fichiersDe(d)}
                  </div>
                ))}
              {!voirSurs && <p style={{ fontSize: 12, color: '#999' }}>Seuls les dossiers avec un logo à télécharger ou à trancher sont affichés.</p>}

              {ignores.length > 0 && (
                <p style={{ fontSize: 12, color: '#999', marginTop: 12 }}>
                  Non synchronisés : {ignores.map(d => d.statut === 'scr' ? `${d.nom} (logo SCR déjà en place)` : d.nom).join(', ')}
                </p>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          {bilan ? (
            <button className="btn btn-primary" onClick={onDone}>Fermer</button>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={onClose} disabled={envoi}>Annuler</button>
              <button className="btn btn-primary" onClick={synchroniser} disabled={!plan || chargement || envoi}>
                {envoi ? '⏳ Synchronisation…' : `✔ Synchroniser${plan ? ` (${plan.resume.a_telecharger} logo${plan.resume.a_telecharger > 1 ? 's' : ''})` : ''}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Fiche logos d'un club : 3 emplacements, dossier Drive lié, correction des variantes
function FicheLogosModal({ clubId, logoSrc, onClose, onChanged }) {
  const [data, setData]           = useState(null);
  const [erreur, setErreur]       = useState(null);
  const [message, setMessage]     = useState(null);
  const [occupe, setOccupe]       = useState(false);
  const [dossiers, setDossiers]   = useState(null);   // liste Drive, chargée à la demande
  const [dossierChoisi, setDossierChoisi] = useState('');

  const charger = useCallback(() => {
    getLogosClub(clubId)
      .then(r => { setData(r.data); setErreur(null); })
      .catch(err => setErreur(err.response?.data?.error || 'Erreur de chargement'));
  }, [clubId]);
  useEffect(() => { charger(); }, [charger]);

  const action = async (fn, succes) => {
    setOccupe(true);
    setErreur(null);
    try {
      const r = await fn();
      setMessage(typeof succes === 'function' ? succes(r.data) : succes);
      charger();
      onChanged();
    } catch (err) { setErreur(err.response?.data?.error || 'Erreur'); }
    finally { setOccupe(false); }
  };

  const ouvrirChangement = async () => {
    setDossierChoisi(data?.club.drive_folder_id || '');
    try { setDossiers((await getDossiersDrive()).data); }
    catch (err) { setErreur(err.response?.data?.error || 'Drive inaccessible'); }
  };

  const enregistrerDossier = () => action(
    () => setDossierDriveClub(clubId, dossierChoisi || null),
    (r) => {
      setDossiers(null);
      const n = r.synchro?.telecharges?.length || 0;
      return r.drive_folder_id ? `Dossier « ${r.drive_folder_nom} » lié${n ? `, ${n} logo(s) téléchargé(s)` : ''}` : 'Aucun dossier lié';
    });

  // Variante d'un fichier Drive : logo déjà téléchargé → correction ; sinon synchro de ce seul fichier
  const changerVariante = (f, v) => {
    const logo = data.logos.find(l => l.drive_file_id === f.id);
    if (logo && v !== 'ignorer') {
      return action(() => corrigerVarianteLogo(logo.id, v), 'Variante corrigée');
    }
    return action(
      () => syncLogos({ folder_ids: [data.club.drive_folder_id], variantes: { [f.id]: v } }),
      (r) => r.telecharges.length ? `${r.telecharges.length} logo téléchargé` : 'Rien à télécharger : cette variante est déjà en place ou ignorée');
  };

  if (!data) {
    return (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal"><div className="modal-body">
          {erreur ? <div className="alert alert-error">❌ {erreur}</div> : <div className="loading-center"><div className="spinner"></div></div>}
        </div></div>
      </div>
    );
  }

  const { club, logos, dossier } = data;
  const drive = (v) => logos.find(l => l.variante === v);
  const emplacements = [
    { v: 'classique',    existant: club.logo_url },
    { v: 'octobre_rose', existant: null },
    { v: 'monochrome',   existant: club.logo_monochrome_url },
  ];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !occupe && onClose()}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <h3>Logos — {club.nom}</h3>
          <button className="btn-icon" onClick={onClose} disabled={occupe}>✕</button>
        </div>
        <div className="modal-body">
          {erreur && <div className="alert alert-error">❌ {erreur}</div>}
          {message && <div className="alert alert-success">✅ {message}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            {emplacements.map(({ v, existant }) => {
              const l = drive(v);
              const url = existant || l?.fichier_local || null;
              return (
                <div key={v} style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{VARIANTE_LABEL[v]}</div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: 84, height: 84, borderRadius: 8, background: v === 'monochrome' ? '#333' : '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {url ? <img src={logoSrc(url)} alt={VARIANTE_LABEL[v]} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        : <span style={{ opacity: 0.3, fontSize: 22, color: v === 'monochrome' ? '#fff' : undefined }}>?</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#777', marginTop: 6, minHeight: 28 }}>
                    {existant ? 'Logo déjà en place' : l ? `Drive : ${l.drive_file_nom}` : v === 'monochrome' || v === 'octobre_rose' ? 'Absent → logo classique utilisé' : 'Absent'}
                  </div>
                  {!existant && l && (
                    <select className="form-control" style={{ height: 26, fontSize: 11, padding: '0 6px', marginTop: 4 }}
                      value={v} disabled={occupe} title="Corriger la variante de ce fichier"
                      onChange={e => action(() => corrigerVarianteLogo(l.id, e.target.value), 'Variante corrigée')}>
                      {Object.entries(VARIANTE_LABEL).map(([k, lab]) => <option key={k} value={k}>{lab}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 14, fontWeight: 600, margin: '18px 0 8px' }}>Dossier Google Drive</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
            <span style={{ flex: 1 }}>
              {club.drive_folder_id ? <>📁 <strong>{club.drive_folder_nom || dossier?.nom || club.drive_folder_id}</strong></> : <span style={{ color: '#999' }}>Aucun dossier lié</span>}
              {club.drive_folder_manuel && <span style={{ fontSize: 11, color: '#777' }}> · choisi à la main</span>}
            </span>
            {!dossiers && <button className="btn btn-secondary btn-sm" onClick={ouvrirChangement} disabled={occupe}>Changer l’association</button>}
          </div>
          {dossiers && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <select className="form-control" style={{ flex: 1 }} value={dossierChoisi} onChange={e => setDossierChoisi(e.target.value)}>
                <option value="">Aucun dossier</option>
                {dossiers.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" onClick={enregistrerDossier} disabled={occupe}>{occupe ? '⏳' : 'Enregistrer'}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setDossiers(null)} disabled={occupe}>Annuler</button>
            </div>
          )}

          {dossier?.erreur && <div className="alert alert-error" style={{ marginTop: 8 }}>❌ {dossier.erreur}</div>}
          {dossier?.fichiers?.length > 0 && (
            <table style={{ width: '100%', marginTop: 10, fontSize: 12 }}>
              <thead><tr><th style={{ textAlign: 'left' }}>Fichier</th><th style={{ textAlign: 'left' }}>Variante</th><th style={{ textAlign: 'left' }}>État</th></tr></thead>
              <tbody>
                {dossier.fichiers.map(f => (
                  <tr key={f.id}>
                    <td style={{ wordBreak: 'break-all' }}>{f.nom}</td>
                    <td>
                      <select className="form-control" style={{ height: 26, fontSize: 11, padding: '0 6px' }}
                        value={f.variante || 'ignorer'} disabled={occupe || f.mimeType === 'application/pdf'}
                        onChange={e => changerVariante(f, e.target.value)}>
                        {Object.entries(VARIANTE_LABEL).map(([k, lab]) => <option key={k} value={k}>{lab}</option>)}
                        <option value="ignorer">Ignoré</option>
                      </select>
                    </td>
                    <td><PastilleFichier f={f} etatSeul /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose} disabled={occupe}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ─── Doublons suggérés ────────────────────────────────────────────────────────
// Groupes renvoyés par GET /api/clubs/doublons : « probable » (même nom une fois
// retirés casse, accents, ponctuation et sigles FC/AS/US…), « à vérifier » (nom abrégé).

function DoublonsSuggeres({ groupes, logoSrc, onFusionner }) {
  const [ouvert, setOuvert] = useState(true);
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <h2>Doublons suggérés <span style={{ fontWeight: 400, fontSize: 14, color: 'var(--texte-gris)' }}>({groupes.length})</span></h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setOuvert(v => !v)}>{ouvert ? 'Masquer' : 'Afficher'}</button>
      </div>
      {ouvert && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
          {groupes.map(g => (
            <div key={g.clubs.map(c => c.id).join('-')} style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: '8px 12px', border: '1px solid #e0e0e0', borderRadius: 8,
            }}>
              {g.niveau === 'a_verifier' && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#fef3c7', color: '#b45309' }}>
                  à vérifier
                </span>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, flex: 1, alignItems: 'center' }}>
                {g.clubs.map(c => (
                  <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <LogoThumb src={logoSrc(c.logo_url)} label={c.nom} />
                    <span>
                      <strong>{c.equipe && c.equipe !== c.nom ? c.equipe : c.nom}</strong>
                      <span style={{ color: '#999', fontSize: 11 }}> #{c.id}{c.fff_cl_no ? ' · FFF' : ''}</span>
                    </span>
                  </span>
                ))}
              </div>
              {g.cl_no_differents && (
                <span style={{ fontSize: 12, color: '#b45309' }}>⚠ numéros FFF différents</span>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => onFusionner(g)}>Fusionner ce groupe</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modale de fusion ─────────────────────────────────────────────────────────
// Choix du club conservé, récapitulatif de POST /api/clubs/fusion/preview, puis
// POST /api/clubs/fusion. Les autres clubs sont absorbés dans l'ordre affiché
// (priorité pour reprendre un logo si le club conservé n'en a pas).

function FusionModal({ clubs, conserveInitial, logoSrc, onClose, onDone }) {
  const defaut = conserveInitial
    ?? (clubs.find(c => c.fff_cl_no && c.logo_url) || clubs.find(c => c.fff_cl_no) || clubs.find(c => c.logo_url) || clubs[0])?.id;
  const [conserveId, setConserveId] = useState(defaut);
  const [preview, setPreview]       = useState(null);
  const [erreur, setErreur]         = useState(null);
  const [chargement, setChargement] = useState(false);
  const [envoi, setEnvoi]           = useState(false);
  const [confirmeClNo, setConfirmeClNo] = useState(false);

  // Clé stable : le parent recrée `clubs` à chaque rendu
  const idsCle   = clubs.map(c => c.id).join(',');
  const absorbes = useMemo(
    () => idsCle.split(',').map(Number).filter(id => id !== conserveId),
    [idsCle, conserveId]);

  useEffect(() => {
    if (!conserveId || absorbes.length === 0) return;
    let annule = false;
    setChargement(true);
    setErreur(null);
    setConfirmeClNo(false);
    previewFusionClubs(conserveId, absorbes)
      .then(r => { if (!annule) setPreview(r.data); })
      .catch(err => { if (!annule) { setPreview(null); setErreur(err.response?.data?.error || 'Erreur lors de la prévisualisation'); } })
      .finally(() => { if (!annule) setChargement(false); });
    return () => { annule = true; };
  }, [conserveId, absorbes]);

  const besoinConfirmClNo = (preview?.cl_no_absorbes?.length || 0) > 0;
  const peutConfirmer = preview && preview.peut_fusionner && !chargement && !envoi
                     && (!besoinConfirmClNo || confirmeClNo);

  const confirmer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await fusionnerClubs(conserveId, absorbes, confirmeClNo);
      onDone(r.data);
    } catch (err) {
      setErreur(err.response?.data?.error || 'Erreur lors de la fusion');
      if (err.response?.data?.preview) setPreview(err.response.data.preview);
    } finally { setEnvoi(false); }
  };

  const nomDe = (id) => clubs.find(c => c.id === id)?.nom || `#${id}`;
  const section = { fontSize: 13, fontWeight: 600, margin: '16px 0 6px' };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !envoi && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h3>Fusionner {clubs.length} clubs</h3>
          <button className="btn-icon" onClick={onClose} disabled={envoi}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ ...section, marginTop: 0 }}>Club à conserver</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {clubs.map(c => (
              <label key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer',
                border: `1px solid ${c.id === conserveId ? 'var(--bleu)' : '#e0e0e0'}`, borderRadius: 8,
                background: c.id === conserveId ? 'var(--bleu-light)' : 'white',
              }}>
                <input type="radio" name="club-conserve" checked={c.id === conserveId} onChange={() => setConserveId(c.id)} />
                <LogoThumb src={logoSrc(c.logo_url)} label={c.nom} />
                <span style={{ flex: 1 }}>
                  <strong>{c.nom}</strong>
                  {c.equipe && c.equipe !== c.nom && <span style={{ color: '#666' }}> · équipe « {c.equipe} »</span>}
                  <span style={{ color: '#999', fontSize: 12 }}> #{c.id}</span>
                </span>
                {c.fff_cl_no
                  ? <span style={{ fontSize: 11, color: '#15803d' }}>FFF {c.fff_cl_no}</span>
                  : <span style={{ fontSize: 11, color: '#999' }}>non rattaché</span>}
              </label>
            ))}
          </div>

          {chargement && <div className="loading-center" style={{ padding: 16 }}><div className="spinner"></div></div>}

          {preview && !chargement && (
            <>
              <div style={section}>Ce qui va changer</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <LogoThumb src={logoSrc(preview.resultat.logo_url)} label="Logo retenu" />
                <span style={{ fontSize: 13 }}>
                  Logo retenu : {preview.resultat.logo_url
                    ? (preview.resultat.logo_source_id === preview.conserve.id ? 'celui du club conservé' : `repris de ${nomDe(preview.resultat.logo_source_id)}`)
                    : 'aucun'}
                  {preview.resultat.fff_cl_no && <> · FFF {preview.resultat.fff_cl_no}</>}
                </span>
              </div>
              <ul style={{ fontSize: 13, margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>
                  {preview.nb_matchs === 0 ? 'Aucun match à modifier'
                    : `${preview.nb_matchs} match${preview.nb_matchs > 1 ? 's' : ''} renommé${preview.nb_matchs > 1 ? 's' : ''}`}
                  {preview.matchs.length > 0 && (
                    <ul style={{ paddingLeft: 16, color: '#555' }}>
                      {preview.matchs.map(m => (
                        <li key={m.id}>{m.equipe} · {new Date(m.date).toLocaleDateString('fr-FR')} : « {m.avant} » → « {m.apres} »</li>
                      ))}
                    </ul>
                  )}
                </li>
                {preview.logos_temporaires > 0 && <li>{preview.logos_temporaires} logo(s) temporaire(s) rattaché(s) au club conservé</li>}
                {preview.aliases.length > 0 && (
                  <li>Noms gardés en alias (l'import FFF ne les recréera plus) : {preview.aliases.map(a => `« ${a.alias} »`).join(', ')}</li>
                )}
                <li>{preview.absorbes.length} club{preview.absorbes.length > 1 ? 's' : ''} supprimé{preview.absorbes.length > 1 ? 's' : ''} : {preview.absorbes.map(a => a.nom).join(', ')}</li>
              </ul>

              {preview.avertissements.map(a => (
                <div key={a} className="alert alert-warning" style={{ marginTop: 10, fontSize: 13 }}>⚠ {a}</div>
              ))}

              {besoinConfirmClNo && (
                <div className="alert alert-warning" style={{ marginTop: 10, fontSize: 13, flexDirection: 'column', alignItems: 'flex-start' }}>
                  <div>
                    ⚠ Pour la FFF, ce sont des clubs différents :{' '}
                    {preview.cl_no_absorbes.map(c => `${c.nom} (FFF ${c.fff_cl_no})`).join(', ')}.
                    Leurs matchs et classements s'afficheront sous le nom et le logo de « {preview.conserve.nom} ».
                  </div>
                  <label style={{ display: 'flex', gap: 6, marginTop: 6, cursor: 'pointer', fontWeight: 600 }}>
                    <input type="checkbox" checked={confirmeClNo} onChange={e => setConfirmeClNo(e.target.checked)} />
                    Je confirme la fusion
                  </label>
                </div>
              )}

              {preview.conflits.length > 0 && (
                <div className="alert alert-error" style={{ marginTop: 10, fontSize: 13, flexDirection: 'column', alignItems: 'flex-start' }}>
                  <strong>Fusion impossible : ces matchs porteraient le même adversaire le même jour.</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {preview.conflits.map(c => (
                      <li key={c.match_ids.join('-')}>
                        {c.equipe} · {new Date(c.date).toLocaleDateString('fr-FR')} · « {c.adversaire} » (matchs {c.match_ids.map(id => `#${id}`).join(', ')})
                      </li>
                    ))}
                  </ul>
                  Supprimez ou corrigez le match en double dans Programme, puis recommencez.
                </div>
              )}
            </>
          )}

          {erreur && <div className="alert alert-error" style={{ marginTop: 10 }}>❌ {erreur}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={envoi}>Annuler</button>
          <button className="btn btn-primary" onClick={confirmer} disabled={!peutConfirmer}>
            {envoi ? '⏳ Fusion…' : `✔ Fusionner dans « ${nomDe(conserveId)} »`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Miniature logo ───────────────────────────────────────────────────────────

function LogoThumb({ src, label, mono }) {
  const [err, setErr] = useState(false);
  const bg = mono ? '#333' : '#f5f5f5';
  return (
    <div title={label} style={{
      width: 36, height: 36, borderRadius: 6, border: '1px solid #e0e0e0',
      background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', flexShrink: 0,
    }}>
      {src && !err
        ? <img src={src} alt={label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={() => setErr(true)} />
        : <span style={{ fontSize: 16, opacity: 0.3 }}>?</span>}
    </div>
  );
}

// ─── Import logos en masse ────────────────────────────────────────────────────

function ImportLogosPanel({ clubs, onClose, onAlert }) {
  const [uploadedFiles, setUploadedFiles] = useState([]); // [{originalName, url, filename}]
  const [associations, setAssociations]   = useState({}); // {url: {colorClubId, monoClubId}}
  const [uploading, setUploading]         = useState(false);
  const [saving, setSaving]               = useState(false);
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const fd = new FormData();
    files.forEach(f => fd.append('logos', f));
    setUploading(true);
    try {
      const res = await bulkUploadLogos(fd);
      setUploadedFiles(prev => [...prev, ...res.data.files]);
      // Init associations
      const newAssoc = {};
      res.data.files.forEach(f => { newAssoc[f.url] = { colorClubId: '', monoClubId: '' }; });
      setAssociations(prev => ({ ...prev, ...newAssoc }));
    } catch (err) {
      onAlert('error', err.response?.data?.error || 'Erreur lors de l\'upload');
    } finally { setUploading(false); e.target.value = ''; }
  };

  const setAssoc = (url, field, value) => {
    setAssociations(prev => ({ ...prev, [url]: { ...prev[url], [field]: value } }));
  };

  const handleSave = async () => {
    const list = uploadedFiles
      .map(f => ({
        url:         f.url,
        colorClubId: associations[f.url]?.colorClubId || null,
        monoClubId:  associations[f.url]?.monoClubId  || null,
      }))
      .filter(a => a.colorClubId || a.monoClubId);

    if (list.length === 0) {
      onAlert('error', 'Associez au moins un logo à un club avant de confirmer');
      return;
    }
    setSaving(true);
    try {
      const res = await saveLogoAssociations(list);
      onAlert('success', `${res.data.updated} association(s) sauvegardée(s)`);
      onClose();
    } catch (err) {
      onAlert('error', err.response?.data?.error || 'Erreur lors de la sauvegarde');
    } finally { setSaving(false); }
  };

  return (
    <div className="card" style={{ marginBottom: 20, border: '2px solid var(--scr-green)' }}>
      <div className="card-header">
        <h2>Import logos en masse</h2>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Fermer</button>
      </div>
      <div style={{ padding: '16px 20px' }}>

        {/* Zone upload */}
        <div style={{ marginBottom: 20 }}>
          <input type="file" accept=".png,.jpg,.jpeg,.webp" multiple ref={fileRef}
            style={{ display: 'none' }} onChange={handleUpload} />
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? '⏳ Upload en cours...' : '⬆ Sélectionner des logos (PNG/JPG)'}
          </button>
          <span style={{ marginLeft: 12, fontSize: 13, color: '#888' }}>
            Plusieurs fichiers autorisés • max 30 logos
          </span>
        </div>

        {/* Grille d'association */}
        {uploadedFiles.length > 0 && (
          <>
            <p style={{ fontSize: 14, color: '#555', marginBottom: 12 }}>
              Pour chaque logo, choisissez le club associé (couleur et/ou monochrome) :
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
              {uploadedFiles.map(f => (
                <div key={f.url} style={{ border: '1px solid #e0e0e0', borderRadius: 10, padding: 12, background: '#fafafa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <img
                      src={`${API_BASE_URL}${f.url}`}
                      alt={f.originalName}
                      style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}
                      onError={e => { e.target.style.opacity = '0.3'; }}
                    />
                    <span style={{ fontSize: 12, color: '#666', wordBreak: 'break-all' }}>{f.originalName}</span>
                  </div>

                  {/* Club couleur */}
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="form-label" style={{ fontSize: 12 }}>Logo couleur → club</label>
                    <select className="form-control form-select" style={{ fontSize: 13 }}
                      value={associations[f.url]?.colorClubId || ''}
                      onChange={e => setAssoc(f.url, 'colorClubId', e.target.value)}>
                      <option value="">— Aucun —</option>
                      {clubs.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                    </select>
                  </div>

                  {/* Club monochrome */}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: 12 }}>Logo monochrome → club</label>
                    <select className="form-control form-select" style={{ fontSize: 13 }}
                      value={associations[f.url]?.monoClubId || ''}
                      onChange={e => setAssoc(f.url, 'monoClubId', e.target.value)}>
                      <option value="">— Aucun —</option>
                      {clubs.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '⏳ Sauvegarde...' : `✔ Confirmer les associations (${uploadedFiles.length} logo${uploadedFiles.length > 1 ? 's' : ''})`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Panel Modèles visuels ────────────────────────────────────────────────────

function ModelesPanel() {
  const [scoreLiveStatus, setScoreLiveStatus] = useState([]);
  const [resultatsStatus, setResultatsStatus] = useState([]);
  const [uploading, setUploading]             = useState(null); // 'sl_1' | 'res_2' | ...
  const [alert, setAlert]                     = useState(null);
  const fileRefs = useRef({});

  const showAlert = (type, msg) => { setAlert({ type, msg }); setTimeout(() => setAlert(null), 5000); };

  const loadStatus = useCallback(async () => {
    try {
      const [sl, res] = await Promise.all([
        getScoreLiveTemplateStatus(),
        getResultatsTemplateStatus(),
      ]);
      setScoreLiveStatus(sl.data.status);
      setResultatsStatus(res.data.status);
    } catch { showAlert('error', 'Erreur lors du chargement du statut'); }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleUploadSL = async (num, file) => {
    const key = `sl_${num}`;
    const fd  = new FormData();
    fd.append('template', file);
    setUploading(key);
    try {
      const r = await uploadScoreLiveTemplate(num, fd);
      showAlert('success', `Template Score Live SCR ${num} uploadé — ${r.data.size_kb} KB, ${r.data.width}×${r.data.height}px`);
      loadStatus();
    } catch (err) { showAlert('error', err.response?.data?.error || 'Erreur upload'); }
    finally { setUploading(null); if (fileRefs.current[key]) fileRefs.current[key].value = ''; }
  };

  const handleUploadRes = async (num, file) => {
    const key = `res_${num}`;
    const fd  = new FormData();
    fd.append('template', file);
    setUploading(key);
    try {
      const r = await uploadResultatTemplate(num, fd);
      showAlert('success', `Template Résultat ${num} match${num > 1 ? 's' : ''} uploadé — ${r.data.size_kb} KB, ${r.data.width}×${r.data.height}px`);
      loadStatus();
    } catch (err) { showAlert('error', err.response?.data?.error || 'Erreur upload'); }
    finally { setUploading(null); if (fileRefs.current[key]) fileRefs.current[key].value = ''; }
  };

  const statusBadge = (item) => {
    if (!item.exists) return <span style={{ fontSize: 12, color: '#e74c3c', fontWeight: 600 }}>Absent</span>;
    const isPlaceholder = item.size_kb < 200;
    return (
      <span style={{ fontSize: 12, color: isPlaceholder ? '#e67e22' : '#27ae60', fontWeight: 600 }}>
        {item.size_kb} KB{isPlaceholder ? ' — placeholder' : ' ✓'}
      </span>
    );
  };

  const UploadRow = ({ label, refKey, onUpload, statusItem }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        <div style={{ marginTop: 2 }}>{statusItem ? statusBadge(statusItem) : '—'}</div>
      </div>
      <input type="file" accept=".png" style={{ display: 'none' }}
        ref={el => { if (el) fileRefs.current[refKey] = el; }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
      <button
        className="btn btn-sm btn-primary"
        disabled={uploading === refKey}
        onClick={() => fileRefs.current[refKey]?.click()}
      >
        {uploading === refKey ? '⏳ Upload...' : '⬆ Remplacer'}
      </button>
    </div>
  );

  return (
    <>
      {alert && (
        <div className={`alert alert-${alert.type}`}>
          {alert.type === 'success' ? '✅' : '❌'} {alert.msg}
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h2>Templates Score Live</h2>
          <span style={{ fontSize: 13, color: '#888' }}>PNG 1080×1920px — un par équipe SCR</span>
        </div>
        <div style={{ padding: '4px 20px 12px' }}>
          <p style={{ fontSize: 13, color: '#666', margin: '8px 0 12px' }}>
            Un template différent peut être utilisé par équipe (SCR 1, 2, 3). Si un template est un placeholder (&lt; 200 KB), il sera remplacé par le vrai design.
          </p>
          {[1, 2, 3].map(num => (
            <UploadRow
              key={num}
              label={`Score Live — SCR ${num}`}
              refKey={`sl_${num}`}
              onUpload={file => handleUploadSL(num, file)}
              statusItem={scoreLiveStatus.find(s => s.num === num)}
            />
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Templates Résultats</h2>
          <span style={{ fontSize: 13, color: '#888' }}>PNG 940×788px — un par nombre de matchs</span>
        </div>
        <div style={{ padding: '4px 20px 12px' }}>
          <p style={{ fontSize: 13, color: '#666', margin: '8px 0 12px' }}>
            Un template différent selon le nombre de résultats affichés (1, 2 ou 3 matchs).
          </p>
          {[1, 2, 3].map(num => (
            <UploadRow
              key={num}
              label={`Résultats — ${num} match${num > 1 ? 's' : ''}`}
              refKey={`res_${num}`}
              onUpload={file => handleUploadRes(num, file)}
              statusItem={resultatsStatus.find(s => s.num === num)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Panel Joueurs ────────────────────────────────────────────────────────────

function JoueursPanel() {
  const [joueurs, setJoueurs]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editJoueur, setEditJoueur] = useState(null);
  const [form, setForm]             = useState({ prenom: '', nom: '' });
  const [saving, setSaving]         = useState(false);
  const [alert, setAlert]           = useState(null);
  const [search, setSearch]         = useState('');
  const [showExcel, setShowExcel]   = useState(false);
  const [uploadingVideoId, setUploadingVideoId] = useState(null);
  const videoRefs = useRef({});

  const showAlert = (type, msg) => { setAlert({ type, msg }); setTimeout(() => setAlert(null), 5000); };

  const loadJoueurs = useCallback(async () => {
    try { setLoading(true); const r = await getJoueurs(); setJoueurs(r.data); }
    catch { showAlert('error', 'Erreur lors du chargement'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadJoueurs(); }, [loadJoueurs]);

  const openCreate = () => { setEditJoueur(null); setForm({ prenom: '', nom: '' }); setShowModal(true); };
  const openEdit   = (j) => { setEditJoueur(j);   setForm({ prenom: j.prenom, nom: j.nom }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.prenom.trim() || !form.nom.trim()) return showAlert('error', 'Prénom et nom requis');
    setSaving(true);
    try {
      if (editJoueur) { await updateJoueur(editJoueur.id, form); showAlert('success', 'Joueur modifié'); }
      else            { await createJoueur(form);                 showAlert('success', 'Joueur ajouté'); }
      setShowModal(false); loadJoueurs();
    } catch (err) { showAlert('error', err.response?.data?.error || 'Erreur'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (j) => {
    if (!confirm(`Supprimer ${j.prenom} ${j.nom} ?`)) return;
    try { await deleteJoueur(j.id); showAlert('success', 'Joueur supprimé'); loadJoueurs(); }
    catch { showAlert('error', 'Erreur lors de la suppression'); }
  };

  const handleVideoUpload = async (joueur, file) => {
    const fd = new FormData();
    fd.append('video', file);
    setUploadingVideoId(joueur.id);
    try {
      await uploadCelebrationVideo(joueur.id, fd);
      showAlert('success', `Vidéo de ${joueur.prenom} ${joueur.nom} uploadée`);
      loadJoueurs();
    } catch (err) {
      showAlert('error', err.response?.data?.error || 'Erreur lors de l\'upload vidéo');
    } finally {
      setUploadingVideoId(null);
      if (videoRefs.current[joueur.id]) videoRefs.current[joueur.id].value = '';
    }
  };

  const filtered = joueurs.filter(j =>
    `${j.prenom} ${j.nom}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      {alert && (
        <div className={`alert alert-${alert.type}`}>
          {alert.type === 'success' ? '✅' : '❌'} {alert.msg}
        </div>
      )}

      {showExcel && (
        <ExcelImportPanel
          onClose={() => { setShowExcel(false); loadJoueurs(); }}
          onAlert={showAlert}
        />
      )}

      <div className="card">
        <div className="card-header">
          <h2>Joueurs SCR Roeschwoog</h2>
          <div className="actions-bar">
            <input className="form-control" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher..." style={{ width: 200 }} />
            <button className="btn btn-secondary btn-sm" onClick={() => setShowExcel(v => !v)}>
              Importer depuis Excel
            </button>
            <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Ajouter</button>
          </div>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner"></div></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <span className="icon">👤</span>
            <h3>{search ? 'Aucun résultat' : 'Aucun joueur'}</h3>
            <p>Ajoutez les joueurs pour les utiliser dans le Score Live</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>#</th><th>Prénom</th><th>Nom</th><th>Vidéo</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map((j, idx) => (
                  <tr key={j.id}>
                    <td style={{ color: 'var(--texte-gris)', width: 40 }}>{idx + 1}</td>
                    <td>{j.prenom}</td>
                    <td><strong>{j.nom}</strong></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input type="file" accept=".mp4,.mov,.avi,.webm" style={{ display: 'none' }}
                          ref={el => { if (el) videoRefs.current[j.id] = el; }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoUpload(j, f); }} />
                        <button
                          className="btn btn-sm btn-ghost" title={j.video_celebration_url ? 'Remplacer la vidéo' : 'Uploader une vidéo de célébration'}
                          disabled={uploadingVideoId === j.id}
                          onClick={() => videoRefs.current[j.id]?.click()}
                          style={{ fontSize: 14, padding: '2px 7px' }}
                        >
                          {uploadingVideoId === j.id ? '⏳' : '🎬'}
                        </button>
                        {j.video_celebration_url && (
                          <span style={{ fontSize: 11, color: 'var(--vert-success)', fontWeight: 600 }}>✔</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(j)}>✏️</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(j)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{editJoueur ? 'Modifier le joueur' : 'Nouveau joueur'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Prénom *</label>
                  <input className="form-control" value={form.prenom}
                    onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} placeholder="Nathan" autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Nom *</label>
                  <input className="form-control" value={form.nom}
                    onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="L." />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '⏳...' : editJoueur ? '✔ Modifier' : '✔ Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Import Excel joueurs ─────────────────────────────────────────────────────

function ExcelImportPanel({ onClose, onAlert }) {
  const [preview, setPreview]   = useState(null); // {joueurs, total, prenom_col, nom_col}
  const [parsing, setParsing]   = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult]     = useState(null);  // {inserted, skipped}
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('fichier', file);
    setParsing(true);
    setPreview(null);
    setResult(null);
    try {
      const res = await previewExcel(fd);
      setPreview(res.data);
    } catch (err) {
      onAlert('error', err.response?.data?.error || 'Erreur lors de la lecture du fichier');
    } finally { setParsing(false); e.target.value = ''; }
  };

  const handleConfirm = async () => {
    if (!preview?.joueurs?.length) return;
    setImporting(true);
    try {
      const res = await confirmImportJoueurs(preview.joueurs);
      setResult(res.data);
      setPreview(null);
      onAlert('success', `Import terminé : ${res.data.inserted} ajouté(s), ${res.data.skipped} ignoré(s)`);
    } catch (err) {
      onAlert('error', err.response?.data?.error || 'Erreur lors de l\'import');
    } finally { setImporting(false); }
  };

  return (
    <div className="card" style={{ marginBottom: 20, border: '2px solid var(--scr-green)' }}>
      <div className="card-header">
        <h2>Import joueurs depuis Excel</h2>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Fermer</button>
      </div>
      <div style={{ padding: '16px 20px' }}>

        {/* Instructions */}
        <div style={{ background: '#f0f9f4', border: '1px solid #a8d5b8', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          Le fichier Excel doit contenir deux colonnes nommées <strong>Prénom</strong> et <strong>Nom</strong> (insensible à la casse).
          Les doublons (même prénom + même nom) sont ignorés silencieusement.
        </div>

        {/* Upload */}
        <div style={{ marginBottom: 20 }}>
          <input type="file" accept=".xlsx,.xls,.ods" ref={fileRef} style={{ display: 'none' }} onChange={handleFile} />
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={parsing}>
            {parsing ? '⏳ Lecture en cours...' : 'Choisir un fichier Excel (.xlsx)'}
          </button>
        </div>

        {/* Aperçu */}
        {preview && (
          <div>
            <p style={{ marginBottom: 12, fontSize: 14 }}>
              <strong>{preview.total} joueur{preview.total > 1 ? 's' : ''}</strong> détecté{preview.total > 1 ? 's' : ''}
              {' '}— colonnes détectées : <code>{preview.prenom_col}</code> / <code>{preview.nom_col}</code>
            </p>
            <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 8, marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>#</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Prénom</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Nom</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.joueurs.map((j, idx) => (
                    <tr key={idx} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '6px 12px', color: '#888' }}>{idx + 1}</td>
                      <td style={{ padding: '6px 12px' }}>{j.prenom}</td>
                      <td style={{ padding: '6px 12px', fontWeight: 600 }}>{j.nom}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" onClick={handleConfirm} disabled={importing}>
                {importing ? '⏳ Import en cours...' : `✔ Confirmer l'import (${preview.total} joueurs)`}
              </button>
              <button className="btn btn-ghost" onClick={() => setPreview(null)}>Annuler</button>
            </div>
          </div>
        )}

        {/* Résultat */}
        {result && (
          <div style={{ background: '#f0f9f4', border: '1px solid #a8d5b8', borderRadius: 8, padding: '12px 16px', fontSize: 14 }}>
            Import terminé : <strong>{result.inserted}</strong> joueur{result.inserted > 1 ? 's' : ''} ajouté{result.inserted > 1 ? 's' : ''},
            {' '}<strong>{result.skipped}</strong> ignoré{result.skipped > 1 ? 's' : ''} (doublons ou données manquantes).
          </div>
        )}
      </div>
    </div>
  );
}
