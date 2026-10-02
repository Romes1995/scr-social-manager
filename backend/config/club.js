/**
 * Identité du club, utilisée par les réponses publiques (services/accueilPublic.js).
 *
 *   nom   nom affiché du club ; les équipes réserves prennent un suffixe (« SC Roeschwoog 2 »)
 *   logo     chemin du logo SCR servi par le backend (enregistré par POST /api/clubs/scr-logo)
 *   equipes  équipes seniors suivies (page télé : un écran par équipe, même sans données)
 */
module.exports = {
  nom:  'SC Roeschwoog',
  logo: '/uploads/logos/scr.png',
  equipes: ['SCR 1', 'SCR 2', 'SCR 3'],
};
