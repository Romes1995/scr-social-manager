import { useState, useEffect, useCallback, useRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Text, Transformer, Group } from 'react-konva';
import { HexColorPicker } from 'react-colorful';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate, genererImage, genererDynamique, getMatches } from '../services/api';
import './Templates.css';

// ── Constantes ────────────────────────────────────────────────────────────────

const TYPES   = ['programme', 'matchday', 'score_live', 'resultats'];
const EQUIPES = ['SCR 1', 'SCR 2', 'SCR 3', 'Toutes'];
const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

const FONTS = [
  'Arial', 'Bebas Neue', 'Oswald', 'Montserrat', 'Anton',
  'Roboto Condensed', 'Impact', 'Open Sans',
];

const ZONE_COLORS = [
  '#4ade80', '#60a5fa', '#f472b6', '#fb923c',
  '#a78bfa', '#34d399', '#fbbf24', '#f87171',
];

const PREVIEW_MAX_W = 280;
const PREVIEW_MAX_H = 500;

const ZONE_TEMPLATE = {
  id: '', label: '', x: 50, y: 50, width: 300, height: 60,
  fontSize: 36, color: '#ffffff', bold: false, placeholder: '',
  fontFamily: 'Arial', type: 'texte_fixe',
};

const DYNAMIC_ELEMENTS = {
  images: [
    { source: 'logo_domicile',  label: 'Logo domicile',   icon: '🏠', w: 250, h: 250 },
    { source: 'logo_exterieur', label: 'Logo extérieur',  icon: '✈️', w: 250, h: 250 },
    { source: 'logo_scr',       label: 'Logo SCR (fixe)', icon: '🏆', w: 250, h: 250 },
  ],
  textes: [
    { source: 'nom_domicile',  label: 'Nom équipe domicile',  icon: '🏠' },
    { source: 'nom_exterieur', label: 'Nom équipe extérieur', icon: '✈️' },
    { source: 'date_match',    label: 'Date',                 icon: '📅', example: 'Dimanche 4 Mai' },
    { source: 'heure_match',   label: 'Heure',                icon: '🕐', example: '15h00' },
    { source: 'lieu_stade',    label: 'Lieu / Stade',         icon: '📍' },
    { source: 'division',      label: 'Division',             icon: '🏅' },
  ],
};

const TYPE_LABELS = {
  texte_fixe:      'Texte fixe',
  texte_dynamique: 'Dynamique',
  image_dynamique: 'Image',
};

// ── Helpers de formatage ──────────────────────────────────────────────────────

const JOURS_FR = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const MOIS_FR  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function formatDateFR(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${JOURS_FR[dt.getDay()]} ${d} ${MOIS_FR[m - 1]} ${y}`;
}

function formatHeure(heureStr) {
  if (!heureStr) return '';
  const [h, min] = heureStr.slice(0, 5).split(':');
  return `${h}h${min}`;
}

function resolveTexts(match) {
  const dom    = match.domicile !== false;
  const nomDom = dom ? (match.equipe || '') : (match.adversaire || '');
  const nomExt = dom ? (match.adversaire || '') : (match.equipe || '');
  return {
    nom_domicile:  nomDom,
    nom_exterieur: nomExt,
    date_match:    formatDateFR(match.date),
    heure_match:   formatHeure(match.heure),
    lieu_stade:    match.lieu || 'Roeschwoog',
    division:      match.division || '',
  };
}

function resolveImageUrls(match) {
  const dom        = match.domicile !== false;
  const scrLogoUrl = `${API_BASE}/uploads/logos/scr.png`;
  const advLogoUrl = match.logo_adversaire || null;
  return {
    logo_domicile:  dom ? scrLogoUrl : advLogoUrl,
    logo_exterieur: dom ? advLogoUrl : scrLogoUrl,
    logo_scr:       scrLogoUrl,
  };
}

async function loadImages(urlMap) {
  const result = {};
  await Promise.all(
    Object.entries(urlMap).map(([source, url]) => {
      if (!url) return Promise.resolve();
      return new Promise((resolve) => {
        const img = new window.Image();
        img.onload  = () => { result[source] = img; resolve(); };
        img.onerror = () => resolve();
        img.src = url; // pas de crossOrigin pour les URLs CDN (taint canvas acceptable en preview)
      });
    })
  );
  return result;
}

// ── ZoneRect ──────────────────────────────────────────────────────────────────
function ZoneRect({ zone, idx, scale, isSelected, onSelect, onUpdate, previewImage, previewText }) {
  const groupRef = useRef(null);
  const trRef    = useRef(null);

  useEffect(() => {
    if (isSelected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const zoneType = zone.type || 'texte_fixe';
  const stroke   = ZONE_COLORS[idx % ZONE_COLORS.length];
  const gw       = zone.width  * scale;
  const gh       = zone.height * scale;

  // ── Contenu selon type et mode preview ──
  let content;

  if (zoneType === 'image_dynamique' && previewImage) {
    // Image réelle avec fit "contain" + bordure subtile
    const imgW      = previewImage.width || previewImage.naturalWidth || 1;
    const imgH      = previewImage.height || previewImage.naturalHeight || 1;
    const imgAspect = imgW / imgH;
    const boxAspect = gw / gh;
    let drawW, drawH, drawX = 0, drawY = 0;
    if (imgAspect > boxAspect) {
      drawW = gw;  drawH = gw / imgAspect; drawY = (gh - drawH) / 2;
    } else {
      drawH = gh;  drawW = gh * imgAspect; drawX = (gw - drawW) / 2;
    }
    content = (
      <>
        <KonvaImage image={previewImage} x={drawX} y={drawY} width={drawW} height={drawH} />
        <Rect width={gw} height={gh} fill="transparent"
          stroke={stroke} strokeWidth={1.5} strokeScaleEnabled={false} dash={[4, 2]} />
      </>
    );

  } else if (zoneType === 'texte_dynamique' && previewText) {
    // Texte réel avec la police/couleur/alignement du zone
    const fs = Math.max(6, Math.round((zone.fontSize || 60) * scale));
    content = (
      <>
        <Rect width={gw} height={gh} fill="rgba(0,0,0,0.08)"
          stroke={stroke} strokeWidth={1.5} strokeScaleEnabled={false} dash={[4, 2]} />
        <Text
          width={gw}
          height={gh}
          text={previewText}
          fontSize={fs}
          fontFamily={zone.fontFamily || 'Arial'}
          fill={zone.color || '#ffffff'}
          align={zone.align || 'center'}
          verticalAlign="middle"
          listening={false}
          stroke="#000000"
          strokeWidth={Math.max(0.3, 1.5 * scale)}
          wrap="word"
        />
      </>
    );

  } else {
    // Placeholder (mode édition normal)
    let fillRgba, dash, displayLabel;
    if (zoneType === 'image_dynamique') {
      fillRgba     = 'rgba(96, 165, 250, 0.18)';
      dash         = [8, 4];
      displayLabel = zone.label || zone.source || `Image ${idx + 1}`;
    } else if (zoneType === 'texte_dynamique') {
      fillRgba     = 'rgba(167, 139, 250, 0.18)';
      dash         = [6, 3];
      displayLabel = `[${zone.label || zone.source || `Dyn ${idx + 1}`}]`;
    } else {
      const hex = zone.color || '#ffffff';
      const r   = parseInt(hex.slice(1, 3), 16) || 255;
      const g   = parseInt(hex.slice(3, 5), 16) || 255;
      const b   = parseInt(hex.slice(5, 7), 16) || 255;
      fillRgba     = `rgba(${r},${g},${b},0.22)`;
      dash         = null;
      displayLabel = zone.label || `Zone ${idx + 1}`;
    }
    const labelSize = Math.min(12, Math.max(8, gh * 0.35));
    content = (
      <>
        <Rect
          width={gw}
          height={gh}
          fill={fillRgba}
          stroke={stroke}
          strokeWidth={isSelected ? 2 : 1.5}
          strokeScaleEnabled={false}
          dash={dash || undefined}
          cornerRadius={2}
        />
        {gh > 14 && (
          <Text
            x={4}
            y={Math.max(0, gh / 2 - labelSize / 2)}
            width={Math.max(0, gw - 8)}
            text={displayLabel}
            fontSize={labelSize}
            fill={stroke}
            listening={false}
            ellipsis
            wrap="none"
          />
        )}
      </>
    );
  }

  return (
    <>
      <Group
        ref={groupRef}
        x={zone.x * scale}
        y={zone.y * scale}
        draggable
        onClick={() => onSelect(idx)}
        onTap={() => onSelect(idx)}
        onDragEnd={(e) => onUpdate({
          x: Math.round(e.target.x() / scale),
          y: Math.round(e.target.y() / scale),
        })}
        onTransformEnd={() => {
          const node = groupRef.current;
          const sx   = node.scaleX();
          const sy   = node.scaleY();
          const newX = Math.round(node.x() / scale);
          const newY = Math.round(node.y() / scale);
          const newW = Math.max(10, Math.round(zone.width  * sx));
          const newH = Math.max(10, Math.round(zone.height * sy));
          node.scaleX(1);
          node.scaleY(1);
          onUpdate({ x: newX, y: newY, width: newW, height: newH });
        }}
      >
        {content}
      </Group>

      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          keepRatio={false}
          enabledAnchors={[
            'top-left','top-center','top-right',
            'middle-left','middle-right',
            'bottom-left','bottom-center','bottom-right',
          ]}
          boundBoxFunc={(oldBox, newBox) =>
            (newBox.width < 10 || newBox.height < 10) ? oldBox : newBox
          }
        />
      )}
    </>
  );
}

// ── ColorPickerField ──────────────────────────────────────────────────────────
function ColorPickerField({ color, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="color-picker-field">
      <div className="color-swatch" style={{ background: color }} onClick={() => setOpen(o => !o)} />
      <span className="color-hex">{color}</span>
      {open && (
        <div className="color-popover">
          <HexColorPicker color={color} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function Templates() {
  const [templates,        setTemplates]        = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [showModal,        setShowModal]        = useState(false);
  const [showZoneModal,    setShowZoneModal]    = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [form,             setForm]             = useState({ nom: '', type: 'programme', equipe: 'Toutes' });
  const [fichier,          setFichier]          = useState(null);
  const [zones,            setZones]            = useState([]);
  const [saving,           setSaving]           = useState(false);
  const [alert,            setAlert]            = useState(null);
  const [filterType,       setFilterType]       = useState('');
  const [genValeurs,       setGenValeurs]       = useState({});
  const [generating,       setGenerating]       = useState(false);
  const [generatedUrl,     setGeneratedUrl]     = useState(null);

  // Canvas Konva
  const [bgImage,          setBgImage]          = useState(null);
  const [imgSize,          setImgSize]          = useState({ w: 1080, h: 1920 });
  const [selectedZoneIdx,  setSelectedZoneIdx]  = useState(null);

  // Menu "+ Élément"
  const [showElemMenu,     setShowElemMenu]     = useState(false);
  const elemMenuRef = useRef(null);

  // Aperçu avec données match
  const [showPreviewPanel, setShowPreviewPanel] = useState(false);
  const [matchesList,      setMatchesList]      = useState([]);
  const [previewMatchId,   setPreviewMatchId]   = useState('');
  const [previewMatch,     setPreviewMatch]     = useState(null);
  const [previewTexts,     setPreviewTexts]     = useState({});
  const [previewImages,    setPreviewImages]    = useState({});
  const [previewLoading,   setPreviewLoading]   = useState(false);

  // ── Scale canvas ────────────────────────────────────────────────────────────
  const wScale   = PREVIEW_MAX_W / (imgSize.w || 1080);
  const hScale   = PREVIEW_MAX_H / (imgSize.h || 1920);
  const scale    = Math.min(wScale, hScale);
  const previewW = Math.round((imgSize.w || 1080) * scale);
  const previewH = Math.round((imgSize.h || 1920) * scale);

  // ── Chargement du fond ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!showZoneModal || !selectedTemplate?.fichier) { setBgImage(null); return; }
    setSelectedZoneIdx(null);
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => { setBgImage(img); setImgSize({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => setBgImage(null);
    img.src     = `${API_BASE}${selectedTemplate.fichier}`;
  }, [showZoneModal, selectedTemplate?.fichier]);

  // ── Fermeture du menu Élément sur clic extérieur ────────────────────────────
  useEffect(() => {
    if (!showElemMenu) return;
    const close = (e) => {
      if (elemMenuRef.current && !elemMenuRef.current.contains(e.target)) setShowElemMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showElemMenu]);

  // ── Chargement des matchs (lazy, une seule fois) ────────────────────────────
  useEffect(() => {
    if (!showPreviewPanel || matchesList.length > 0) return;
    getMatches()
      .then(res => setMatchesList(res.data || []))
      .catch(() => {});
  }, [showPreviewPanel, matchesList.length]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

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
    if (!fichier)         return showAlert('error', 'Veuillez sélectionner une image');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('nom',     form.nom);
      fd.append('type',    form.type);
      fd.append('equipe',  form.equipe === 'Toutes' ? '' : form.equipe);
      fd.append('zones',   JSON.stringify(zones));
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
    // Reset aperçu
    setShowPreviewPanel(false);
    setPreviewMatchId('');
    setPreviewMatch(null);
    setPreviewTexts({});
    setPreviewImages({});
    setShowZoneModal(true);
  };

  const saveZones = async () => {
    setSaving(true);
    try {
      await updateTemplate(selectedTemplate.id, {
        nom:    selectedTemplate.nom,
        type:   selectedTemplate.type,
        equipe: selectedTemplate.equipe,
        zones,
      });
      showAlert('success', 'Zones sauvegardées');
      loadTemplates();
    } catch {
      showAlert('error', 'Erreur lors de la sauvegarde des zones');
    } finally {
      setSaving(false);
    }
  };

  // ── Aperçu avec données match ───────────────────────────────────────────────

  const handlePreviewMatch = async (matchId) => {
    setPreviewMatchId(matchId);
    if (!matchId) {
      setPreviewMatch(null);
      setPreviewTexts({});
      setPreviewImages({});
      return;
    }
    const match = matchesList.find(m => String(m.id) === String(matchId));
    if (!match) return;

    setPreviewMatch(match);
    setPreviewTexts(resolveTexts(match));

    setPreviewLoading(true);
    const urls    = resolveImageUrls(match);
    const images  = await loadImages(urls);
    setPreviewImages(images);
    setPreviewLoading(false);
  };

  const closePreview = () => {
    setShowPreviewPanel(false);
    setPreviewMatchId('');
    setPreviewMatch(null);
    setPreviewTexts({});
    setPreviewImages({});
  };

  // ── Gestion des zones ───────────────────────────────────────────────────────

  const addZone = () => {
    setZones(prev => [...prev, { ...ZONE_TEMPLATE, id: `zone_${Date.now()}` }]);
  };

  const addElement = (elemDef) => {
    const isImage = DYNAMIC_ELEMENTS.images.some(e => e.source === elemDef.source);
    const base = {
      id:     `elem_${Date.now()}`,
      label:  elemDef.label,
      source: elemDef.source,
      x: 50, y: 50,
      width:  isImage ? (elemDef.w || 250) : 500,
      height: isImage ? (elemDef.h || 250) : 100,
    };
    const element = isImage
      ? { ...base, type: 'image_dynamique' }
      : { ...base, type: 'texte_dynamique', fontSize: 60, fontFamily: 'Bebas Neue', color: '#ffffff', align: 'center' };
    setZones(prev => [...prev, element]);
    setShowElemMenu(false);
  };

  const updateZone = (idx, field, value) => {
    setZones(prev => prev.map((z, i) => i === idx ? { ...z, [field]: value } : z));
  };

  const updateZoneFields = (idx, updates) => {
    setZones(prev => prev.map((z, i) => i === idx ? { ...z, ...updates } : z));
  };

  const removeZone = (idx) => {
    setZones(prev => prev.filter((_, i) => i !== idx));
    if (selectedZoneIdx === idx) setSelectedZoneIdx(null);
  };

  const handleGenerer = async () => {
    if (!selectedTemplate) return;
    setGenerating(true);
    try {
      let res;
      if (hasDynamic && previewMatch) {
        // Génération avec données match (éléments dynamiques + textes fixes)
        res = await genererDynamique(selectedTemplate.id, previewMatch.id, genValeurs);
      } else {
        // Génération textes fixes uniquement (comportement existant)
        res = await genererImage(selectedTemplate.id, genValeurs);
      }
      setGeneratedUrl(res.data.url);
      showAlert('success', 'Image générée avec succès');
    } catch (err) {
      showAlert('error', err.response?.data?.error || 'Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  };

  const typeLabel = (t) => {
    const map = { programme: 'Programme', matchday: 'Match Day', score_live: 'Score Live', resultats: 'Résultats' };
    return map[t] || t;
  };

  const fixedZones  = zones.filter(z => !z.type || z.type === 'texte_fixe');
  const hasDynamic  = zones.some(z => z.type === 'texte_dynamique' || z.type === 'image_dynamique');
  const isPreviewOn = !!previewMatch;

  // ── Rendu ────────────────────────────────────────────────────────────────────
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
          <button className="btn btn-primary" onClick={openCreate}>+ Nouveau template</button>
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
                {t.fichier
                  ? <img src={`${API_BASE}${t.fichier}`} alt={t.nom} />
                  : <div className="template-placeholder">🎨</div>
                }
                <div className="template-overlay">
                  <span className="template-type-badge">{typeLabel(t.type)}</span>
                </div>
              </div>
              <div className="template-info">
                <h3>{t.nom}</h3>
                <p>{t.equipe || 'Toutes équipes'} • {(t.zones || []).length} élément(s)</p>
              </div>
              <div className="template-actions">
                <button className="btn btn-primary btn-sm" onClick={() => openZones(t)}>
                  Zones &amp; Génération
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(t)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal création ──────────────────────────────────────────────────── */}
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

      {/* ── Modal zones & éléments ──────────────────────────────────────────── */}
      {showZoneModal && selectedTemplate && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowZoneModal(false)}>
          <div className="modal" style={{ maxWidth: 860 }}>
            <div className="modal-header">
              <h3>Zones — {selectedTemplate.nom}</h3>
              <button className="btn-icon" onClick={() => setShowZoneModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="zones-layout">

                {/* ── Colonne gauche : canvas + aperçu ── */}
                <div className="zone-preview-container">
                  <div className="zone-preview-label">
                    Aperçu template
                    {isPreviewOn && (
                      <span className="preview-active-badge">● Aperçu actif</span>
                    )}
                  </div>

                  {/* Canvas Konva */}
                  <div className={`konva-wrapper${isPreviewOn ? ' konva-wrapper--preview' : ''}`}
                    style={{ width: previewW, height: previewH }}>
                    <Stage
                      width={previewW}
                      height={previewH}
                      onClick={(e) => {
                        if (e.target === e.target.getStage()) setSelectedZoneIdx(null);
                      }}
                    >
                      <Layer>
                        {bgImage && <KonvaImage image={bgImage} width={previewW} height={previewH} />}
                        {zones.map((zone, idx) => (
                          <ZoneRect
                            key={zone.id || idx}
                            zone={zone}
                            idx={idx}
                            scale={scale}
                            isSelected={selectedZoneIdx === idx}
                            onSelect={setSelectedZoneIdx}
                            onUpdate={(updates) => updateZoneFields(idx, updates)}
                            previewImage={previewImages[zone.source] || null}
                            previewText={previewTexts[zone.source] || null}
                          />
                        ))}
                      </Layer>
                    </Stage>
                  </div>

                  {/* Légende */}
                  {!isPreviewOn && (
                    <div className="canvas-legend">
                      <span className="legend-item">
                        <span className="legend-dot" style={{ background: 'rgba(74,222,128,0.5)', border: '1.5px solid #4ade80' }} />
                        Texte fixe
                      </span>
                      <span className="legend-item">
                        <span className="legend-dot legend-dot--dashed" style={{ borderColor: '#a78bfa' }} />
                        Dynamique
                      </span>
                      <span className="legend-item">
                        <span className="legend-dot legend-dot--dashed" style={{ borderColor: '#60a5fa' }} />
                        Image
                      </span>
                    </div>
                  )}

                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--texte-gris)' }}>
                    {imgSize.w}×{imgSize.h}px · scale {(scale * 100).toFixed(0)}%
                  </div>

                  {/* ── Panneau Aperçu avec données ── */}
                  <div className="preview-panel">
                    {!showPreviewPanel ? (
                      <button
                        className="btn btn-sm btn-ghost preview-toggle-btn"
                        onClick={() => setShowPreviewPanel(true)}
                        disabled={!hasDynamic}
                        title={!hasDynamic ? 'Ajoutez des éléments dynamiques pour activer l\'aperçu' : ''}
                      >
                        👁 Aperçu avec données
                      </button>
                    ) : (
                      <div className="preview-controls">
                        <div className="preview-controls-header">
                          <span className="preview-controls-title">👁 Aperçu avec données</span>
                          <button className="btn-icon btn-icon--sm" onClick={closePreview}>✕</button>
                        </div>

                        <select
                          className="form-control form-select"
                          value={previewMatchId}
                          onChange={e => handlePreviewMatch(e.target.value)}
                        >
                          <option value="">— Choisir un match —</option>
                          {matchesList.map(m => {
                            const dateStr = m.date ? new Date(m.date).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : '?';
                            return (
                              <option key={m.id} value={m.id}>
                                {m.equipe} vs {m.adversaire} — {dateStr}
                              </option>
                            );
                          })}
                        </select>

                        {previewLoading && (
                          <div style={{ fontSize: 11, color: 'var(--texte-gris)', marginTop: 4 }}>
                            ⏳ Chargement des logos…
                          </div>
                        )}

                        {previewMatch && !previewLoading && (
                          <div className="preview-match-info">
                            <span>{previewMatch.domicile !== false ? '🏠 Domicile' : '✈️ Extérieur'}</span>
                            <span>{formatDateFR(previewMatch.date)}</span>
                            <span>{formatHeure(previewMatch.heure)}</span>
                            {previewMatch.lieu && <span>📍 {previewMatch.lieu}</span>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Colonne droite : configuration zones ── */}
                <div className="zones-config">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <strong>Éléments ({zones.length})</strong>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-primary" onClick={addZone}>
                        + Zone texte
                      </button>
                      <div ref={elemMenuRef} style={{ position: 'relative' }}>
                        <button
                          className={`btn btn-sm btn-secondary${showElemMenu ? ' active' : ''}`}
                          onClick={() => setShowElemMenu(v => !v)}
                        >
                          + Élément ▾
                        </button>
                        {showElemMenu && (
                          <div className="elem-menu">
                            <div className="elem-menu-group">
                              <div className="elem-menu-group-title">Images</div>
                              {DYNAMIC_ELEMENTS.images.map(e => (
                                <button key={e.source} className="elem-menu-item" onClick={() => addElement(e)}>
                                  <span className="elem-menu-icon">{e.icon}</span>
                                  {e.label}
                                  <span className="zone-type-badge zone-type-image_dynamique" style={{ marginLeft: 'auto' }}>Image</span>
                                </button>
                              ))}
                            </div>
                            <div className="elem-menu-group">
                              <div className="elem-menu-group-title">Textes dynamiques</div>
                              {DYNAMIC_ELEMENTS.textes.map(e => (
                                <button key={e.source} className="elem-menu-item" onClick={() => addElement(e)}>
                                  <span className="elem-menu-icon">{e.icon}</span>
                                  <span>
                                    {e.label}
                                    {e.example && <span className="elem-menu-example"> ex: {e.example}</span>}
                                  </span>
                                  <span className="zone-type-badge zone-type-texte_dynamique" style={{ marginLeft: 'auto' }}>Dyn</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {zones.length === 0 ? (
                    <div className="alert alert-info">
                      Ajoutez des <strong>zones texte</strong> ou des <strong>éléments dynamiques</strong>
                    </div>
                  ) : (
                    zones.map((zone, idx) => {
                      const zoneType = zone.type || 'texte_fixe';
                      return (
                        <div
                          key={idx}
                          className={`zone-item card${selectedZoneIdx === idx ? ' zone-item--active' : ''}`}
                          onClick={() => setSelectedZoneIdx(idx)}
                        >
                          <div className="zone-item-header">
                            <span className="zone-color-dot" style={{ background: ZONE_COLORS[idx % ZONE_COLORS.length] }} />
                            <strong style={{ flex: 1, fontSize: 13 }}>
                              {zoneType === 'texte_fixe' ? (zone.label || `Zone ${idx + 1}`) : zone.label}
                            </strong>
                            <span className={`zone-type-badge zone-type-${zoneType}`}>
                              {TYPE_LABELS[zoneType] || zoneType}
                            </span>
                            <button
                              className="btn btn-sm btn-danger"
                              style={{ marginLeft: 6 }}
                              onClick={(e) => { e.stopPropagation(); removeZone(idx); }}
                            >✕</button>
                          </div>

                          {/* Champs communs */}
                          <div className="grid-2" style={{ marginTop: 8 }}>
                            <div className="form-group">
                              <label className="form-label">X</label>
                              <input type="number" className="form-control" value={zone.x}
                                onChange={e => updateZone(idx, 'x', parseInt(e.target.value) || 0)} />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Y</label>
                              <input type="number" className="form-control" value={zone.y}
                                onChange={e => updateZone(idx, 'y', parseInt(e.target.value) || 0)} />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Largeur</label>
                              <input type="number" className="form-control" value={zone.width}
                                onChange={e => updateZone(idx, 'width', parseInt(e.target.value) || 10)} />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Hauteur</label>
                              <input type="number" className="form-control" value={zone.height}
                                onChange={e => updateZone(idx, 'height', parseInt(e.target.value) || 10)} />
                            </div>
                          </div>

                          {/* texte_fixe */}
                          {zoneType === 'texte_fixe' && (
                            <>
                              <div className="grid-2">
                                <div className="form-group">
                                  <label className="form-label">Label</label>
                                  <input className="form-control" value={zone.label || ''}
                                    onChange={e => updateZone(idx, 'label', e.target.value)}
                                    placeholder="ex: Équipe domicile" />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Placeholder</label>
                                  <input className="form-control" value={zone.placeholder || ''}
                                    onChange={e => updateZone(idx, 'placeholder', e.target.value)}
                                    placeholder="ex: SCR 1" />
                                </div>
                              </div>
                              <div className="grid-2">
                                <div className="form-group">
                                  <label className="form-label">Taille police</label>
                                  <input type="number" className="form-control" value={zone.fontSize || 36}
                                    onChange={e => updateZone(idx, 'fontSize', parseInt(e.target.value) || 12)} />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Police</label>
                                  <select className="form-control form-select" value={zone.fontFamily || 'Arial'}
                                    onChange={e => updateZone(idx, 'fontFamily', e.target.value)}>
                                    {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                                  </select>
                                </div>
                              </div>
                              <div className="form-group">
                                <label className="form-label">Couleur</label>
                                <ColorPickerField color={zone.color || '#ffffff'}
                                  onChange={c => updateZone(idx, 'color', c)} />
                              </div>
                            </>
                          )}

                          {/* texte_dynamique */}
                          {zoneType === 'texte_dynamique' && (
                            <>
                              <div className="zone-source-info">
                                Source : <code>{zone.source}</code>
                                {previewTexts[zone.source] && (
                                  <span className="zone-source-preview"> → "{previewTexts[zone.source]}"</span>
                                )}
                              </div>
                              <div className="grid-2">
                                <div className="form-group">
                                  <label className="form-label">Taille police</label>
                                  <input type="number" className="form-control" value={zone.fontSize || 60}
                                    onChange={e => updateZone(idx, 'fontSize', parseInt(e.target.value) || 12)} />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Police</label>
                                  <select className="form-control form-select" value={zone.fontFamily || 'Bebas Neue'}
                                    onChange={e => updateZone(idx, 'fontFamily', e.target.value)}>
                                    {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                                  </select>
                                </div>
                              </div>
                              <div className="grid-2">
                                <div className="form-group">
                                  <label className="form-label">Couleur</label>
                                  <ColorPickerField color={zone.color || '#ffffff'}
                                    onChange={c => updateZone(idx, 'color', c)} />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Alignement</label>
                                  <select className="form-control form-select" value={zone.align || 'center'}
                                    onChange={e => updateZone(idx, 'align', e.target.value)}>
                                    <option value="left">Gauche</option>
                                    <option value="center">Centré</option>
                                    <option value="right">Droite</option>
                                  </select>
                                </div>
                              </div>
                            </>
                          )}

                          {/* image_dynamique */}
                          {zoneType === 'image_dynamique' && (
                            <div className="zone-source-info">
                              Source : <code>{zone.source}</code>
                              {previewImages[zone.source] && (
                                <span className="zone-source-preview"> ✓ logo chargé</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}

                  {/* ── Test de génération ── */}
                  {zones.length > 0 && (
                    <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--bordure)' }}>
                      <strong style={{ display: 'block', marginBottom: 8 }}>Génération</strong>

                      {/* Textes fixes : champs de saisie */}
                      {fixedZones.map((zone) => {
                        const idx = zones.indexOf(zone);
                        return (
                          <div className="form-group" key={idx}>
                            <label className="form-label">{zone.label || `Zone ${idx + 1}`}</label>
                            <input className="form-control"
                              value={genValeurs[zone.id || idx] || ''}
                              onChange={e => setGenValeurs(v => ({ ...v, [zone.id || idx]: e.target.value }))}
                              placeholder={zone.placeholder || 'Texte à afficher'} />
                          </div>
                        );
                      })}

                      {/* Contexte selon mode */}
                      {hasDynamic && !previewMatch && (
                        <div className="alert alert-info" style={{ fontSize: 12, marginBottom: 10 }}>
                          Sélectionnez un match via <strong>"Aperçu avec données"</strong> pour activer la génération avec éléments dynamiques.
                        </div>
                      )}

                      {hasDynamic && previewMatch && (
                        <div className="generate-match-badge">
                          Match : <strong>{previewMatch.equipe} vs {previewMatch.adversaire}</strong>
                          <span> · {formatDateFR(previewMatch.date)}</span>
                        </div>
                      )}

                      {/* Bouton — désactivé si dynamique sans match */}
                      <button
                        className="btn btn-secondary"
                        onClick={handleGenerer}
                        disabled={generating || (hasDynamic && !previewMatch)}
                        title={hasDynamic && !previewMatch ? 'Sélectionnez un match pour générer' : ''}
                        style={{ marginTop: 8 }}
                      >
                        {generating
                          ? '⏳ Génération...'
                          : hasDynamic && previewMatch
                            ? '🎨 Générer avec données match'
                            : '🎨 Générer l\'image'
                        }
                      </button>

                      {generatedUrl && (
                        <div style={{ marginTop: 12 }}>
                          <img src={generatedUrl} alt="Généré"
                            style={{ width: '100%', borderRadius: 8, border: '1px solid var(--bordure)' }} />
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
