import { useState, useEffect, useCallback } from 'react';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate, genererImage } from '../services/api';
import './Templates.css';

const TYPES = ['programme', 'matchday', 'score_live', 'resultats'];
const EQUIPES = ['SCR 1', 'SCR 2', 'SCR 3', 'Toutes'];
const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

const ZONE_TEMPLATE = { id: '', label: '', x: 50, y: 50, width: 300, height: 60, fontSize: 36, color: '#ffffff', bold: false, placeholder: '' };

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [form, setForm] = useState({ nom: '', type: 'programme', equipe: 'Toutes' });
  const [fichier, setFichier] = useState(null);
  const [zones, setZones] = useState([]);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [filterType, setFilterType] = useState('');
  const [genValeurs, setGenValeurs] = useState({});
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState(null);

  const showAlert = (type, msg) => {
    setAlert({ type, msg });
    setTimeout(() => setAlert(null), 4000);
  };

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const params = filterType ? { type: filterType } : {};
      const res = await getTemplates(params);
      setTemplates(res.data);
    } catch {
      showAlert('error', 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const openCreate = () => {
    setForm({ nom: '', type: 'programme', equipe: 'Toutes' });
    setFichier(null);
    setZones([]);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nom.trim()) return showAlert('error', 'Le nom est requis');
    if (!fichier) return showAlert('error', 'Veuillez sélectionner une image');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('nom', form.nom);
      fd.append('type', form.type);
      fd.append('equipe', form.equipe === 'Toutes' ? '' : form.equipe);
      fd.append('zones', JSON.stringify(zones));
      fd.append('fichier', fichier);
      await createTemplate(fd);
      showAlert('success', 'Template créé avec succès');
      setShowModal(false);
      loadTemplates();
    } catch (err) {
      showAlert('error', err.response?.data?.error || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t) => {
    if (!confirm(`Supprimer le template "${t.nom}" ?`)) return;
    try {
      await deleteTemplate(t.id);
      showAlert('success', 'Template supprimé');
      loadTemplates();
    } catch {
      showAlert('error', 'Erreur lors de la suppression');
    }
  };

  const openZones = (template) => {
    setSelectedTemplate(template);
    setZones(template.zones || []);
    setGenValeurs({});
    setGeneratedUrl(null);
    setShowZoneModal(true);
  };

  const saveZones = async () => {
    setSaving(true);
    try {
      await updateTemplate(selectedTemplate.id, {
        nom: selectedTemplate.nom,
        type: selectedTemplate.type,
        equipe: selectedTemplate.equipe,
        zones: zones,
      });
      showAlert('success', 'Zones sauvegardées');
      loadTemplates();
    } catch {
      showAlert('error', 'Erreur lors de la sauvegarde des zones');
    } finally {
      setSaving(false);
    }
  };

  const addZone = () => {
    setZones(prev => [...prev, { ...ZONE_TEMPLATE, id: `zone_${Date.now()}` }]);
  };

  const updateZone = (idx, field, value) => {
    setZones(prev => prev.map((z, i) => i === idx ? { ...z, [field]: value } : z));
  };

  const removeZone = (idx) => {
    setZones(prev => prev.filter((_, i) => i !== idx));
  };

  const handleGenerer = async () => {
    if (!selectedTemplate) return;
    setGenerating(true);
    try {
      const res = await genererImage(selectedTemplate.id, genValeurs);
      setGeneratedUrl(res.data.url);
      showAlert('success', 'Image générée avec succès');
    } catch {
      showAlert('error', 'Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  };

  const typeLabel = (t) => {
    const map = { programme: 'Programme', matchday: 'Match Day', score_live: 'Score Live', resultats: 'Résultats' };
    return map[t] || t;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Templates</h1>
          <p className="page-subtitle">Gérez vos templates visuels pour les publications</p>
        </div>
        <div className="actions-bar">
          <select className="form-control form-select" value={filterType}
            onChange={e => setFilterType(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Tous les types</option>
            {TYPES.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </select>
          <button className="btn btn-primary" onClick={openCreate}>
            + Nouveau template
          </button>
        </div>
      </div>

      {alert && (
        <div className={`alert alert-${alert.type}`}>
          {alert.type === 'success' ? '✅' : '❌'} {alert.msg}
        </div>
      )}

      {loading ? (
        <div className="loading-center"><div className="spinner"></div></div>
      ) : templates.length === 0 ? (
        <div className="empty-state card" style={{ padding: '60px 24px' }}>
          <span className="icon">🎨</span>
          <h3>Aucun template</h3>
          <p>Créez votre premier template en uploadant une image PNG ou JPG</p>
        </div>
      ) : (
        <div className="templates-grid">
          {templates.map(t => (
            <div key={t.id} className="template-card card">
              <div className="template-preview">
                {t.fichier ? (
                  <img src={`${API_BASE}${t.fichier}`} alt={t.nom} />
                ) : (
                  <div className="template-placeholder">🎨</div>
                )}
                <div className="template-overlay">
                  <span className="template-type-badge">{typeLabel(t.type)}</span>
                </div>
              </div>
              <div className="template-info">
                <h3>{t.nom}</h3>
                <p>{t.equipe || 'Toutes équipes'} • {(t.zones || []).length} zone(s)</p>
              </div>
              <div className="template-actions">
                <button className="btn btn-primary btn-sm" onClick={() => openZones(t)}>
                  Zones & Génération
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(t)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal création */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Nouveau template</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nom du template *</label>
                <input className="form-control" value={form.nom}
                  onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                  placeholder="Ex: Affiche match domicile SCR 1" />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-control form-select" value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    {TYPES.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Équipe</label>
                  <select className="form-control form-select" value={form.equipe}
                    onChange={e => setForm(f => ({ ...f, equipe: e.target.value }))}>
                    {EQUIPES.map(eq => <option key={eq}>{eq}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Image template (PNG/JPG) *</label>
                <input type="file" className="form-control" accept=".png,.jpg,.jpeg"
                  onChange={e => setFichier(e.target.files[0])} />
                {fichier && (
                  <p style={{ fontSize: 12, color: 'var(--texte-gris)', marginTop: 4 }}>
                    ✅ {fichier.name} ({(fichier.size / 1024).toFixed(0)} KB)
                  </p>
                )}
              </div>
              <div className="alert alert-info" style={{ marginTop: 8 }}>
                💡 Vous pourrez définir les zones de texte après avoir créé le template
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '⏳ Upload...' : '✔ Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal zones de texte */}
      {showZoneModal && selectedTemplate && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowZoneModal(false)}>
          <div className="modal" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <h3>Zones — {selectedTemplate.nom}</h3>
              <button className="btn-icon" onClick={() => setShowZoneModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="zones-layout">
                {/* Preview image */}
                <div className="zone-preview-container">
                  <div className="zone-preview-label">Aperçu template</div>
                  <img src={`${API_BASE}${selectedTemplate.fichier}`} alt="Template" className="zone-preview-img" />
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--texte-gris)' }}>
                    Les zones sont définies par coordonnées X/Y depuis le coin supérieur gauche
                  </div>
                </div>

                {/* Configuration zones */}
                <div className="zones-config">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <strong>Zones de texte ({zones.length})</strong>
                    <button className="btn btn-sm btn-primary" onClick={addZone}>+ Zone</button>
                  </div>

                  {zones.length === 0 ? (
                    <div className="alert alert-info">Ajoutez des zones pour définir où le texte sera inséré</div>
                  ) : (
                    zones.map((zone, idx) => (
                      <div key={idx} className="zone-item card">
                        <div className="zone-item-header">
                          <strong>Zone {idx + 1}</strong>
                          <button className="btn btn-sm btn-danger" onClick={() => removeZone(idx)}>✕</button>
                        </div>
                        <div className="grid-2">
                          <div className="form-group">
                            <label className="form-label">Label</label>
                            <input className="form-control" value={zone.label || ''}
                              onChange={e => updateZone(idx, 'label', e.target.value)} placeholder="ex: Équipe domicile" />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Placeholder</label>
                            <input className="form-control" value={zone.placeholder || ''}
                              onChange={e => updateZone(idx, 'placeholder', e.target.value)} placeholder="ex: SCR 1" />
                          </div>
                        </div>
                        <div className="grid-2">
                          <div className="form-group">
                            <label className="form-label">X</label>
                            <input type="number" className="form-control" value={zone.x}
                              onChange={e => updateZone(idx, 'x', parseInt(e.target.value))} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Y</label>
                            <input type="number" className="form-control" value={zone.y}
                              onChange={e => updateZone(idx, 'y', parseInt(e.target.value))} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Largeur</label>
                            <input type="number" className="form-control" value={zone.width}
                              onChange={e => updateZone(idx, 'width', parseInt(e.target.value))} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Hauteur</label>
                            <input type="number" className="form-control" value={zone.height}
                              onChange={e => updateZone(idx, 'height', parseInt(e.target.value))} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Taille police</label>
                            <input type="number" className="form-control" value={zone.fontSize}
                              onChange={e => updateZone(idx, 'fontSize', parseInt(e.target.value))} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Couleur</label>
                            <input type="color" className="form-control" value={zone.color || '#ffffff'}
                              onChange={e => updateZone(idx, 'color', e.target.value)} style={{ height: 38, padding: 4 }} />
                          </div>
                        </div>
                      </div>
                    ))
                  )}

                  {/* Génération test */}
                  {zones.length > 0 && (
                    <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--bordure)' }}>
                      <strong style={{ display: 'block', marginBottom: 12 }}>Test de génération</strong>
                      {zones.map((zone, idx) => (
                        <div className="form-group" key={idx}>
                          <label className="form-label">{zone.label || `Zone ${idx + 1}`}</label>
                          <input className="form-control" value={genValeurs[zone.id || idx] || ''}
                            onChange={e => setGenValeurs(v => ({ ...v, [zone.id || idx]: e.target.value }))}
                            placeholder={zone.placeholder || 'Texte à afficher'} />
                        </div>
                      ))}
                      <button className="btn btn-secondary" onClick={handleGenerer} disabled={generating}>
                        {generating ? '⏳ Génération...' : '🎨 Générer l\'image'}
                      </button>
                      {generatedUrl && (
                        <div style={{ marginTop: 12 }}>
                          <img src={generatedUrl} alt="Généré" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--bordure)' }} />
                          <a href={generatedUrl} download className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>
                            ⬇ Télécharger
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowZoneModal(false)}>Fermer</button>
              <button className="btn btn-primary" onClick={saveZones} disabled={saving}>
                {saving ? '⏳...' : '✔ Sauvegarder zones'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
