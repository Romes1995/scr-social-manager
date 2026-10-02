/**
 * Mise en forme des données de GET /api/public/accueil (dates en heure de Paris).
 */

const TZ = 'Europe/Paris';

const majuscule = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// 'YYYY-MM-DD' → Date à midi UTC (évite tout décalage de jour)
const dateIso = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);

const jourDuMois = (d, timeZone) => {
  const n = Number(new Intl.DateTimeFormat('fr-FR', { day: 'numeric', timeZone }).format(d));
  return n === 1 ? '1er' : String(n);
};

// '2026-10-04' → « Dimanche 4 octobre »
export function dateLongue(iso) {
  const d = dateIso(iso);
  const jour = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' }).format(d);
  const mois = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' }).format(d);
  return `${majuscule(jour)} ${jourDuMois(d, 'UTC')} ${mois}`;
}

// '2026-09-27' → « 27 sept. »
export function dateCourte(iso) {
  const d = dateIso(iso);
  const mois = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' }).format(d);
  return `${jourDuMois(d, 'UTC')} ${mois}`;
}

// Horodatage → « 1er octobre » (jour de Paris)
export function jourMois(horodatage) {
  const d = new Date(horodatage);
  const mois = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: TZ }).format(d);
  return `${jourDuMois(d, TZ)} ${mois}`;
}

// '15:00' → { h: '15', m: '00' } ; null si l'heure n'est pas connue
export function decouperHeure(heure) {
  const m = /^(\d{1,2}):(\d{2})/.exec(heure || '');
  return m ? { h: m[1], m: m[2] } : null;
}

const NOMBRES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
export const enLettres = (n) => (n >= 0 && n <= 10 ? NOMBRES[n] : String(n));

/**
 * Nombre de matchs de la fenêtre : « Trois matchs, dont deux à domicile. »
 * (le mobile ajoute « Glissez pour voir chaque équipe. »)
 */
export function phraseMatchs({ matchs, domicile }) {
  let phrase = '';
  if (matchs === 1) {
    phrase = domicile === 1 ? 'Un match, à domicile.' : 'Un match, à l\'extérieur.';
  } else if (matchs > 1) {
    const total = `${majuscule(enLettres(matchs))} matchs`;
    if (domicile === matchs)  phrase = `${total}, tous à domicile.`;
    else if (domicile === 0)  phrase = `${total}, tous à l'extérieur.`;
    else                      phrase = `${total}, dont ${enLettres(domicile)} à domicile.`;
  }
  return phrase;
}

const ajouterJours = (iso, n) => {
  const d = dateIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Libellé d'une fenêtre de matchs hors « ce week-end » :
 *   week-end (vendredi → dimanche) : « Le week-end du 17 et 18 octobre »,
 *     « du 16 au 18 octobre » s'il y a un match le vendredi,
 *     « du 31 octobre et 1er novembre » à cheval sur deux mois ;
 *   jour isolé : « Le mercredi 21 octobre ».
 */
export function libelleFenetre({ debut, fin }, dates = []) {
  if (!debut) return '';
  if (debut === fin) return `Le ${dateLongue(debut).toLowerCase()}`;

  const premier = dates.includes(debut) ? debut : ajouterJours(debut, 1);
  const jour = (iso) => jourDuMois(dateIso(iso), 'UTC');
  const mois = (iso) => new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' }).format(dateIso(iso));
  const lien = premier === debut ? 'au' : 'et';
  return mois(premier) === mois(fin)
    ? `Le week-end du ${jour(premier)} ${lien} ${jour(fin)} ${mois(fin)}`
    : `Le week-end du ${jour(premier)} ${mois(premier)} ${lien} ${jour(fin)} ${mois(fin)}`;
}

// 'SAINT-LOUIS' → 'Saint-Louis'
export const villeCasse = (v) =>
  (v || '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, l) => sep + l.toUpperCase());

// 'SCR 2' → 'Équipe 2'
export const libelleEquipe = (equipe) => `Équipe ${String(equipe).replace(/\D/g, '')}`;

// Différence signée avec un vrai signe moins : +7, −1, 0
export const diffSignee = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

// 'POULE B' → 'poule B'
export function pouleCourte(poule) {
  if (!poule) return null;
  const m = /^poule\s+(.+)$/i.exec(poule.trim());
  return m ? `poule ${m[1]}` : poule.toLowerCase();
}

// « District 1 Alsace, poule B, après 3 journées »
export function infoClassement({ division, poule, journee }) {
  return [
    division,
    pouleCourte(poule),
    journee ? `après ${journee} journée${journee > 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(', ');
}

// Fenêtre de `n` lignes autour de la ligne SCR (2 au-dessus si possible)
export function lignesAutourScr(lignes, n = 6) {
  if (lignes.length <= n) return lignes;
  const i = Math.max(0, lignes.findIndex(l => l.is_scr));
  const debut = Math.min(Math.max(0, i - 2), lignes.length - n);
  return lignes.slice(debut, debut + n);
}
