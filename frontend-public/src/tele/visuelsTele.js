/**
 * Visuels de la page télé (public/visuels/web/, générés par npm run visuels).
 * La scène fait 1920 × 1080 px et est mise à l'échelle : `sizes` suit l'échelle
 * pour qu'un écran 4K (échelle 2) prenne les fichiers 2×.
 */
const V = '/visuels/web';

// largeur d'affichage sur la scène, fichiers disponibles [chemin, largeur en px], hauteur d'affichage
export const VISUELS_TELE = {
  logoScrDore:          { largeur: 64,  hauteur: 70,  fichiers: [[`${V}/logo-scr-dore-64px.webp`, 64], [`${V}/logo-scr-dore-128px.webp`, 128]] },
  nomClub:              { largeur: 300, hauteur: 47,  fichiers: [[`${V}/nom-club-300px.webp`, 300], [`${V}/nom-club-600px.webp`, 600]], alt: 'SC Roeschwoog' },
  titreCeWeekEndAuStade:{ largeur: 400, hauteur: 118, fichiers: [[`${V}/titre-ce-week-end-au-stade-330.webp`, 660], [`${V}/titre-ce-week-end-au-stade-520.webp`, 1040]], alt: 'Ce week-end au stade' },
  titreProchainMatch:   { largeur: 400, hauteur: 69,  fichiers: [[`${V}/titre-prochain-match-260.webp`, 520], [`${V}/titre-prochain-match-410.webp`, 820]], alt: 'Prochain match' },
  titreProchainsMatchs: { largeur: 400, hauteur: 64,  fichiers: [[`${V}/titre-prochains-matchs-260.webp`, 520], [`${V}/titre-prochains-matchs-410.webp`, 820]], alt: 'Prochains matchs' },
  titreResultats:       { largeur: 400, hauteur: 50,  fichiers: [[`${V}/titre-resultats-blanc-400px.webp`, 400], [`${V}/titre-resultats-blanc-800px.webp`, 800]], alt: 'Derniers résultats' },
  titreClassements:     { largeur: 300, hauteur: 53,  fichiers: [[`${V}/titre-classements-blanc-300px.webp`, 300], [`${V}/titre-classements-blanc-600px.webp`, 600]], alt: 'Classement' },
  slogan:               { largeur: 600, hauteur: 208, fichiers: [[`${V}/slogan-300.webp`, 600], [`${V}/slogan-380.webp`, 760]], alt: 'Maintenant ça part !!!' },
};

// Issues (29 px de haut sur la scène) : version 48 px de haut
export const ISSUES_TELE = {
  victoire: { src: `${V}/issue-victoire-h24.webp`, largeur: 105, alt: 'Victoire' },
  nul:      { src: `${V}/issue-nul-h24.webp`,      largeur: 112, alt: 'Match nul' },
  defaite:  { src: `${V}/issue-defaite-h24.webp`,  largeur: 95,  alt: 'Défaite' },
};

export const GRAIN_TELE = `${V}/grain-tele.png`;

// Toutes les images fixes de la page, préchargées au démarrage
export const IMAGES_FIXES = [
  ...Object.values(VISUELS_TELE).flatMap(v => v.fichiers.map(([src]) => src)),
  ...Object.values(ISSUES_TELE).map(i => i.src),
  GRAIN_TELE,
];
