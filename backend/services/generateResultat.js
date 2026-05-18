'use strict';

const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const BACKEND   = path.join(__dirname, '..');
const TEMPLATES = path.join(BACKEND, 'uploads', 'templates');
const GENERATED = path.join(BACKEND, 'uploads', 'generated');
const ASSETS    = path.join(BACKEND, 'assets');
const BEBAS_FONT = path.join(BACKEND, 'fonts', 'BebasNeue-Regular.ttf');
const HW2_FONT   = path.join(BACKEND, 'fonts', 'Hyperwave2.ttf');
const BALL_PATH  = path.join(ASSETS, 'ball.png');

// Taille des logos — doit tenir dans le cercle (115×116px)
const LOGO_SIZE = 76;
const BALL_SIZE = 15;

// Buteurs
const SCORER_FS = 12;
const SCORER_LH = 14;
const SCORER_GAP_Y = 20; // décalage sous le centre du nom SCR

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function svgFontDefs() {
  const defs = [];
  if (fs.existsSync(HW2_FONT)) {
    const fp = HW2_FONT.replace(/\\/g, '/').replace(/ /g, '%20');
    defs.push(`@font-face{font-family:'Hyperwave2';src:url('file://${fp}') format('truetype');}`);
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
  return await sharp(svgBuf).png().toBuffer();
}

async function loadLogo(logoPath) {
  if (!logoPath || !fs.existsSync(logoPath)) return null;
  try {
    return await sharp(logoPath)
      .resize(LOGO_SIZE, LOGO_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer();
  } catch { return null; }
}

async function loadBall() {
  if (!fs.existsSync(BALL_PATH)) {
    console.warn('[generateResultat] ball.png introuvable :', BALL_PATH);
    return null;
  }
  try {
    // Supprimer le fond noir (niveaux < 30 sur les 3 canaux)
    const { data, info } = await sharp(BALL_PATH)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8Array(data);
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i+1], b = pixels[i+2];
      if (r < 30 && g < 30 && b < 30) {
        pixels[i+3] = 0; // transparent
      }
    }

    const buf = await sharp(Buffer.from(pixels), {
      raw: { width: info.width, height: info.height, channels: 4 }
    })
      .resize(BALL_SIZE, BALL_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    console.log('[generateResultat] ball.png chargé OK, buffer:', buf.length);
    return buf;
  } catch(e) {
    console.error('[generateResultat] erreur ball.png:', e.message);
    return null;
  }
}

async function greyDisc() {
  const s = LOGO_SIZE;
  const svg = Buffer.from(
    `<svg width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">` +
    `<ellipse cx="${s/2}" cy="${s/2}" rx="${s/2}" ry="${s/2}" fill="#444" opacity="0.5"/></svg>`
  );
  return svgToPng(svg);
}

function parseScorers(raw) {
  return String(raw || '')
    .split(/[\n;]/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map(line => {
      const m = line.match(/^(.+?)\s+\[(\d+)\]$/);
      return m ? { name: m[1].trim(), count: parseInt(m[2]) } : { name: line, count: 1 };
    });
}

function textNode({ cx, cy, fs, weight = 'normal', color = '#ffffff', family, content,
                    stroke = null, strokeWidth = 0, letterSpacing = 0, anchor = 'middle' }) {
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
    ` text-anchor="${anchor}"` +
    ` dominant-baseline="middle"` +
    strokeAttrs + lsAttr +
    `>${esc(content)}</text>`
  );
}

const LAYOUT = {
  1: {
    matches: [{
      logoG: { cx: 103, cy: 394 },
      nomG:  { cx: 269, cy: 394, fs: 18 },
      score: { cx: 470, cy: 400, fs: 90 },
      nomD:  { cx: 669, cy: 394, fs: 18 },
      logoD: { cx: 837, cy: 394 },
    }],
  },
  2: {
    matches: [
      {
        logoG: { cx: 103, cy: 318 },
        nomG:  { cx: 271, cy: 318, fs: 17 },
        score: { cx: 470, cy: 324, fs: 85 },
        nomD:  { cx: 669, cy: 318, fs: 17 },
        logoD: { cx: 837, cy: 318 },
      },
      {
        logoG: { cx: 103, cy: 551 },
        nomG:  { cx: 271, cy: 551, fs: 17 },
        score: { cx: 470, cy: 557, fs: 85 },
        nomD:  { cx: 669, cy: 551, fs: 17 },
        logoD: { cx: 837, cy: 551 },
      },
    ],
  },
  3: {
    matches: [
      {
        logoG: { cx: 103, cy: 222 },
        nomG:  { cx: 269, cy: 222, fs: 15 },
        score: { cx: 470, cy: 228, fs: 78 },
        nomD:  { cx: 669, cy: 222, fs: 15 },
        logoD: { cx: 837, cy: 222 },
      },
      {
        logoG: { cx: 101, cy: 433 },
        nomG:  { cx: 271, cy: 433, fs: 15 },
        score: { cx: 470, cy: 439, fs: 78 },
        nomD:  { cx: 669, cy: 433, fs: 15 },
        logoD: { cx: 835, cy: 433 },
      },
      {
        logoG: { cx: 103, cy: 643 },
        nomG:  { cx: 266, cy: 643, fs: 15 },
        score: { cx: 470, cy: 649, fs: 78 },
        nomD:  { cx: 669, cy: 643, fs: 15 },
        logoD: { cx: 837, cy: 643 },
      },
    ],
  },
};

const SCORER_POS = {
  1: [ { xG: 163, xD: 775, y: 433 } ],
  2: [ { xG: 163, xD: 775, y: 355 }, { xG: 163, xD: 775, y: 588 } ],
  3: [ { xG: 163, xD: 775, y: 260 }, { xG: 163, xD: 775, y: 468 }, { xG: 163, xD: 775, y: 680 } ],
};

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

  const scoreFam = scoreFont();
  const arial    = 'Arial,Helvetica,sans-serif';
  const layers   = [];
  let   svgNodes = svgFontDefs();

  // Charger ball.png une seule fois
  const ballBuf = await loadBall();

  for (let i = 0; i < n; i++) {
    const match   = matches[i];
    const coord   = layout.matches[i];
    const scrLeft = match.domicile !== false;

    // ── Logos (centrés dans le cercle) ────────────────────────────────────────
    const lBuf = (await loadLogo(match.logoGauche)) || await greyDisc();
    const rBuf = (await loadLogo(match.logoDroite)) || await greyDisc();

    layers.push({
      input: lBuf,
      left: Math.round(coord.logoG.cx - LOGO_SIZE / 2),
      top:  Math.round(coord.logoG.cy - LOGO_SIZE / 2),
    });
    layers.push({
      input: rBuf,
      left: Math.round(coord.logoD.cx - LOGO_SIZE / 2),
      top:  Math.round(coord.logoD.cy - LOGO_SIZE / 2),
    });

    // ── Nom gauche ─────────────────────────────────────────────────────────────
    svgNodes += textNode({
      cx: coord.nomG.cx, cy: coord.nomG.cy, fs: coord.nomG.fs,
      weight: 'bold', family: arial, content: match.nomGauche,
    });

    // ── Score ──────────────────────────────────────────────────────────────────
    svgNodes += textNode({
      cx: coord.score.cx, cy: coord.score.cy, fs: coord.score.fs,
      family: scoreFam, content: match.score,
      stroke: '#0c372b', strokeWidth: 8, letterSpacing: -8,
    });

    // ── Nom droite ─────────────────────────────────────────────────────────────
    svgNodes += textNode({
      cx: coord.nomD.cx, cy: coord.nomD.cy, fs: coord.nomD.fs,
      weight: 'bold', family: arial, content: match.nomDroite,
    });

    // ── Buteurs ────────────────────────────────────────────────────────────────
    if (match.scorers) {
      const scorersParsed = parseScorers(match.scorers);
      const pos = SCORER_POS[n][i];
      const startY = pos.y;
      const xAnchor = scrLeft ? pos.xG : pos.xD;
      const anchor = scrLeft ? 'start' : 'end';

      scorersParsed.forEach(({ name, count }, idx) => {
        const y = startY + idx * SCORER_LH;

        // Afficher count ballons côte à côte
        let textX = scrLeft ? xAnchor + BALL_SIZE + 3 : xAnchor - BALL_SIZE - 3;
        if (ballBuf) {
          const totalBallW = count * (BALL_SIZE + 2);
          let ballStartX;
          if (scrLeft) {
            ballStartX = xAnchor;
          } else {
            ballStartX = xAnchor - totalBallW;
          }
          for (let b = 0; b < count; b++) {
            layers.push({
              input: ballBuf,
              left: Math.round(ballStartX + b * (BALL_SIZE + 2)),
              top: Math.round(y - BALL_SIZE / 2),
            });
          }
          // Décaler le texte en fonction du nombre de ballons
          const totalOffset = totalBallW + 3;
          textX = scrLeft ? xAnchor + totalOffset : xAnchor - totalOffset;
        }

        svgNodes += textNode({
          cx: textX,
          cy: y,
          fs: SCORER_FS,
          family: arial,
          content: name,
          anchor,
        });
      });
    }
  }

  // ── SVG → PNG ───────────────────────────────────────────────────────────────
  const svgBuf  = Buffer.from(
    `<svg width="940" height="788" xmlns="http://www.w3.org/2000/svg">${svgNodes}</svg>`
  );
  const textPng = await svgToPng(svgBuf);

  // ── Composite final ──────────────────────────────────────────────────────────
  const out = outputPath || path.join(GENERATED, `resultat_weekend_${Date.now()}.png`);

  await sharp(tplPath)
    .composite([
      ...layers,
      { input: textPng, top: 0, left: 0 },
    ])
    .png({ compressionLevel: 8 })
    .toFile(out);

  console.log(`[generateResultat] ✅ ${n} match(s) → ${out}`);
  return '/' + path.relative(BACKEND, out).replace(/\\/g, '/');
}

module.exports = { generateResultat };
