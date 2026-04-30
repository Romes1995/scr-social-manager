'use strict';
/**
 * Test génération résultats — 3 visuels (1, 2, 3 matchs)
 * node backend/scripts/testGenerateResultat.js
 */

const path = require('path');
const { generateResultat } = require('../services/generateResultat');

const LOGOS = path.join(__dirname, '..', 'uploads', 'logos');
const SCR   = path.join(LOGOS, 'scr.png');
const ADV1  = path.join(LOGOS, 'import_1776512565305_20.png');  // Hoenheim
const ADV2  = path.join(LOGOS, 'import_1776512565380_Schiltigheim_Espagnols__2_.png');
const ADV3  = path.join(LOGOS, 'import_1776512565400_Weitbruch.png');

async function main() {
  console.log('\n═══ TEST 1 MATCH ════════════════════════════════');
  const r1 = await generateResultat({
    matches: [
      {
        logoGauche: SCR,
        nomGauche:  'SCR 1',
        score:      '2 - 1',
        nomDroite:  'HOENHEIM SR',
        logoDroite: ADV1,
        scorers:    'Fuchs F. ⚽ 34\'\nKoch J. ⚽ 67\'',
      },
    ],
  });
  console.log('→', r1);

  console.log('\n═══ TEST 2 MATCHS ═══════════════════════════════');
  const r2 = await generateResultat({
    matches: [
      {
        logoGauche: SCR,
        nomGauche:  'SCR 1',
        score:      '3 - 0',
        nomDroite:  'HOENHEIM SR',
        logoDroite: ADV1,
        scorers:    'Fuchs F. ⚽ 12\' 45\'\nKrieg A. ⚽ 78\'',
      },
      {
        logoGauche: ADV2,
        nomGauche:  'SCHILTIG ESP',
        score:      '1 - 1',
        nomDroite:  'SCR 2',
        logoDroite: SCR,
        scorers:    'Huck M. ⚽ 55\'',
      },
    ],
  });
  console.log('→', r2);

  console.log('\n═══ TEST 3 MATCHS ═══════════════════════════════');
  const r3 = await generateResultat({
    matches: [
      {
        logoGauche: SCR,
        nomGauche:  'SCR 1',
        score:      '2 - 0',
        nomDroite:  'HOENHEIM SR',
        logoDroite: ADV1,
        scorers:    'Fuchs F. ⚽ 34\'',
      },
      {
        logoGauche: ADV2,
        nomGauche:  'SCHILTIG ESP',
        score:      '0 - 2',
        nomDroite:  'SCR 2',
        logoDroite: SCR,
        scorers:    'Kasper H. ⚽ 11\' 89\'',
      },
      {
        logoGauche: SCR,
        nomGauche:  'SCR 3',
        score:      '4 - 1',
        nomDroite:  'WEITBRUCH FC',
        logoDroite: ADV3,
        scorers:    'Haas E. ⚽ 5\' 23\'\nStumpf E. ⚽ 67\'\nMartz D. ⚽ 80\'',
      },
    ],
  });
  console.log('→', r3);

  console.log('\n✅ Tous les tests terminés. Images dans backend/uploads/generated/');
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
