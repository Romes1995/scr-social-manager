'use strict';
/**
 * generateResultat.js — Générateur "Résultats Week-End" 940×788px
 *
 * Polices :
 *   - Score   : Hyperwave2 (backend/fonts/Hyperwave2.ttf) → fallback BebasNeue → Arial
 *   - Noms    : Arial Bold
 *   - Scorers : Arial Regular
 *
 * Templates : backend/uploads/templates/resultat_{1match|2matchs|3matchs}.png
 *
 * Chaque match passé à generateResultat() :
 *   {
 *     logoGauche : chemin absolu  (null = disque gris)
 *     nomGauche  : 'SCR 1'
 *     score      : '2 - 1'
 *     nomDroite  : 'HOENHEIM SR'
 *     logoDroite : chemin absolu  (null = disque gris)
 *     scorers    : 'Dupont J.\nMartin T. [2]'  — [N] = nb de buts
 *     domicile   : true si SCR est à gauche
 *   }
 */

const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const BACKEND    = path.join(__dirname, '..');
const TEMPLATES  = path.join(BACKEND, 'uploads', 'templates');
const GENERATED  = path.join(BACKEND, 'uploads', 'generated');
const BEBAS_FONT = path.join(BACKEND, 'fonts', 'BebasNeue-Regular.ttf');
const HW2_FONT   = path.join(BACKEND, 'fonts', 'Hyperwave2.ttf');
const BALL_PNG   = path.join(BACKEND, 'assets', 'ball.png');

const LOGO_W    = 89;
const LOGO_H    = 89;
const LOGO_HALF = 44;   // Math.floor(LOGO_H / 2)

// Coordonnées Canva exactes pour les buteurs
const SCORER_X_DOM = 158;   // SCR domicile (gauche) — text-anchor="start"
const SCORER_X_EXT = 779;   // SCR extérieur (droite) — text-anchor="end"
const SCORER_FS    = 13;
const SCORER_LH    = 16;
const SCORER_GAP_Y = 22;    // décalage vertical sous nomSCR.cy
const BALL_SZ      = 13;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str || '')
    .replace(/[^\u0000-\uFFFF]/g, ' ')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function svgFontDefs() {
  const defs = [];
  if (fs.existsSync(HW2_FONT)) {
    const fp = HW2_FONT.replace(/\\/g, '/').replace(/ /g, '%20');
    defs.push(`@font-face{font-family:'Hyperwave2';src:url('file://${fp}') format('truetype');}`);
  } else {
    console.warn('[generateResultat] Hyperwave2.ttf absent → fallback BebasNeue');
  }
  if (fs.existsSync(BEBAS_FONT)) {
    const fp = BEBAS_FONT.replace(/\\/g, '/').replace(/ /g, '%20');
    defs.push(`@font-face{font-family:'BebasNeue';src:url('file://${fp}') format('truetype');}`);
  }
  return defs.length ? `<defs><style>${defs.join('')}</style></defs>` : '';
}

function scoreFont() {
  if (fs.existsSync(HW2_FONT))   return "'Hyperwave2','BebasNeue',Arial,sans-serif";
  if (fs.existsSync(BEBAS_FONT)) return "'BebasNeue',Arial,sans-serif";
  return 'Arial,sans-serif';
}

async function svgToPng(svgBuf) {
  try {
    return await sharp(svgBuf).png().toBuffer();
  } catch (err) {
    console.warn('[generateResultat] svgToPng :', err.message);
    return svgBuf;
  }
}

async function loadLogo(logoPath, w, h) {
  if (!logoPath || !fs.existsSync(logoPath)) return null;
  try {
    return await sharp(logoPath)
      .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer();
  } catch { return null; }
}

async function greyDisc(w, h) {
  const svg = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
    `<ellipse cx="${w/2}" cy="${h/2}" rx="${w/2}" ry="${h/2}" fill="#777" opacity="0.35"/></svg>`
  );
  return svgToPng(svg);
}

/**
 * Charge backend/assets/ball.png en buffer 13×13px.
 * Si absent → le crée programmatiquement (cercle vert/blanc 13×13).
 * Retourne null uniquement en cas d'échec complet.
 */
async function loadBallBuf() {
  try {
    if (!fs.existsSync(BALL_PNG)) {
      const assetsDir = path.dirname(BALL_PNG);
      if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
      const svg = Buffer.from(
        '<svg width="13" height="13" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="6.5" cy="6.5" r="6" fill="#1a6b3c" stroke="#ffffff" stroke-width="1.2"/>' +
        '<ellipse cx="4.5" cy="4" rx="1.8" ry="1.3" fill="#ffffff" opacity="0.35"/>' +
        '</svg>'
      );
      await sharp(svg).png().toFile(BALL_PNG);
      console.log('[generateResultat] ball.png créé');
    }
    return await sharp(BALL_PNG)
      .resize(BALL_SZ, BALL_SZ, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer();
  } catch (err) {
    console.warn('[generateResultat] Impossible de charger ball.png :', err.message);
    return null;
  }
}

/**
 * Parse les lignes de scorers.
 * Format attendu : "Nom Prénom" ou "Nom Prénom [N]"
 * Retourne : [{ name, count }, ...]
 */
function parseScorers(raw) {
  return String(raw || '')
    .split(/[\n;]/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map(line => {
      const m = line.match(/^(.+?)\s+\[(\d+)\]$/);
      return m
        ? { name: m[1].trim(), count: Math.max(1, parseInt(m[2])) }
        : { name: line, count: 1 };
    });
}

// ─── Layout ───────────────────────────────────────────────────────────────────
//
// Logos : 89×89px — top = score.cy - 44
// logoG left ≈ 67  (zone gauche Canva)
// logoD left ≈ 800 (zone droite Canva)

const LAYOUT = {

  // ── 1 MATCH ────────────────────────────────────────────────────────────────
  1: {
    matches: [
      {
        logoG: { left: 67,  top: 394 - LOGO_HALF, w: LOGO_W, h: LOGO_H },
        nomG:  { cx: 262, cy: 385, fs: 22 },
        score: { cx: 471, cy: 394, fs: 80 },
        nomD:  { cx: 679, cy: 385, fs: 22 },
        logoD: { left: 800, top: 394 - LOGO_HALF, w: LOGO_W, h: LOGO_H },
      },
    ],
  },

  // ── 2 MATCHS ───────────────────────────────────────────────────────────────
  2: {
    matches: [
      {
        logoG: { left: 67,  top: 327 - LOGO_HALF, w: LOGO_W, h: LOGO_H },
        nomG:  { cx: 262, cy: 318, fs: 20 },
        score: { cx: 471, cy: 327, fs: 80 },
        nomD:  { cx: 679, cy: 318, fs: 20 },
        logoD: { left: 800, top: 327 - LOGO_HALF, w: LOGO_W, h: LOGO_H },
      },
      {
        logoG: { left: 67,  top: 560 - LOGO_HALF, w: LOGO_W, h: LOGO_H },
        nomG:  { cx: 262, cy: 551, fs: 20 },
        score: { cx: 471, cy: 560, fs: 80 },
        nomD:  { cx: 679, cy: 551, fs: 20 },
        logoD: { left: 800, top: 560 - LOGO_HALF, w: LOGO_W, h: LOGO_H },
      },
    ],
  },

  // ── 3 MATCHS ───────────────────────────────────────────────────────────────
  3: {
    matches: [
      {
        logoG: { left: 67,  top: 232 - LOGO_HALF, w: LOGO_W, h: LOGO_H },
        nomG:  { cx: 262, cy: 222, fs: 18 },
        score: { cx: 469, cy: 232, fs: 80 },
        nomD:  { cx: 679, cy: 222, fs: 18 },
        logoD: { left: 800, top: 232 - LOGO_HALF, w: LOGO_W, h: LOGO_H },
      },
      {
        logoG: { left: 67,  top: 442 - LOGO_HALF, w: LOGO_W, h: LOGO_H },
        nomG:  { cx: 260, cy: 433, fs: 18 },
        score: { cx: 469, cy: 442, fs: 80 },
        nomD:  { cx: 677, cy: 433, fs: 18 },
        logoD: { left: 800, top: 442 - LOGO_HALF, w: LOGO_W, h: LOGO_H },
      },
      {
        logoG: { left: 67,  top: 652 - LOGO_HALF, w: LOGO_W, h: LOGO_H },
        nomG:  { cx: 260, cy: 643, fs: 18 },
        score: { cx: 471, cy: 652, fs: 80 },
        nomD:  { cx: 679, cy: 643, fs: 18 },
        logoD: { left: 800, top: 652 - LOGO_HALF, w: LOGO_W, h: LOGO_H },
      },
    ],
  },
};

// ─── Rendu texte ──────────────────────────────────────────────────────────────

function textNode({ cx, cy, fs, weight = 'normal', color = '#ffffff', family, content,
                    stroke = null, strokeWidth = 0, letterSpacing = 0 }) {
  const strokeAttrs = stroke && strokeWidth > 0
    ? ` stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill"`
    : '';
  const lsAttr = letterSpacing !== 0 ? ` letter-spacing="${letterSpacing}"` : '';
  return (
    `<text x="${cx}" y="${cy}"` +
    ` font-family="${family}"` +
    ` font-size="${fs}"` +
    ` font-weight="${weight}"` +
    ` fill="${color}"` +
    ` text-anchor="middle"` +
    ` dominant-baseline="middle"` +
    strokeAttrs + lsAttr +
    `>${esc(content)}</text>`
  );
}

/**
 * Nœuds SVG pour le texte des buteurs uniquement (sans ballons).
 * Les ballons sont ajoutés en couche Sharp séparée.
 *
 * domicile=true  : x=158, anchor="start"
 * domicile=false : x=779, anchor="end"
 * startY = nomSCR.cy + SCORER_GAP_Y
 */
function scorerTextNodes({ scorers, nomSCRcy, domicile }) {
  if (!scorers || scorers.length === 0) return '';
  const scrLeft = domicile !== false;
  const x       = scrLeft ? SCORER_X_DOM : SCORER_X_EXT;
  const anchor  = scrLeft ? 'start' : 'end';
  const startY  = nomSCRcy + SCORER_GAP_Y;

  return scorers.map(({ name }, i) => {
    const y = startY + i * SCORER_LH;
    return (
      `<text x="${x}" y="${y}"` +
      ` font-family="Arial,Helvetica,sans-serif"` +
      ` font-size="${SCORER_FS}"` +
      ` font-weight="normal"` +
      ` fill="#ffffff"` +
      ` text-anchor="${anchor}"` +
      ` dominant-baseline="middle"` +
      `>${esc(name)}</text>`
    );
  }).join('');
}

/**
 * Calcule les positions Sharp des ballons pour un match.
 * Estimation de la largeur du texte : nb_chars × 7.5px (13px Arial).
 *
 * domicile=true  : ballons à droite du nom (x = 158 + largeur_nom + gap + k×15)
 * domicile=false : ballons à droite de x=779 (après le bord droit du texte)
 */
function computeBallLayers({ scorers, nomSCRcy, domicile, ballBuf }) {
  if (!scorers || scorers.length === 0 || !ballBuf) return [];
  const scrLeft = domicile !== false;
  const startY  = nomSCRcy + SCORER_GAP_Y;
  const layers  = [];

  scorers.forEach(({ name, count }, i) => {
    const lineY = startY + i * SCORER_LH;
    const ballTop = Math.round(lineY - BALL_SZ / 2);

    for (let k = 0; k < Math.min(count, 5); k++) {
      let ballLeft;
      if (scrLeft) {
        // Texte part de x=158 et s'étend à droite
        const estTextWidth = name.length * 7.5;
        ballLeft = Math.round(SCORER_X_DOM + estTextWidth + 4 + k * (BALL_SZ + 2));
      } else {
        // Texte s'arrête à x=779 → ballons après 779
        ballLeft = Math.round(SCORER_X_EXT + 4 + k * (BALL_SZ + 2));
      }

      // Garde seulement les ballons dans le canvas 940×788
      if (ballLeft >= 0 && ballLeft + BALL_SZ <= 940 && ballTop >= 0 && ballTop + BALL_SZ <= 788) {
        layers.push({ input: ballBuf, left: ballLeft, top: ballTop });
      }
    }
  });

  return layers;
}

// ─── Fonction principale ───────────────────────────────────────────────────────

async function generateResultat({ matches, outputPath } = {}) {
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new Error('[generateResultat] matches est requis (tableau non vide)');
  }
  if (!fs.existsSync(GENERATED)) fs.mkdirSync(GENERATED, { recursive: true });

  const n       = Math.min(matches.length, 3);
  const layout  = LAYOUT[n];
  const suffix  = n === 1 ? '1match' : `${n}matchs`;
  const tplPath = path.join(TEMPLATES, `resultat_${suffix}.png`);

  if (!fs.existsSync(tplPath)) {
    throw new Error(`[generateResultat] Template introuvable : ${tplPath}`);
  }
  const tplMeta = await sharp(tplPath).metadata();
  console.log(`[generateResultat] ${n} match(s) — template ${tplMeta.width}×${tplMeta.height}px`);

  const ballBuf   = await loadBallBuf();
  const scoreFam  = scoreFont();
  const arial     = 'Arial,Helvetica,sans-serif';

  const logoLayers = [];
  const ballLayers = [];
  let   svgNodes   = svgFontDefs();

  for (let i = 0; i < n; i++) {
    const match   = matches[i];
    const coord   = layout.matches[i];
    const scrLeft = match.domicile !== false;

    // ── Logos ────────────────────────────────────────────────────────────────
    const lBuf = (await loadLogo(match.logoGauche, coord.logoG.w, coord.logoG.h))
              || await greyDisc(coord.logoG.w, coord.logoG.h);
    const rBuf = (await loadLogo(match.logoDroite, coord.logoD.w, coord.logoD.h))
              || await greyDisc(coord.logoD.w, coord.logoD.h);

    logoLayers.push({ input: lBuf, left: coord.logoG.left, top: coord.logoG.top });
    logoLayers.push({ input: rBuf, left: coord.logoD.left, top: coord.logoD.top });

    console.log(
      `[generateResultat] match ${i + 1} — "${match.nomGauche}" ${match.score} "${match.nomDroite}"` +
      ` | dom:${scrLeft} logoG:${match.logoGauche ? '✓' : '✗'} logoD:${match.logoDroite ? '✓' : '✗'}`
    );

    // ── Nom gauche ────────────────────────────────────────────────────────────
    svgNodes += textNode({
      cx: coord.nomG.cx, cy: coord.nomG.cy, fs: coord.nomG.fs,
      weight: 'bold', family: arial, content: match.nomGauche,
    });

    // ── Score — fs:80, contour #0c372b 20px, letter-spacing:-8 ───────────────
    svgNodes += textNode({
      cx: coord.score.cx, cy: coord.score.cy, fs: coord.score.fs,
      weight: 'normal', family: scoreFam, content: match.score,
      stroke: '#0c372b', strokeWidth: 20, letterSpacing: -8,
    });

    // ── Nom droite ────────────────────────────────────────────────────────────
    svgNodes += textNode({
      cx: coord.nomD.cx, cy: coord.nomD.cy, fs: coord.nomD.fs,
      weight: 'bold', family: arial, content: match.nomDroite,
    });

    // ── Scorers ───────────────────────────────────────────────────────────────
    if (match.scorers) {
      const scorersParsed = parseScorers(match.scorers);
      const nomSCRcy = scrLeft ? coord.nomG.cy : coord.nomD.cy;

      // Texte SVG (noms uniquement)
      svgNodes += scorerTextNodes({ scorers: scorersParsed, nomSCRcy, domicile: scrLeft });

      // Ballons via Sharp composite
      ballLayers.push(...computeBallLayers({ scorers: scorersParsed, nomSCRcy, domicile: scrLeft, ballBuf }));
    }
  }

  // ── SVG → PNG transparent ─────────────────────────────────────────────────
  const svgBuf  = Buffer.from(
    `<svg width="940" height="788" xmlns="http://www.w3.org/2000/svg">${svgNodes}</svg>`
  );
  const textPng = await svgToPng(svgBuf);

  // ── Composite final : template + logos + texte + ballons ─────────────────
  const out = outputPath || path.join(GENERATED, `resultat_weekend_${Date.now()}.png`);

  await sharp(tplPath)
    .composite([
      ...logoLayers,
      { input: textPng, top: 0, left: 0 },
      ...ballLayers,
    ])
    .png({ compressionLevel: 8 })
    .toFile(out);

  console.log(`[generateResultat] ✅ généré → ${out}`);
  return '/' + path.relative(BACKEND, out).replace(/\\/g, '/');
}

module.exports = { generateResultat };
