'use strict';
/**
 * templateGenerator.js
 * Génère une image finale à partir d'un template + données match.
 *
 * Éléments supportés :
 *   image_dynamique  → logo (local DB, puis CDN, puis cercle gris)
 *   texte_dynamique  → valeur résolue depuis le match (date, heure, noms, lieu, division)
 *   texte_fixe       → valeur fournie dans textesFixe{} (ou placeholder)
 */

const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');
const pool  = require('../db');

const BACKEND    = path.join(__dirname, '..');
const LOGOS_DIR  = path.join(BACKEND, 'uploads', 'logos');
const GENERATED  = path.join(BACKEND, 'uploads', 'generated');
const BEBAS_FONT = path.join(BACKEND, 'fonts', 'BebasNeue-Regular.ttf');
const SCR_LOGO   = path.join(LOGOS_DIR, 'scr.png');

// ── Formatage ──────────────────────────────────────────────────────────────────

const JOURS_FR = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const MOIS_FR  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function formatDateFR(dateInput) {
  if (!dateInput) return '';
  // pg renvoie `date` comme Date JS à minuit heure locale → getDate()/getDay() (pas UTC*)
  if (dateInput instanceof Date) {
    return `${JOURS_FR[dateInput.getDay()]} ${dateInput.getDate()} ${MOIS_FR[dateInput.getMonth()]} ${dateInput.getFullYear()}`;
  }
  // Sinon string ISO "2026-05-10" → construire en heure locale pour éviter le décalage UTC
  const [y, m, d] = String(dateInput).slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${JOURS_FR[dt.getDay()]} ${d} ${MOIS_FR[m - 1]} ${y}`;
}

function formatHeure(heureStr) {
  if (!heureStr) return '';
  const [h, min] = heureStr.slice(0, 5).split(':');
  return `${h}h${min}`;
}

function normalizeClubName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+\d+$/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function esc(s) {
  return String(s || '')
    .replace(/[^ -￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Polices ────────────────────────────────────────────────────────────────────

function bebasFontDefs() {
  if (!fs.existsSync(BEBAS_FONT)) return '';
  const fp = BEBAS_FONT.replace(/\\/g, '/').replace(/ /g, '%20');
  return `<defs><style>@font-face{font-family:'BebasNeue';src:url('file://${fp}') format('truetype');}</style></defs>`;
}

const FONT_SVG_MAP = {
  'Bebas Neue':       "'BebasNeue', Arial, sans-serif",
  'Arial':            'Arial, Helvetica, sans-serif',
  'Impact':           'Impact, "Arial Narrow", sans-serif',
  'Open Sans':        "'Open Sans', Arial, sans-serif",
  'Oswald':           'Oswald, "Arial Narrow", sans-serif',
  'Montserrat':       'Montserrat, Arial, sans-serif',
  'Anton':            'Anton, "Arial Black", sans-serif',
  'Roboto Condensed': '"Roboto Condensed", "Arial Narrow", sans-serif',
};

function svgFontFamily(fontFamily) {
  return FONT_SVG_MAP[fontFamily] || `"${fontFamily}", Arial, sans-serif`;
}

// ── Chargement images ──────────────────────────────────────────────────────────

async function svgToPng(svgBuf) {
  try { return await sharp(svgBuf).png().toBuffer(); }
  catch { return svgBuf; }
}

function greyCircle(w, h) {
  const r = Math.round(Math.min(w, h) / 2);
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="${w / 2}" cy="${h / 2}" r="${r}" fill="#888888" opacity="0.4"/></svg>`
  );
}

async function loadLocalLogo(filePath, w, h) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return await sharp(filePath)
      .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  } catch { return null; }
}

async function fetchCdnLogo(url, w, h) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = Buffer.from(await res.arrayBuffer());
    return await sharp(raw)
      .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  } catch (err) {
    console.warn(`[templateGenerator] CDN logo fetch échoué (${url}): ${err.message}`);
    return null;
  }
}

// ── SVG texte ─────────────────────────────────────────────────────────────────

function buildTextNode(zone, text) {
  const fontSize   = zone.fontSize   || 36;
  const fontFamily = zone.fontFamily || 'Arial';
  const color      = zone.color      || '#ffffff';
  const align      = zone.align      || (zone.type === 'texte_dynamique' ? 'center' : 'left');
  const bold       = zone.bold ? 'bold' : 'normal';

  const zW = zone.width  || 200;
  const zH = zone.height || 60;

  let textAnchor, x;
  if (align === 'right')  { textAnchor = 'end';    x = zone.x + zW; }
  else if (align === 'center') { textAnchor = 'middle'; x = zone.x + zW / 2; }
  else                    { textAnchor = 'start';  x = zone.x; }

  const y       = zone.y + zH / 2;
  const svgFont = svgFontFamily(fontFamily);
  const sw      = Math.max(1, Math.round(fontSize * 0.025));

  return (
    `<text x="${x}" y="${y}"` +
    ` font-family="${svgFont}"` +
    ` font-size="${fontSize}"` +
    ` font-weight="${bold}"` +
    ` fill="${color}"` +
    ` text-anchor="${textAnchor}"` +
    ` dominant-baseline="middle"` +
    ` stroke="#000000" stroke-width="${sw}" paint-order="stroke fill"` +
    `>${esc(text)}</text>`
  );
}

// ── Résolution des sources dynamiques ─────────────────────────────────────────

function resolveText(source, match) {
  const dom    = match.domicile !== false;
  const nomDom = dom ? (match.equipe || '') : (match.adversaire || '');
  const nomExt = dom ? (match.adversaire || '') : (match.equipe || '');
  switch (source) {
    case 'nom_domicile':  return nomDom;
    case 'nom_exterieur': return nomExt;
    case 'date_match':    return formatDateFR(match.date);
    case 'heure_match':   return formatHeure(match.heure);
    case 'lieu_stade':    return match.lieu || 'Roeschwoog';
    case 'division':      return match.division || '';
    default:              return '';
  }
}

function resolveLogoSources(source, match, scrPath, advLocalPath, advCdnUrl) {
  const dom = match.domicile !== false;
  switch (source) {
    case 'logo_domicile':
      return { local: dom ? scrPath : advLocalPath, cdn: dom ? null : advCdnUrl };
    case 'logo_exterieur':
      return { local: dom ? advLocalPath : scrPath, cdn: dom ? advCdnUrl : null };
    case 'logo_scr':
      return { local: scrPath, cdn: null };
    default:
      return { local: null, cdn: null };
  }
}

// ── Générateur principal ───────────────────────────────────────────────────────

/**
 * @param {number|string} templateId
 * @param {number|string} matchId
 * @param {object}        textesFixe  { zone_id: "texte", ... }
 * @returns {Promise<string>}         chemin relatif /uploads/generated/xxx.png
 */
async function generateFromTemplate(templateId, matchId, textesFixe = {}) {
  if (!fs.existsSync(GENERATED)) fs.mkdirSync(GENERATED, { recursive: true });

  // ── 1. Template ─────────────────────────────────────────────────────────────
  const tplRow = await pool.query('SELECT * FROM templates WHERE id=$1', [templateId]);
  if (tplRow.rows.length === 0) throw new Error('Template non trouvé : id=' + templateId);
  const template = tplRow.rows[0];

  const tplPath = path.join(BACKEND, template.fichier);
  if (!fs.existsSync(tplPath)) throw new Error('Fichier template introuvable : ' + template.fichier);

  const tplMeta = await sharp(tplPath).metadata();
  const W = tplMeta.width;
  const H = tplMeta.height;

  // ── 2. Match ─────────────────────────────────────────────────────────────────
  const matchRow = await pool.query('SELECT * FROM matches WHERE id=$1', [matchId]);
  if (matchRow.rows.length === 0) throw new Error('Match non trouvé : id=' + matchId);
  const match = matchRow.rows[0];

  // ── 3. Logos clubs depuis la DB ───────────────────────────────────────────────
  const clubRows = await pool.query(
    'SELECT nom, logo_url FROM clubs WHERE logo_url IS NOT NULL'
  );
  const clubLogoMap = new Map();
  for (const row of clubRows.rows) {
    const key = normalizeClubName(row.nom);
    if (!clubLogoMap.has(key) && row.logo_url?.startsWith('/uploads/')) {
      clubLogoMap.set(key, path.join(BACKEND, row.logo_url));
    }
  }

  const scrPath      = fs.existsSync(SCR_LOGO) ? SCR_LOGO : null;
  const advNorm      = normalizeClubName(match.adversaire);
  const advLocalPath = clubLogoMap.get(advNorm) || null;
  const advCdnUrl    = match.logo_adversaire || null;

  // ── 4. Traitement des zones ───────────────────────────────────────────────────
  const zones = Array.isArray(template.zones) ? template.zones : [];
  const imageLayers = [];
  let svgNodes = bebasFontDefs();

  for (let i = 0; i < zones.length; i++) {
    const zone     = zones[i];
    const zoneType = zone.type || 'texte_fixe';
    const zW       = Math.max(1, Math.round(zone.width  || 200));
    const zH       = Math.max(1, Math.round(zone.height || 60));
    const zX       = Math.max(0, Math.round(zone.x || 0));
    const zY       = Math.max(0, Math.round(zone.y || 0));

    if (zoneType === 'image_dynamique') {
      // ── Image dynamique ──
      const { local, cdn } = resolveLogoSources(
        zone.source, match, scrPath, advLocalPath, advCdnUrl
      );

      let buf = await loadLocalLogo(local, zW, zH);
      if (!buf) buf = await fetchCdnLogo(cdn, zW, zH);
      if (!buf) buf = await svgToPng(greyCircle(zW, zH));

      // Vérification des bornes avant composite
      const maxAvailW = W - zX;
      const maxAvailH = H - zY;
      if (maxAvailW <= 0 || maxAvailH <= 0) {
        console.warn(`[templateGenerator] Zone image hors canvas (${zone.source}) — ignorée`);
        continue;
      }

      // Recadrer si nécessaire
      if (zW > maxAvailW || zH > maxAvailH) {
        try {
          buf = await sharp(buf)
            .extract({ left: 0, top: 0, width: Math.min(zW, maxAvailW), height: Math.min(zH, maxAvailH) })
            .toBuffer();
        } catch { continue; }
      }

      imageLayers.push({ input: buf, left: zX, top: zY, blend: 'over' });
      console.log(`[templateGenerator] logo "${zone.source}" → left=${zX} top=${zY} ${zW}×${zH}`);

    } else if (zoneType === 'texte_dynamique') {
      // ── Texte dynamique ──
      const text = resolveText(zone.source, match);
      if (text) {
        svgNodes += buildTextNode({ ...zone, x: zX, y: zY, width: zW, height: zH }, text);
        console.log(`[templateGenerator] texte_dyn "${zone.source}" → "${text}"`);
      }

    } else {
      // ── Texte fixe ──
      const text = textesFixe[zone.id]
        ?? textesFixe[String(i)]
        ?? zone.placeholder
        ?? '';
      if (text) {
        svgNodes += buildTextNode({ ...zone, x: zX, y: zY, width: zW, height: zH }, text);
      }
    }
  }

  // ── 5. Couche SVG textes → PNG transparent ────────────────────────────────────
  const svgBuf  = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svgNodes}</svg>`
  );
  const textPng = await svgToPng(svgBuf);

  // ── 6. Composite final ────────────────────────────────────────────────────────
  const outName = `dynamic_tpl${templateId}_m${matchId}_${Date.now()}.png`;
  const outPath = path.join(GENERATED, outName);

  await sharp(tplPath)
    .composite([
      ...imageLayers,
      { input: textPng, top: 0, left: 0, blend: 'over' },
    ])
    .png({ compressionLevel: 8 })
    .toFile(outPath);

  const relativePath = '/uploads/generated/' + outName;
  console.log(`[templateGenerator] ✅ généré → ${outPath}`);
  return relativePath;
}

module.exports = { generateFromTemplate };
