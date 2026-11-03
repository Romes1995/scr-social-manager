/**
 * Enregistre les réponses réelles de l'API FFF (DOFA) pour le test Docker de la CI
 * (.github/workflows/vitrine-docker.yml) : les serveurs GitHub sont bloqués par la FFF
 * (HTTP 403), la CI rejoue donc ces réponses avec deploy/docker-compose.ci.yml.
 *
 *   node scripts/enregistrer-dofa-ci.js      (depuis backend/, sur une machine non bloquée)
 *
 * Les données de personnes (match_membres, membres, contacts) sont retirées.
 *
 * Enregistre, dans deploy/ci/dofa/ (remplacé en entier) :
 *   api/clubs/2131/matchs/page-<n>.json      matchs SCR, toutes les pages
 *   api/compets/…/classement_journees.json   classements des poules de championnat
 *   api/clubs/<cl_no>.json                    fiches des clubs de classement sans logo connu
 *   phlogos/<fichier>                         logos des clubs (URL réécrites vers dofa-mock)
 *
 * À relancer à chaque nouvelle saison (sinon la CI ne trouve plus de poule en cours).
 */
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');
const {
  DOFA_BASE, DOFA_HEADERS, SCR_CL_NO, getWithRetry, sleep, parseMatch,
} = require('../services/fffImport');

const SORTIE   = path.join(__dirname, '..', '..', 'deploy', 'ci', 'dofa');
const CDN      = /https:\/\/cdn-transverse\.azureedge\.net\/phlogos\//g;
const MOCK     = 'http://dofa-mock/phlogos/';

const logos = new Set();

// Données de personnes (arbitres, dirigeants) : inutiles à l'import, jamais publiées dans le dépôt
const PERSONNES = new Set(['match_membres', 'membres', 'contacts']);
const sansPersonnes = (o) => (Array.isArray(o) ? o.map(sansPersonnes)
  : o && typeof o === 'object'
    ? Object.fromEntries(Object.entries(o).filter(([k]) => !PERSONNES.has(k)).map(([k, v]) => [k, sansPersonnes(v)]))
    : o);

function ecrire(relatif, donnees) {
  const f = path.join(SORTIE, relatif);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  if (Buffer.isBuffer(donnees)) {
    fs.writeFileSync(f, donnees);
    return;
  }
  // Logos réécrits vers le serveur de la CI, mémorisés pour être téléchargés
  const json = JSON.stringify(sansPersonnes(donnees), null, 1);
  for (const m of json.matchAll(/https:\/\/cdn-transverse\.azureedge\.net\/phlogos\/([^"]+)/g)) logos.add(m[1]);
  fs.writeFileSync(f, json.replace(CDN, MOCK));
}

const get = async (url) => (await getWithRetry(url, { timeout: 15000, headers: DOFA_HEADERS })).data;

async function main() {
  fs.rmSync(SORTIE, { recursive: true, force: true });

  // 1. Matchs SCR, page par page (les liens hydra:next sont des chemins relatifs)
  const bruts = [];
  let page = 1;
  let chemin = `/api/clubs/${SCR_CL_NO}/matchs?page=1`;
  while (chemin) {
    const data = await get(`${DOFA_BASE}${chemin}`);
    const p = parseInt(new URL(chemin, DOFA_BASE).searchParams.get('page'), 10) || page;
    ecrire(`api/clubs/${SCR_CL_NO}/matchs/page-${p}.json`, data);
    bruts.push(...(data['hydra:member'] || []));
    chemin = data['hydra:view']?.['hydra:next'] || null;
    page += 1;
    if (chemin) await sleep(1000);
  }
  console.log(`Matchs : ${bruts.length} sur ${page - 1} page(s)`);

  // 2. Classements des poules de championnat
  const poules = new Map();
  for (const raw of bruts) {
    const m = parseMatch(raw);
    if (m?.competition_type === 'CH' && m.fff_cp_no && m.fff_phase_no && m.fff_poule_no) {
      poules.set(`${m.fff_cp_no}/phases/${m.fff_phase_no}/poules/${m.fff_poule_no}`, true);
    }
  }
  const clubsAvecLogo = new Set(bruts.flatMap(r => [r.home?.club, r.away?.club])
    .filter(c => c?.logo).map(c => c.cl_no));
  const sansLogo = new Set();
  for (const p of poules.keys()) {
    await sleep(1000);
    const data = await get(`${DOFA_BASE}/api/compets/${p}/classement_journees`);
    ecrire(`api/compets/${p}/classement_journees.json`, data);
    for (const x of data['hydra:member'] || []) {
      const clNo = x.equipe?.club?.cl_no;
      if (clNo && !clubsAvecLogo.has(clNo)) sansLogo.add(clNo);
    }
  }
  console.log(`Classements : ${poules.size} poule(s)`);

  // 3. Fiches des clubs de classement sans logo dans les matchs (services/logosFff.js)
  for (const clNo of sansLogo) {
    await sleep(500);
    ecrire(`api/clubs/${clNo}.json`, await get(`${DOFA_BASE}/api/clubs/${clNo}`));
  }
  console.log(`Fiches clubs : ${sansLogo.size}`);

  // 4. Logos
  for (const fichier of logos) {
    const r = await axios.get(`https://cdn-transverse.azureedge.net/phlogos/${fichier}`, {
      responseType: 'arraybuffer', timeout: 15000, headers: { 'User-Agent': DOFA_HEADERS['User-Agent'] },
    });
    ecrire(`phlogos/${fichier}`, Buffer.from(r.data));
  }
  console.log(`Logos : ${logos.size} → ${path.relative(process.cwd(), SORTIE)}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('❌', err.response?.status ? `HTTP ${err.response.status}` : err.message);
  process.exit(1);
});
