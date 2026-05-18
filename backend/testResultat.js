'use strict';

const path = require('path');
const { generateResultat } = require('./services/generateResultat');

const LOGOS = path.join(__dirname, 'uploads', 'logos');

generateResultat({
  matches: [
    {
      nomGauche:  'SCR 1',
      nomDroite:  'FC MULHOUSE',
      score:      '3-0',
      logoGauche: path.join(LOGOS, 'club_1.png'),
      logoDroite: path.join(LOGOS, 'club_2.png'),
      domicile:   true,
      scorers:    'Nicolas MARTIRADONNA [2]\nGregory SCHNEIDER',
    },
    {
      nomGauche:  'ROPPENHEIM SC',
      nomDroite:  'SCR 2',
      score:      '1-4',
      logoGauche: path.join(LOGOS, 'club_11.png'),
      logoDroite: path.join(LOGOS, 'club_1.png'),
      domicile:   false,
      scorers:    'Kenny DEBURE [3]\nTom KASPER',
    },
    {
      nomGauche:  'SCR 3',
      nomDroite:  'HATTEN AS',
      score:      '1-2',
      logoGauche: path.join(LOGOS, 'club_1.png'),
      logoDroite: path.join(LOGOS, 'club_12.png'),
      domicile:   true,
      scorers:    'Stephan KRAUSE',
    },
  ],
})
  .then(url => console.log('Image générée :', url))
  .catch(err => console.error('ERREUR :', err));
