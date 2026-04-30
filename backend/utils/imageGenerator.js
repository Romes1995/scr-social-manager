/**
 * Génération d'images SCR Social Manager
 *
 * Fonctions exportées :
 *   generateProgramme(matchs)      → { story, post, [story_828], [carre] }
 *   generateScoreLive(matchId)     → "/uploads/generated/score_live_<id>.png"
 *   generateResultats(matchs)      → "/uploads/generated/resultats_<ts>.png"
 */

const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');
const pool  = require('../db');

const UPLOADS    = path.join(__dirname, '..', 'uploads');
const LOGOS_DIR  = path.join(UPLOADS, 'logos');
const TEMPLATES  = path.join(UPLOADS, 'templates');
const GENERATED  = path.join(UPLOADS, 'generated');
const LOGO_SCR      = path.join(LOGOS_DIR, 'scr.png');
const LOGO_SCR_MONO = path.join(LOGOS_DIR, 'scr_monochrome.png');
const BEBAS_FONT = path.join(__dirname, '..', 'fonts', 'BebasNeue-Regular.ttf');

// ─── Police Bebas Neue — chemin file:// (librsvg évite les data-URI > 50 Ko) ──
function svgFontDefs() {
  if (!fs.existsSync(BEBAS_FONT)) {
    console.warn('[imageGenerator] Bebas Neue introuvable :', BEBAS_FONT);
    return '';
  }
  // Normalise les backslashes pour Windows, encode les espaces
  const filePath = BEBAS_FONT.replace(/\\/g, '/').replace(/ /g, '%20');
  // Espace obligatoire avant format() (syntaxe CSS src: url(...) format(...))
  return `<defs><style>@font-face{font-family:'BebasNeue';src:url('file://${filePath}') format('truetype');}</style></defs>`;
}

/**
 * Convertit un Buffer SVG en Buffer PNG transparent.
 * Évite que librsvg rende le SVG avec un fond blanc opaque lors du composite Sharp.
 */
async function svgToPng(svgBuffer) {
  try {
    return await sharp(svgBuffer).png().toBuffer();
  } catch (err) {
    console.warn('[svgToPng] échec :', err.message, '— buffer SVG utilisé tel quel');
    return svgBuffer;
  }
}

// ─── Coordonnées Y des zones par nombre de matchs (PROGRAMME) ─────────────────

const STORY_Y = { 1:[960], 2:[786,1133], 3:[681,1028,1373], 4:[599,864,1129,1394] };
const POST_Y  = { 1:[394], 2:[279,509],  3:[284,433,582],   4:[228,364,500,637]  };
const STORY_828_Y = { 1:[736], 2:[603,869], 3:[522,788,1053], 4:[459,662,866,1069] };
const CARRE_Y     = { 1:[540], 2:[350,730], 3:[250,540,830],  4:[200,400,600,800] };

// ─── Config PROGRAMME par format ─────────────────────────────────────────────
//
// Coordonnées mesurées sur les templates réels :
//   POST  940×788  : puce gauche cx=187, puce droite cx=753
//   STORY 1080×1920: puce gauche cx=91,  puce droite cx=988

const POST_CFG = {
  logoSize: 80, logoLeftCx: 187, logoRightCx: 753,
  teamLeftCx: 352, teamRightCx: 588,
  teamFontSize: 19, dateOffsetY: 55, dateFontSize: 20, dateCx: 470,
  dateColor: '#ffffff', teamColor: '#1a1a1a',
};

const STORY_CFG = {
  logoSize: 127, logoLeftCx: 91, logoRightCx: 988,
  teamLeftCx: 350, teamRightCx: 728,
  teamFontSize: 24, dateOffsetY: 55, dateFontSize: 24, dateCx: 540,
  dateColor: '#ffffff', teamColor: '#1a1a1a',
};

const STORY_828_CFG = {
  logoSize: 97, logoLeftCx: 70, logoRightCx: 758,
  teamLeftCx: 268, teamRightCx: 558,
  teamFontSize: 19, dateOffsetY: 42, dateFontSize: 18, dateCx: 414,
  dateColor: '#ffffff', teamColor: '#1a1a1a',
};

const CARRE_CFG = {
  logoSize: 100, logoLeftCx: 91, logoRightCx: 988,
  teamLeftCx: 380, teamRightCx: 700,
  teamFontSize: 24, dateOffsetY: 55, dateFontSize: 24, dateCx: 540,
  dateColor: '#ffffff', teamColor: '#1a1a1a',
};

// ─── Normalisation ────────────────────────────────────────────────────────────

function normalizeClubName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+\d+$/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function sortByTeamNumber(matchs) {
  return [...matchs].sort((a, b) => {
    const na = parseInt((a.equipe || '').match(/\d+/)?.[0] ?? '9');
    const nb = parseInt((b.equipe || '').match(/\d+/)?.[0] ?? '9');
    return na - nb;
  });
}

// ─── Chargement logos ─────────────────────────────────────────────────────────

async function loadClubLogosFromDB() {
  try {
    const r = await pool.query(
      'SELECT nom, equipe, logo_url, logo_monochrome_url FROM clubs WHERE logo_url IS NOT NULL OR logo_monochrome_url IS NOT NULL'
    );
    const color = new Map(), mono = new Map();
    for (const row of r.rows) {
      // Indexer par nom normalisé ET par equipe normalisée (couvre "AS Gambsheim 2" → même logo)
      const keys = [normalizeClubName(row.nom)];
      if (row.equipe) keys.push(normalizeClubName(row.equipe));
      for (const key of keys) {
        if (row.logo_url && !color.has(key))            color.set(key, logoUrlToPath(row.logo_url));
        if (row.logo_monochrome_url && !mono.has(key))  mono.set(key, logoUrlToPath(row.logo_monochrome_url));
      }
    }
    return { color, mono };
  } catch { return { color: new Map(), mono: new Map() }; }
}

function logoUrlToPath(url) {
  if (!url || !url.startsWith('/uploads/')) return null;
  return path.join(__dirname, '..', url);
}

/**
 * Charge un logo PNG en buffer, redimensionné à size×size (fit:contain, fond transparent).
 * Retourne null si le fichier n'existe pas.
 */
async function loadLogoBuf(filePath, size) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return await sharp(filePath)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  } catch { return null; }
}

/**
 * Positionne un logo centré sur cx.
 * Gère le cas où cx - size/2 < 0 en recadrant le buffer.
 */
async function positionLogo(buf, size, cx, canvasW) {
  if (!buf) return null;
  const logoR    = Math.floor(size / 2);
  const idealLeft = cx - logoR;

  if (idealLeft >= 0 && idealLeft + size <= canvasW) {
    return { buf, left: idealLeft };
  }

  if (idealLeft < 0) {
    // Recadrer : couper la partie qui dépasse à gauche
    const cropLeft = -idealLeft;
    const newWidth = size - cropLeft;
    if (newWidth <= 0) return { buf, left: 0 };
    const cropped = await sharp(buf)
      .extract({ left: cropLeft, top: 0, width: newWidth, height: size })
      .toBuffer();
    return { buf: cropped, left: 0 };
  }

  // Dépasse à droite : ramener la gauche pour coller au bord
  return { buf, left: canvasW - size };
}

function makeGreyDisc(size) {
  const r = Math.floor(size / 2);
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="${r}" cy="${r}" r="${r}" fill="#cccccc" opacity="0.5"/></svg>`
  );
}

// ─── SVG helpers ──────────────────────────────────────────────────────────────

function esc(str) {
  return String(str || '')
    .replace(/[^\u0000-\uFFFF]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(dateStr, heureStr) {
  const JOURS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const MOIS  = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec'];
  const parts = [];
  if (dateStr) {
    const d = new Date(dateStr);
    parts.push(`${JOURS[d.getDay()]} ${String(d.getDate()).padStart(2,'0')} ${MOIS[d.getMonth()]}`);
  }
  if (heureStr) parts.push(heureStr.slice(0, 5));
  return parts.join('  ');
}

function svgText(x, y, fontSize, weight, color, content, fontFamily = 'Arial, Helvetica, sans-serif', stroke = null, strokeWidth = 0) {
  const strokeAttrs = stroke
    ? ` stroke="${stroke}" stroke-width="${strokeWidth}" paint-order="stroke fill"`
    : '';
  return (
    `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${fontSize}" font-weight="${weight}"` +
    ` fill="${color}" text-anchor="middle" dominant-baseline="middle"${strokeAttrs}>${content}</text>`
  );
}

// ─── Rendu d'un format (PROGRAMME) ───────────────────────────────────────────

async function renderFormat({ tpl, out, W, H, Y_MAP, CFG, sorted, n, logos }) {
  const { logoSize, logoLeftCx, logoRightCx,
          teamLeftCx, teamRightCx, teamFontSize,
          dateOffsetY, dateFontSize, dateCx, dateColor, teamColor } = CFG;
  const logoR = Math.floor(logoSize / 2);

  const logoLayers = [];

  for (let i = 0; i < n; i++) {
    const m   = sorted[i];
    const cy  = Y_MAP[n][i];
    const top = Math.round(cy - logoR);

    const scrOnLeft = m.domicile !== false;
    const advNorm   = normalizeClubName(m.adversaire);
    const advPath   = logos.color.get(advNorm) || null;

    const scrBuf = await loadLogoBuf(fs.existsSync(LOGO_SCR) ? LOGO_SCR : null, logoSize);
    const advBuf = await loadLogoBuf(advPath, logoSize);

    const leftBuf  = scrOnLeft ? scrBuf  : advBuf;
    const rightBuf = scrOnLeft ? advBuf  : scrBuf;

    const lPos = await positionLogo(leftBuf  || makeGreyDisc(logoSize), logoSize, logoLeftCx,  W);
    const rPos = await positionLogo(rightBuf || makeGreyDisc(logoSize), logoSize, logoRightCx, W);

    if (lPos) logoLayers.push({ input: lPos.buf, left: lPos.left, top });
    if (rPos) logoLayers.push({ input: rPos.buf, left: rPos.left, top });
  }

  let svgNodes = svgFontDefs();
  for (let i = 0; i < n; i++) {
    const m   = sorted[i];
    const cy  = Y_MAP[n][i];
    const scrOnLeft = m.domicile !== false;
    const leftName  = esc(scrOnLeft ? m.equipe : m.adversaire);
    const rightName = esc(scrOnLeft ? m.adversaire : m.equipe);
    const dateTxt   = esc(fmtDate(m.date, m.heure));

    svgNodes += svgText(teamLeftCx,  cy,               teamFontSize, 'bold',   teamColor, leftName);
    svgNodes += svgText(teamRightCx, cy,               teamFontSize, 'bold',   teamColor, rightName);
    svgNodes += svgText(dateCx,      cy + dateOffsetY, dateFontSize, 'normal', dateColor, dateTxt);
  }

  const svgLayer = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svgNodes}</svg>`);

  await sharp(tpl)
    .composite([...logoLayers, { input: svgLayer, top: 0, left: 0 }])
    .png({ compressionLevel: 8 })
    .toFile(out);
}

// ─── GÉNÉRATION PROGRAMME ─────────────────────────────────────────────────────

async function generateProgramme(matchs) {
  if (!Array.isArray(matchs) || matchs.length === 0) throw new Error('Aucun match fourni');

  const sorted = sortByTeamNumber(matchs);
  const n      = Math.min(sorted.length, 4);
  const suffix = `${n}match${n > 1 ? 's' : ''}`;

  const storyTpl = path.join(TEMPLATES, `programme_story_${suffix}.png`);
  const postTpl  = path.join(TEMPLATES, `programme_post_${suffix}.png`);
  if (!fs.existsSync(storyTpl)) throw new Error(`Template story introuvable : programme_story_${suffix}.png`);
  if (!fs.existsSync(postTpl))  throw new Error(`Template post introuvable : programme_post_${suffix}.png`);
  if (!fs.existsSync(GENERATED)) fs.mkdirSync(GENERATED, { recursive: true });

  const logos = await loadClubLogosFromDB();
  const ts    = Date.now();
  const ctx   = { sorted, n, logos };

  const storyOut = path.join(GENERATED, `programme_story_${ts}.png`);
  const postOut  = path.join(GENERATED, `programme_post_${ts}.png`);

  await renderFormat({ tpl: storyTpl, out: storyOut, W:1080, H:1920, Y_MAP:STORY_Y, CFG:STORY_CFG, ...ctx });
  await renderFormat({ tpl: postTpl,  out: postOut,  W:940,  H:788,  Y_MAP:POST_Y,  CFG:POST_CFG,  ...ctx });

  const result = {
    story: `/uploads/generated/programme_story_${ts}.png`,
    post:  `/uploads/generated/programme_post_${ts}.png`,
  };

  const s828Tpl = path.join(TEMPLATES, `programme_story_828_${suffix}.png`);
  if (fs.existsSync(s828Tpl)) {
    const s828Out = path.join(GENERATED, `programme_story_828_${ts}.png`);
    await renderFormat({ tpl: s828Tpl, out: s828Out, W:828, H:1472, Y_MAP:STORY_828_Y, CFG:STORY_828_CFG, ...ctx });
    result.story_828 = `/uploads/generated/programme_story_828_${ts}.png`;
  }

  const carreTpl = path.join(TEMPLATES, `programme_carre_${suffix}.png`);
  if (fs.existsSync(carreTpl)) {
    const carreOut = path.join(GENERATED, `programme_carre_${ts}.png`);
    await renderFormat({ tpl: carreTpl, out: carreOut, W:1080, H:1080, Y_MAP:CARRE_Y, CFG:CARRE_CFG, ...ctx });
    result.carre = `/uploads/generated/programme_carre_${ts}.png`;
  }

  return result;
}

// ─── GÉNÉRATION SCORE LIVE ────────────────────────────────────────────────────
//
// Template 1080×1920 (score_live_scr1.png / scr2 / scr3)
// Logo gauche  : centre cx=302, cy=1236, size=397
// Logo droite  : centre cx=777, cy=1218, size=390
// Score gauche : x=LEFT_CX, y=LEFT_CY+LEFT_SIZE/2+150, BebasNeue 215px #ffffff (centré sur logo)
// Tiret        : x=540 (milieu image), y=moyenne des deux scoreY
// Score droite : x=RIGHT_CX, y=RIGHT_CY+RIGHT_SIZE/2+150, BebasNeue 215px #ffffff (centré sur logo)
// (pas de noms d'équipes)

/**
 * @param {number|string} matchId    - ID du match en base
 * @param {object|null}   matchData  - Données mock optionnelles (tests / debug)
 * @param {boolean}       finDeMatch - Ajouter le bandeau "FIN DE MATCH" sur le visuel
 */
async function generateScoreLive(matchId, matchData = null, finDeMatch = false) {
  if (!fs.existsSync(GENERATED)) fs.mkdirSync(GENERATED, { recursive: true });

  // ── 1. Chargement du match ──────────────────────────────────────────────────
  let match;
  if (matchData) {
    match = matchData;
    console.log(`[scoreLive] mode TEST — données fournies directement`);
  } else {
    const r = await pool.query('SELECT * FROM matches WHERE id=$1', [matchId]);
    if (r.rows.length === 0) throw new Error('Match non trouvé : id=' + matchId);
    match = r.rows[0];
  }
  console.log(`[scoreLive] match : "${match.equipe}" vs "${match.adversaire}" | score ${match.score_scr ?? 0}-${match.score_adv ?? 0} | domicile=${match.domicile}`);

  // ── 2. Template ─────────────────────────────────────────────────────────────
  // Priorité 1 : template enregistré en base (type='score_live', equipe correspondante)
  // Priorité 2 : fichier hardcodé uploads/templates/score_live_scrN.png (fallback)
  let tpl = null;

  try {
    // 1. Template exact pour cette équipe (ex: 'SCR 3')
    let dbRes = await pool.query(
      `SELECT fichier FROM templates WHERE type = 'score_live' AND equipe ILIKE $1 ORDER BY id DESC LIMIT 1`,
      [match.equipe || '']
    );
    // 2. Fallback : n'importe quel template score_live en base
    if (dbRes.rows.length === 0) {
      dbRes = await pool.query(
        `SELECT fichier FROM templates WHERE type = 'score_live' ORDER BY id DESC LIMIT 1`
      );
    }
    if (dbRes.rows.length > 0) {
      const dbPath = path.join(__dirname, '..', dbRes.rows[0].fichier);
      if (fs.existsSync(dbPath)) {
        tpl = dbPath;
        console.log(`[scoreLive] template DB : ${dbRes.rows[0].fichier} (${Math.round(fs.statSync(tpl).size / 1024)}KB)`);
      } else {
        console.warn(`[scoreLive] fichier DB introuvable sur disque : ${dbPath}`);
      }
    }
  } catch (dbErr) {
    console.warn(`[scoreLive] erreur requête template DB : ${dbErr.message}`);
  }

  // Fallback hardcodé
  if (!tpl) {
    const teamNum = parseInt((match.equipe || '').match(/\d+/)?.[0] || '1');
    const tplName = `score_live_scr${Math.min(teamNum, 3)}.png`;
    tpl = path.join(TEMPLATES, tplName);
    console.log(`[scoreLive] template fallback : ${tpl} — existe: ${fs.existsSync(tpl)}`);
  }

  if (!fs.existsSync(tpl)) throw new Error(`Template introuvable : ${tpl}`);
  const tplMeta = await sharp(tpl).metadata();
  console.log(`[scoreLive] template final — ${tplMeta.width}×${tplMeta.height}px ${Math.round(fs.statSync(tpl).size / 1024)}KB`);

  // ── 3. Police ────────────────────────────────────────────────────────────────
  const fontOk = fs.existsSync(BEBAS_FONT);
  console.log(`[scoreLive] police BebasNeue : ${fontOk ? 'OK (' + Math.round(fs.statSync(BEBAS_FONT).size / 1024) + 'KB)' : 'ABSENTE → fallback Arial'}`);

  // ── 4. Logos ─────────────────────────────────────────────────────────────────
  const logos     = await loadClubLogosFromDB();
  const scrOnLeft = match.domicile !== false;
  const advNorm   = normalizeClubName(match.adversaire);
  const advPath   = logos.mono.get(advNorm) || logos.color.get(advNorm) || null;
  const scrPath   = fs.existsSync(LOGO_SCR_MONO) ? LOGO_SCR_MONO
                  : fs.existsSync(LOGO_SCR)      ? LOGO_SCR
                  : null;
  console.log(`[scoreLive] logo SCR : ${scrPath || 'absent'}${fs.existsSync(LOGO_SCR_MONO) ? ' (monochrome)' : ''} | logo adv ("${advNorm}") : ${advPath || 'aucun'}`);

  const LEFT_SIZE  = 390;
  const RIGHT_SIZE = 390;
  const LEFT_CX    = 302;
  const RIGHT_CX   = 777;
  const LEFT_CY    = 1236;
  const RIGHT_CY   = 1218;

  const leftLogoPath  = scrOnLeft ? scrPath : advPath;
  const rightLogoPath = scrOnLeft ? advPath : scrPath;

  // Charger les logos ; fallback disque gris (converti en PNG pour éviter SVG opaque)
  const leftBuf  = await loadLogoBuf(leftLogoPath,  LEFT_SIZE)
                || await svgToPng(makeGreyDisc(LEFT_SIZE));
  const rightBuf = await loadLogoBuf(rightLogoPath, RIGHT_SIZE)
                || await svgToPng(makeGreyDisc(RIGHT_SIZE));

  const lPos = await positionLogo(leftBuf,  LEFT_SIZE,  LEFT_CX,  1080);
  const rPos = await positionLogo(rightBuf, RIGHT_SIZE, RIGHT_CX, 1080);

  const layers = [];
  if (lPos) {
    const top = Math.round(LEFT_CY  - LEFT_SIZE  / 2);
    layers.push({ input: lPos.buf, left: lPos.left, top });
    console.log(`[scoreLive] logo gauche  left=${lPos.left} top=${top} size=${LEFT_SIZE}`);
  }
  if (rPos) {
    const top = Math.round(RIGHT_CY - RIGHT_SIZE / 2);
    layers.push({ input: rPos.buf, left: rPos.left, top });
    console.log(`[scoreLive] logo droite  left=${rPos.left} top=${top} size=${RIGHT_SIZE}`);
  }

  // ── 5. Couche texte SVG → PNG transparent ───────────────────────────────────
  const scrScore   = match.score_scr  ?? 0;
  const advScore   = match.score_adv  ?? 0;
  const leftScore  = scrOnLeft ? scrScore : advScore;
  const rightScore = scrOnLeft ? advScore : scrScore;

  console.log(`[scoreLive] scores — gauche: ${leftScore} | droite: ${rightScore}`);

  const bebas = "'BebasNeue', Arial, Helvetica, sans-serif";

  // Scores centrés sous chaque logo (text-anchor="middle" dans svgText)
  const SCORE_Y = Math.round(LEFT_CY + LEFT_SIZE / 2 + 150);
  console.log(`[scoreLive] score Y — ${SCORE_Y}`);

  // Couleur de contour selon l'équipe SCR
  const STROKE_COLORS = { 1: '#51946a', 2: '#5500ff', 3: '#00bf63' };
  const teamNum    = parseInt((match.equipe || '').match(/\d+/)?.[0] || '1');
  const strokeColor = STROKE_COLORS[Math.min(Math.max(teamNum, 1), 3)];
  console.log(`[scoreLive] stroke couleur — ${strokeColor} (équipe ${teamNum})`);

  const svgContent =
    `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">` +
    svgFontDefs() +
    // Bandeau "FIN DE MATCH" si demandé
    (finDeMatch ? svgText(540, 880, 100, 'normal', '#ffffff', 'FIN DE MATCH', bebas, strokeColor, 6) : '') +
    // Scores centrés sur le centre de chaque logo — pas de noms d'équipes
    svgText(LEFT_CX,  SCORE_Y, 215, 'normal', '#ffffff', String(leftScore),  bebas, strokeColor, 10) +
    svgText(540,      SCORE_Y, 215, 'normal', '#ffffff', '-',                bebas, strokeColor, 10) +
    svgText(RIGHT_CX, SCORE_Y, 215, 'normal', '#ffffff', String(rightScore), bebas, strokeColor, 10) +
    `</svg>`;

  // IMPORTANT : convertir le SVG en PNG avant composite
  // → évite que librsvg rende le SVG avec un fond blanc opaque qui couvre le template
  const textLayerPng = await svgToPng(Buffer.from(svgContent));
  layers.push({ input: textLayerPng, top: 0, left: 0 });

  // ── 6. Composite sur le template PNG ─────────────────────────────────────────
  const outFile = finDeMatch ? `fin_match_${matchId}.png` : `score_live_${matchId}.png`;
  const out     = path.join(GENERATED, outFile);

  await sharp(tpl)
    .composite(layers)
    .png({ compressionLevel: 8 })
    .toFile(out);

  console.log(`[scoreLive] ✅ généré → ${out}`);
  return `/uploads/generated/${outFile}`;
}

// ─── GÉNÉRATION RÉSULTATS ─────────────────────────────────────────────────────
//
// Templates 940×788  (resultat_1match.png / 2matchs / 3matchs)
//
// 1 MATCH :
//   Logo gauche  : cx=103, cy=384, size=71
//   Logo droite  : cx=840, cy=384, size=76
//   Score        : x=328, y=303, BebasNeue 114px #ffffff
//   Nom gauche   : x=507, y=326, 20px #ffffff
//   Nom droite   : x=737, y=326, 20px #ffffff
//   Buteurs SCR  : x=507, y=365, 14px #ffffff
//
// 2 MATCHS (pas de noms ni buteurs, espace réduit) :
//   Match 1 → logo g cx=105 cy=309, logo d cx=837 cy=316, score x=328 y=236
//   Match 2 → logo g cx=105 cy=449, logo d cx=837 cy=456, score x=328 y=376
//
// 3 MATCHS :
//   Match 1 → logo g cx=103 cy=222, logo d cx=837 cy=215, score x=328 y=141
//   Match 2 → logo g cx=103 cy=384, logo d cx=837 cy=384, score x=328 y=303
//   Match 3 → logo g cx=103 cy=546, logo d cx=837 cy=546, score x=328 y=465

const RESULT_COORDS = {
  1: [
    { lgCx:103, lgCy:384, lgSz:71, rdCx:840, rdCy:384, rdSz:76, scoreX:328, scoreY:303,
      nomGX:507, nomGY:326, nomDX:737, nomDY:326, buteursX:507, buteursY:365 },
  ],
  2: [
    { lgCx:105, lgCy:309, lgSz:60, rdCx:837, rdCy:316, rdSz:65, scoreX:328, scoreY:236 },
    { lgCx:105, lgCy:449, lgSz:60, rdCx:837, rdCy:456, rdSz:65, scoreX:328, scoreY:376 },
  ],
  3: [
    { lgCx:103, lgCy:222, lgSz:52, rdCx:837, rdCy:215, rdSz:57, scoreX:328, scoreY:141 },
    { lgCx:103, lgCy:384, lgSz:52, rdCx:837, rdCy:384, rdSz:57, scoreX:328, scoreY:303 },
    { lgCx:103, lgCy:546, lgSz:52, rdCx:837, rdCy:546, rdSz:57, scoreX:328, scoreY:465 },
  ],
};

async function generateResultats(matchs) {
  if (!Array.isArray(matchs) || matchs.length === 0) throw new Error('Aucun match fourni');
  if (!fs.existsSync(GENERATED)) fs.mkdirSync(GENERATED, { recursive: true });

  const sorted = sortByTeamNumber(matchs);
  const n      = Math.min(sorted.length, 3);
  const suffix = `${n}match${n > 1 ? 's' : ''}`;
  const tpl    = path.join(TEMPLATES, `resultat_${suffix}.png`);
  if (!fs.existsSync(tpl)) throw new Error(`Template résultats introuvable : resultat_${suffix}.png`);

  const logos = await loadClubLogosFromDB();
  const coords = RESULT_COORDS[n];
  const bebas  = 'BebasNeue, Arial';

  const logoLayers = [];
  let   svgNodes   = svgFontDefs();

  for (let i = 0; i < n; i++) {
    const m   = sorted[i];
    const c   = coords[i];
    const scrOnLeft = m.domicile !== false;

    // Résolution logos
    const advNorm   = normalizeClubName(m.adversaire);
    const advPath   = logos.color.get(advNorm) || null;
    const scrPath   = fs.existsSync(LOGO_SCR) ? LOGO_SCR : null;

    const leftBufRaw  = scrOnLeft
      ? await loadLogoBuf(scrPath, c.lgSz)
      : await loadLogoBuf(advPath, c.lgSz);
    const rightBufRaw = scrOnLeft
      ? await loadLogoBuf(advPath, c.rdSz)
      : await loadLogoBuf(scrPath, c.rdSz);

    const lPos = await positionLogo(leftBufRaw  || makeGreyDisc(c.lgSz), c.lgSz, c.lgCx, 940);
    const rPos = await positionLogo(rightBufRaw || makeGreyDisc(c.rdSz), c.rdSz, c.rdCx, 940);

    if (lPos) logoLayers.push({ input: lPos.buf, left: lPos.left, top: Math.round(c.lgCy - c.lgSz / 2) });
    if (rPos) logoLayers.push({ input: rPos.buf, left: rPos.left, top: Math.round(c.rdCy - c.rdSz / 2) });

    // Score
    const leftScore  = scrOnLeft ? m.score_scr : m.score_adv;
    const rightScore = scrOnLeft ? m.score_adv : m.score_scr;
    const scoreTxt   = esc(`${leftScore ?? 0} - ${rightScore ?? 0}`);
    svgNodes += svgText(c.scoreX, c.scoreY, 114, 'normal', '#ffffff', scoreTxt, bebas);

    // Noms d'équipe + buteurs (1 match uniquement, coordonnées fournies)
    if (c.nomGX !== undefined) {
      const leftName  = esc(scrOnLeft ? m.equipe : m.adversaire);
      const rightName = esc(scrOnLeft ? m.adversaire : m.equipe);
      svgNodes += svgText(c.nomGX, c.nomGY, 20, 'normal', '#ffffff', leftName);
      svgNodes += svgText(c.nomDX, c.nomDY, 20, 'normal', '#ffffff', rightName);

      // Buteurs SCR : toujours dans la zone gauche si dom, droite si ext
      const buteurs = (m.buteurs || []).slice(0, 5); // max 5 lignes
      if (buteurs.length > 0) {
        const butTxt = esc(buteurs.join(' / '));
        svgNodes += svgText(c.buteursX, c.buteursY, 14, 'normal', '#ffffff', butTxt);
      }
    }
  }

  const svgLayer = Buffer.from(
    `<svg width="940" height="788" xmlns="http://www.w3.org/2000/svg">${svgNodes}</svg>`
  );

  const ts  = Date.now();
  const out = path.join(GENERATED, `resultats_${ts}.png`);
  await sharp(tpl)
    .composite([...logoLayers, { input: svgLayer, top: 0, left: 0 }])
    .png({ compressionLevel: 8 })
    .toFile(out);

  return `/uploads/generated/resultats_${ts}.png`;
}

// ─── GÉNÉRATION MATCHDAY ──────────────────────────────────────────────────────
//
// Template 1080×1920 (type='matchday' en base, id=9 "Matchday Vierge")
// Logo domicile : left=130, top=680, 220×220px
// Logo visiteur : left=730, top=680, 220×220px
//
// Textes (text-anchor="middle" — x = centre du texte) :
//   Nom équipe SCR    : x=540,  y=100,  28px  #FFFFFF
//   Nom domicile      : x=190,  y=1035, 36px  #000000  bold
//   "VS"              : x=540,  y=1035, 36px  #000000  bold
//   Nom visiteur      : x=890,  y=1035, 36px  #000000  bold
//   Date DD.MM.YYYY   : x=540,  y=1200, 130px #FFE600  bold
//   Heure XXH00       : x=540,  y=1430, 52px  #FFE600  normal
//   Lieu              : x=540,  y=1490, 52px  #FFE600  bold

/**
 * @param {number|string} matchId    - ID du match en base
 * @param {number}        teamNumber - Numéro d'équipe SCR (1, 2 ou 3)
 */
async function generateMatchDay(matchId, teamNumber = 1) {
  if (!fs.existsSync(GENERATED)) fs.mkdirSync(GENERATED, { recursive: true });

  // ── 1. Chargement du match ──────────────────────────────────────────────────
  const r = await pool.query('SELECT * FROM matches WHERE id=$1', [matchId]);
  if (r.rows.length === 0) throw new Error('Match non trouvé : id=' + matchId);
  const match = r.rows[0];
  console.log(`[matchDay] match : "${match.equipe}" vs "${match.adversaire}" | domicile=${match.domicile}`);

  // ── 2. Template ─────────────────────────────────────────────────────────────
  // Priorité 1 : template de type='matchday' enregistré en base
  // Priorité 2 : fichier hardcodé (id=9, "Matchday Vierge")
  let tpl = null;

  try {
    const dbRes = await pool.query(
      `SELECT fichier FROM templates WHERE type = 'matchday' ORDER BY id DESC LIMIT 1`
    );
    if (dbRes.rows.length > 0) {
      const dbPath = path.join(__dirname, '..', dbRes.rows[0].fichier);
      if (fs.existsSync(dbPath)) {
        tpl = dbPath;
        console.log(`[matchDay] template DB : ${dbRes.rows[0].fichier}`);
      } else {
        console.warn(`[matchDay] fichier DB introuvable sur disque : ${dbPath}`);
      }
    }
  } catch (dbErr) {
    console.warn(`[matchDay] erreur requête template DB : ${dbErr.message}`);
  }

  // Fallback hardcodé
  if (!tpl) {
    tpl = path.join(UPLOADS, 'template_1776525499057.png');
    console.log(`[matchDay] template fallback : ${tpl} — existe: ${fs.existsSync(tpl)}`);
  }

  if (!fs.existsSync(tpl)) throw new Error(`Template matchday introuvable : ${tpl}`);
  const tplMeta = await sharp(tpl).metadata();
  console.log(`[matchDay] template final — ${tplMeta.width}×${tplMeta.height}px`);

  // ── 3. Logos ─────────────────────────────────────────────────────────────────
  const logos     = await loadClubLogosFromDB();
  const scrOnLeft = match.domicile !== false; // true = SCR est domicile (gauche)
  const advNorm   = normalizeClubName(match.adversaire);
  const advPath   = logos.color.get(advNorm) || logos.mono.get(advNorm) || null;
  const scrPath   = fs.existsSync(LOGO_SCR) ? LOGO_SCR : null;
  console.log(`[matchDay] logo SCR : ${scrPath || 'absent'} | logo adv ("${advNorm}") : ${advPath || 'aucun'}`);

  const LOGO_SIZE = 220;

  const domLogoPath = scrOnLeft ? scrPath : advPath;
  const visLogoPath = scrOnLeft ? advPath : scrPath;

  const domBuf = await loadLogoBuf(domLogoPath, LOGO_SIZE)
              || await svgToPng(makeGreyDisc(LOGO_SIZE));
  const visBuf = await loadLogoBuf(visLogoPath, LOGO_SIZE)
              || await svgToPng(makeGreyDisc(LOGO_SIZE));

  // ── 4. Formatage textes ───────────────────────────────────────────────────────
  // Date → DD.MM.YYYY
  let dateFmt = '';
  if (match.date) {
    const d  = new Date(match.date);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    dateFmt = `${dd}.${mm}.${d.getFullYear()}`;
  }

  // Heure → XXH00
  const heureFmt = match.heure
    ? match.heure.slice(0, 5).replace(':', 'H')
    : '';

  // Noms équipes
  const num = Math.min(Math.max(parseInt(teamNumber) || 1, 1), 3);
  const scrLabel    = esc(`SC ROESCHWOOG EQUIPE ${num}`);
  const scrNameShort = esc(`SCR ${num}`);

  // Nom domicile / visiteur dans la bande blanche
  const domNom = esc((scrOnLeft ? scrNameShort : String(match.adversaire || '').toUpperCase()));
  const visNom = esc((scrOnLeft ? String(match.adversaire || '').toUpperCase() : scrNameShort));

  const lieu = esc(
    match.lieu && match.lieu.trim() !== ''
      ? match.lieu.trim().toUpperCase()
      : 'ROESCHWOOG'
  );

  console.log(`[matchDay] date="${dateFmt}" heure="${heureFmt}" dom="${domNom}" vis="${visNom}" lieu="${lieu}"`);

  // ── 5. Couche texte SVG → PNG transparent ─────────────────────────────────────
  const bebas = "'BebasNeue', Arial, Helvetica, sans-serif";

  const svgContent =
    `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">` +
    svgFontDefs() +
    // Nom équipe SCR en haut
    svgText(540,  68,   26,  '400',  '#FFFFFF', scrLabel, bebas) +
    // Bande blanche : noms + VS — centres ramenés vers le milieu pour éviter les débordements
    svgText(270,  1032, 32,  '700',  '#000000', domNom, bebas) +
    svgText(540,  1032, 32,  '700',  '#000000', 'VS', bebas) +
    svgText(810,  1032, 32,  '700',  '#000000', visNom, bebas) +
    // Date grande — sous la bande blanche
    svgText(540,  1230, 120, '700',  '#FFE600', esc(dateFmt), bebas) +
    // Heure + lieu — espacés pour ne pas se chevaucher
    svgText(540,  1410, 48,  '400',  '#FFE600', esc(heureFmt), bebas) +
    svgText(540,  1480, 46,  '700',  '#FFE600', lieu, bebas) +
    `</svg>`;

  // IMPORTANT : convertir le SVG en PNG avant composite
  const textLayerPng = await svgToPng(Buffer.from(svgContent));

  // ── 6. Composite sur le template ─────────────────────────────────────────────
  const outputPath = path.join(GENERATED, `matchday_e${num}_${matchId}.png`);

  await sharp(tpl)
    .composite([
      { input: domBuf, left: 130, top: 680 },
      { input: visBuf, left: 730, top: 680 },
      { input: textLayerPng, top: 0, left: 0 },
    ])
    .png({ compressionLevel: 8 })
    .toFile(outputPath);

  console.log(`[matchDay] ✅ généré → ${outputPath}`);
  return `/uploads/generated/matchday_e${num}_${matchId}.png`;
}

module.exports = { generateProgramme, generateScoreLive, generateResultats, generateMatchDay };
