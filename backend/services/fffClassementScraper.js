/**
 * Scraper du tableau de classement FFF (epreuves.fff.fr)
 * Axios + Cheerio — retourne toutes les lignes du tableau, pas seulement SCR
 *
 * Si la page est rendue côté client (JS uniquement), scrapeTeam() lève une
 * erreur et l'appelant (public.js) bascule sur le calcul DB.
 */

const axios   = require('axios');
const cheerio = require('cheerio');

// ── URLs par équipe ────────────────────────────────────────────────────────────
const TEAM_CONFIGS = {
  'SCR 1': {
    url:      'https://epreuves.fff.fr/competition/club/504189-s-c-roeschwoog/equipe/2025_2131_SEM_1/classement',
    division: 'District 1 Alsace',
  },
  'SCR 2': {
    url:      'https://epreuves.fff.fr/competition/club/504189-s-c-roeschwoog/equipe/2025_2131_SEM_3/classement',
    division: 'District 5 Alsace',
  },
  'SCR 3': {
    url:      'https://epreuves.fff.fr/competition/club/504189-s-c-roeschwoog/equipe/2025_2131_SEM_2/classement',
    division: 'District 7 Accession',
  },
};

// ── Cache en mémoire (TTL 1 heure) ────────────────────────────────────────────
const cache = {};
const CACHE_TTL = 60 * 60 * 1000; // ms

// ── Helpers ───────────────────────────────────────────────────────────────────
const BROWSER_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control':   'no-cache',
};

function toInt(s) {
  const n = parseInt(String(s ?? '').replace(/[^\d-]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

/** Trouve l'indice d'une colonne dans le tableau des headers (insensible à la casse). */
function findCol(headers, ...candidates) {
  for (const c of candidates) {
    const idx = headers.findIndex(h => h.toLowerCase() === c.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

// ── Scraping d'une équipe ──────────────────────────────────────────────────────
async function scrapeTeam(teamKey) {
  const { url, division } = TEAM_CONFIGS[teamKey];

  const { data: html } = await axios.get(url, {
    headers: BROWSER_HEADERS,
    timeout: 20000,
    maxRedirects: 5,
  });

  const $ = cheerio.load(html);

  // ── Trouver la meilleure table ─────────────────────────────────────────────
  // Stratégie : choisir la table dont le contenu texte contient "ROESCHWOOG"
  // ou, à défaut, la table avec le plus de lignes <tr>.
  let bestTable  = null;
  let bestScore  = -1;

  $('table').each((_, tbl) => {
    const text  = $(tbl).text().toUpperCase();
    const rows  = $(tbl).find('tr').length;
    let score   = rows;
    if (text.includes('ROESCHWOOG')) score += 1000;
    if (text.includes('PTS') || text.includes('POINTS')) score += 50;
    if (text.includes('CLASSEMENT')) score += 20;
    if (score > bestScore) { bestScore = score; bestTable = tbl; }
  });

  if (!bestTable) throw new Error(`Aucun tableau trouvé sur ${url}`);

  // ── Détecter les colonnes depuis les headers ───────────────────────────────
  const headerEls  = $(bestTable).find('thead tr, tr').first().find('th, td');
  const headers    = headerEls.map((_, el) => $(el).text().trim().toLowerCase()).get();
  const hasHeaders = headers.length >= 5 && headers.some(h => /pts|points|j\b|joués/.test(h));

  // Structure réelle du tableau FFF (13+ colonnes) :
  //  td[0]  # (rang)
  //  td[1]  Pr. (indicateur promotion/relégation)
  //  td[2]  Equipe
  //  td[3]  Pts
  //  td[4]  J
  //  td[5]  G
  //  td[6]  N
  //  td[7]  P
  //  td[8]  F  (forfaits)
  //  td[9]  P/Bo (points bonus)
  //  td[10] Bp
  //  td[11] Bc
  //  td[12] Diff
  //  td[13] Série
  const FFF_IDX = { rank: 0, club: 2, pts: 3, joues: 4, victoires: 5, nuls: 6, defaites: 7, bp: 10, bc: 11, diff: 12 };

  const CI = {
    rank:      hasHeaders ? findCol(headers, '#', 'rang', 'cl.', 'pos')                       : FFF_IDX.rank,
    club:      hasHeaders ? findCol(headers, 'equipe', 'équipe', 'club', 'nom')               : FFF_IDX.club,
    pts:       hasHeaders ? findCol(headers, 'pts', 'points')                                  : FFF_IDX.pts,
    joues:     hasHeaders ? findCol(headers, 'j', 'mj', 'joués', 'joues')                     : FFF_IDX.joues,
    victoires: hasHeaders ? findCol(headers, 'g', 'v', 'vic', 'gagné', 'gagnés')              : FFF_IDX.victoires,
    nuls:      hasHeaders ? findCol(headers, 'n', 'nul', 'nuls')                               : FFF_IDX.nuls,
    defaites:  hasHeaders ? findCol(headers, 'p', 'def', 'perdu', 'perdus')                   : FFF_IDX.defaites,
    bp:        hasHeaders ? findCol(headers, 'bp', 'b.p', 'b.p.', 'buts pour', 'pour')        : FFF_IDX.bp,
    bc:        hasHeaders ? findCol(headers, 'bc', 'b.c', 'b.c.', 'buts contre', 'contre')    : FFF_IDX.bc,
    diff:      hasHeaders ? findCol(headers, 'diff', 'dif', 'différence', '+/-', 'goal diff')  : FFF_IDX.diff,
  };

  // Les colonnes non trouvées par findCol (-1) tombent sur les indices FFF réels
  Object.keys(CI).forEach(k => { if (CI[k] === -1) CI[k] = FFF_IDX[k]; });

  console.log(`[FFF scraper] ${teamKey} — headers détectés :`, headers);
  console.log(`[FFF scraper] ${teamKey} — mapping colonnes :`, CI);

  // ── Extraire les lignes de données ─────────────────────────────────────────
  const rows = [];

  $(bestTable).find('tr').each((_, rowEl) => {
    const cells = $(rowEl).find('td');
    if (cells.length < 6) return;

    const cellTexts = cells.map((_, td) => $(td).text().trim()).get();

    // Une ligne valide commence par un rang numérique
    if (!/^\d+$/.test(cellTexts[CI.rank])) return;

    const rank     = parseInt(cellTexts[CI.rank], 10);
    const clubName = cellTexts[CI.club] || '';
    if (!clubName) return;

    const isScr = clubName.toUpperCase().includes('ROESCHWOOG');

    rows.push({
      rank,
      equipe:      clubName,
      points:      toInt(cellTexts[CI.pts]),
      joues:       toInt(cellTexts[CI.joues]),
      victoires:   toInt(cellTexts[CI.victoires]),
      nuls:        toInt(cellTexts[CI.nuls]),
      defaites:    toInt(cellTexts[CI.defaites]),
      buts_pour:   toInt(cellTexts[CI.bp]),
      buts_contre: toInt(cellTexts[CI.bc]),
      diff:        toInt(cellTexts[CI.diff]),
      isSCR:       isScr,
    });
  });

  if (rows.length === 0) {
    throw new Error(
      `Tableau trouvé mais aucune ligne extraite pour ${teamKey} ` +
      `— la page est probablement rendue côté client (JavaScript). ` +
      `Envisager Puppeteer ou l'API DOFA.`
    );
  }

  const scrRow = rows.find(r => r.isSCR);
  if (scrRow) {
    console.log(`[FFF scraper] ✅ ${teamKey} → rank:${scrRow.rank} pts:${scrRow.points} J:${scrRow.joues} G:${scrRow.victoires} N:${scrRow.nuls} P:${scrRow.defaites} (${rows.length} équipes)`);
  } else {
    console.warn(`[FFF scraper] ⚠️  ${teamKey} → ligne ROESCHWOOG introuvable parmi ${rows.length} lignes`);
  }

  return { division, rows };
}

// ── API publique du module ────────────────────────────────────────────────────

/**
 * Retourne le classement FFF pour les 3 équipes SCR.
 * Utilise le cache (TTL 1h) sauf si forceRefresh = true.
 * En cas d'échec du scraping, retourne null pour l'équipe concernée.
 */
async function getClassementFFF({ forceRefresh = false } = {}) {
  const result = {};
  const now    = Date.now();

  await Promise.all(
    Object.keys(TEAM_CONFIGS).map(async (teamKey) => {
      const cached = cache[teamKey];

      if (!forceRefresh && cached && now - cached.ts < CACHE_TTL) {
        result[teamKey] = cached.data;
        return;
      }

      try {
        const data         = await scrapeTeam(teamKey);
        cache[teamKey]     = { data, ts: now };
        result[teamKey]    = data;
      } catch (err) {
        console.error(`[FFF scraper] ❌ ${teamKey} :`, err.message);
        // Retourner le cache expiré plutôt que rien
        result[teamKey] = cached ? cached.data : null;
        if (cached) console.warn(`[FFF scraper] ${teamKey} → cache expiré utilisé en fallback`);
      }
    })
  );

  return result;
}

/** Vide entièrement le cache (forcer un re-scrape au prochain appel). */
function clearCache() {
  Object.keys(cache).forEach(k => delete cache[k]);
  console.log('[FFF scraper] Cache vidé');
}

module.exports = { getClassementFFF, clearCache };
