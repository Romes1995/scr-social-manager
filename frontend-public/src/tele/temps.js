/**
 * Heure de Paris pour la page télé (l'appareil peut être réglé sur un autre fuseau).
 */
const TZ = 'Europe/Paris';

const parties = (date) => Object.fromEntries(
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(p => [p.type, p.value]),
);

// { h: '18', m: '42' }
export function heureParis(date = new Date()) {
  const p = parties(date);
  return { h: p.hour, m: p.minute };
}

// 'YYYY-MM-DD' du jour à Paris
export function isoParis(date = new Date()) {
  const p = parties(date);
  return `${p.year}-${p.month}-${p.day}`;
}

// Délai jusqu'au prochain 4 h 00 à Paris (rechargement nocturne de la page)
export function msJusquAQuatreHeures(date = new Date()) {
  const p = parties(date);
  const ecoule = (Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second)) * 1000 + date.getMilliseconds();
  const cible = 4 * 3600 * 1000;
  const jour = 24 * 3600 * 1000;
  return ((cible - ecoule) % jour + jour) % jour || jour;
}
