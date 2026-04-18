/**
 * Test de génération score live
 * Usage : node scripts/testScoreLive.js
 *
 * Génère une image test avec SCR 3 vs Weitbruch FC 3, score 4-2
 * sans toucher à la base de données.
 */

const path = require('path');

// Charger les variables d'environnement si .env existe
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const { generateScoreLive } = require('../utils/imageGenerator');

const TEST_MATCH = {
  id:         'test',
  equipe:     'SCR 3',
  adversaire: 'Weitbruch FC 3',
  score_scr:  4,
  score_adv:  2,
  domicile:   true,
  buteurs:    ['Dupont', 'Martin', 'Muller', 'Weber'],
};

(async () => {
  console.log('=== TEST GÉNÉRATION SCORE LIVE ===');
  console.log(`Match : ${TEST_MATCH.equipe} ${TEST_MATCH.score_scr} - ${TEST_MATCH.score_adv} ${TEST_MATCH.adversaire}`);
  console.log('');

  try {
    const relPath = await generateScoreLive('test', TEST_MATCH);
    const absPath = path.join(__dirname, '..', relPath.replace(/^\//, ''));
    console.log('');
    console.log('=== RÉSULTAT ===');
    console.log(`Chemin relatif : ${relPath}`);
    console.log(`Chemin absolu  : ${absPath}`);
    console.log('');
    console.log('Ouvrir dans le navigateur :');
    console.log(`  http://localhost:3001${relPath}`);
  } catch (err) {
    console.error('');
    console.error('=== ERREUR ===');
    console.error(err.message);
    console.error(err.stack);
    process.exit(1);
  }

  process.exit(0);
})();
