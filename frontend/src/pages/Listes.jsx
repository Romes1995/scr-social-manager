import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  getClubs, createClub, updateClub, deleteClub,
  getJoueurs, createJoueur, updateJoueur, deleteJoueur,
  uploadClubLogo, uploadScrLogo, uploadScrLogoMono, bulkUploadLogos, saveLogoAssociations,
  previewExcel, confirmImportJoueurs, uploadCelebrationVideo,
  getScoreLiveTemplateStatus, getResultatsTemplateStatus,
  uploadScoreLiveTemplate, uploadResultatTemplate,
  API_BASE_URL,
} from '../services/api';

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
      </div>

      {activeTab === 'clubs'   && <ClubsPanel />}
      {activeTab === 'joueurs' && <JoueursPanel />}
      {activeTab === 'modeles' && <ModelesPanel />}
    </div>
  );
}

// ─── Logo SCR ─────────────────────────────────────────────────────────────────

function ScrLogoSection() {
  const [logoSrc, setLogoSrc]         = useState(null);
  const [monoSrc, setMonoSrc]         = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [uploadingMono, setUploadingMono] = useState(false);
  const [msg, setMsg]                 = useState(null);
  const fileRef     = useRef(null);
  const fileRefMono = useRef(null);
  const base     = `${API_BASE_URL}/uploads/logos/scr.png`;
  const baseMono = `${API_BASE_URL}/uploads/logos/scr_monochrome.png`;

  useEffect(() => {
    setLogoSrc(`${base}?t=${Date.now()}`);
    setMonoSrc(`${baseMono}?t=${Date.now()}`);
  }, []);

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
  const fileRefs = useRef({});

  const showAlert = (type, msg) => { setAlert({ type, msg }); setTimeout(() => setAlert(null), 5000); };

  const loadClubs = useCallback(async () => {
    try { setLoading(true); const r = await getClubs(); setClubs(r.data); }
    catch { showAlert('error', 'Erreur lors du chargement'); }
    finally { setLoading(false); }
  }, []);

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
                  return (
                    <tr key={group.nom}>
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
                      <td><strong>{group.nom}</strong></td>
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
