/**
 * Teste l'accès de ce serveur à l'API FFF (DOFA) et aux logos des clubs.
 *
 *   docker compose exec backend node scripts/tester-fff.js     (déploiement deploy/)
 *   node scripts/tester-fff.js                                  (backend/)
 *
 * Code de sortie : 0 accès OK, 2 serveur bloqué par la FFF (HTTP 403), 1 autre erreur.
 * Même requête et mêmes en-têtes que l'import (services/fffImport.js) : un curl
 * peut être refusé alors que l'import passe, et inversement.
 */
const axios = require('axios');
const { DOFA_BASE, DOFA_HEADERS, SCR_CL_NO } = require('../services/fffImport');

const BLOQUE = 'Serveur bloqué par la FFF (HTTP 403) : l\'import automatique ne peut pas fonctionner '
             + 'depuis ce serveur. Voir Romaric.';

async function main() {
  console.log(`Test de l'API FFF : ${DOFA_BASE}`);
  let resp;
  try {
    resp = await axios.get(`${DOFA_BASE}/api/clubs/${SCR_CL_NO}/matchs?page=1`, { timeout: 15000, headers: DOFA_HEADERS });
  } catch (err) {
    const status = err.response?.status;
    if (status === 403) {
      console.error(`❌ ${BLOQUE}`);
      return 2;
    }
    console.error(`❌ API FFF injoignable : ${status ? `HTTP ${status}` : err.code || err.message}. `
                + 'Vérifier l\'accès Internet du serveur, puis réessayer plus tard.');
    return 1;
  }

  const matchs = resp.data?.['hydra:member'] || [];
  console.log(`✅ API FFF joignable : ${matchs.length} match(s) sur la première page.`);

  const logo = matchs.flatMap(m => [m.home?.club?.logo, m.away?.club?.logo]).find(Boolean);
  if (!logo) {
    console.log('ℹ️  Aucun logo à tester dans cette réponse.');
    return 0;
  }
  try {
    const r = await axios.get(logo, { timeout: 15000, responseType: 'arraybuffer', headers: { 'User-Agent': DOFA_HEADERS['User-Agent'] } });
    console.log(`✅ Logos des clubs accessibles (${r.headers['content-type']}, ${r.data.length} octets).`);
    return 0;
  } catch (err) {
    const status = err.response?.status;
    console.error(`❌ Logos des clubs inaccessibles (${status ? `HTTP ${status}` : err.code || err.message}) : `
                + (status === 403 ? BLOQUE : 'les pastilles resteront vides.'));
    return status === 403 ? 2 : 1;
  }
}

main().then(code => process.exit(code));
