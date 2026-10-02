/**
 * Chiffre de score sur une palette noire (tableau d'affichage à volets), avec
 * charnière et attaches. `delai` en secondes : le volet se retourne quand
 * `retournee` passe à true.
 */
export default function Palette({ valeur, delai, retournee }) {
  return (
    <span className="acc-palette">
      <span className="acc-palette-volet">
        <span
          className={`acc-palette-chiffre${retournee ? ' acc-palette-visible' : ''}`}
          style={{ '--acc-delai': `${delai}s` }}
        >
          {valeur ?? '–'}
        </span>
      </span>
      <span className="acc-palette-charniere" aria-hidden="true" />
      <span className="acc-palette-attache acc-palette-attache-g" aria-hidden="true" />
      <span className="acc-palette-attache acc-palette-attache-d" aria-hidden="true" />
    </span>
  );
}
