import { LARGE, VISUELS } from './visuels';

/**
 * Photo d'équipe en fond du haut de page (derrière l'en-tête et le titre des
 * prochains matchs). Décorative : alt vide. Image du premier écran : pas de lazy.
 * Voiles (aplat multiply, dégradé vers le vert anglais) : .acc-photo::before / ::after.
 */
export default function PhotoEntete() {
  const { mobile, bureau } = VISUELS.photoEntete;
  return (
    <div className="acc-photo" aria-hidden="true">
      <picture>
        <source media={LARGE} srcSet={bureau.srcSet} sizes="100vw" width={bureau.width} height={bureau.height} />
        <img src={mobile.src} srcSet={mobile.srcSet} sizes="100vw" width={mobile.width} height={mobile.height}
          alt="" fetchPriority="high" />
      </picture>
    </div>
  );
}
