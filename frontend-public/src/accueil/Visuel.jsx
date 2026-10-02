import { LARGE } from './visuels';

/**
 * Image en deux versions : le mobile ne télécharge jamais la version ordinateur
 * (<source media>), et inversement. La taille affichée suit les attributs
 * width / height de la version retenue (CSS : .acc-visuel).
 */
export default function Visuel({ v, className = '', alt = v.alt, ...props }) {
  return (
    <picture className={`acc-visuel ${className}`}>
      <source media={LARGE} srcSet={v.bureau.src} width={v.bureau.width} height={v.bureau.height} />
      <img src={v.mobile.src} width={v.mobile.width} height={v.mobile.height} alt={alt} decoding="async" {...props} />
    </picture>
  );
}
