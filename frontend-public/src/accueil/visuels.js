/**
 * Visuels optimisés de l'accueil (public/visuels/web/, générés par npm run visuels).
 * Pour chacun, une version mobile et une version ordinateur (≥ 1024 px), en taille
 * d'affichage : width / height réservent la place avant le chargement.
 */
const V = '/visuels/web';
const img = (fichier, width, height) => ({ src: `${V}/${fichier}.webp`, width, height });

export const LARGE = '(min-width: 1024px)';

export const VISUELS = {
  logoScrDore:          { alt: '',                          mobile: img('logo-scr-dore-42', 42, 46),               bureau: img('logo-scr-dore-50', 50, 55) },
  nomClub:              { alt: 'SC Roeschwoog',             mobile: img('nom-club-200', 200, 31),                  bureau: img('nom-club-230', 230, 36) },
  titreCeWeekEndAuStade:{ alt: 'Ce week-end au stade',      mobile: img('titre-ce-week-end-au-stade-330', 330, 98), bureau: img('titre-ce-week-end-au-stade-520', 520, 154) },
  titreProchainMatch:   { alt: 'Prochain match',            mobile: img('titre-prochain-match-260', 260, 45),      bureau: img('titre-prochain-match-410', 410, 71) },
  titreProchainsMatchs: { alt: 'Prochains matchs',          mobile: img('titre-prochains-matchs-260', 260, 42),    bureau: img('titre-prochains-matchs-410', 410, 66) },
  titreResultats:       { alt: 'Derniers résultats',        mobile: img('titre-resultats-310', 310, 39),           bureau: img('titre-resultats-420', 420, 53) },
  titreClassements:     { alt: 'Classements',               mobile: img('titre-classements-225', 225, 40),         bureau: img('titre-classements-310', 310, 55) },
  slogan:               { alt: 'Maintenant ça part !!!',    mobile: img('slogan-300', 300, 104),                   bureau: img('slogan-380', 380, 132) },
  logo90Ans:            { alt: '90 ans du SC Roeschwoog, 1937-2027', mobile: img('logo-90-ans-dore-150', 150, 91), bureau: img('logo-90-ans-dore-190', 190, 116) },
  issue: {
    victoire: { alt: 'Victoire',  mobile: img('issue-victoire-h22', 80, 22), bureau: img('issue-victoire-h24', 87, 24) },
    nul:      { alt: 'Match nul', mobile: img('issue-nul-h22', 86, 22),      bureau: img('issue-nul-h24', 93, 24) },
    defaite:  { alt: 'Défaite',   mobile: img('issue-defaite-h22', 72, 22),  bureau: img('issue-defaite-h24', 79, 24) },
  },
};
