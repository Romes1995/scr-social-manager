/**
 * Chiffre de score sur une palette (tableau d'affichage). `delai` en secondes :
 * la palette se retourne quand `retournee` passe à true.
 */
export default function Palette({ valeur, delai, retournee }) {
  return (
    <span className="acc-palette">
      <span
        className={`acc-palette-chiffre${retournee ? ' acc-palette-visible' : ''}`}
        style={{ '--acc-delai': `${delai}s` }}
      >
        {valeur ?? '–'}
      </span>
    </span>
  );
}
