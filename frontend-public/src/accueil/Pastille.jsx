import { useState } from 'react';
/**
 * Logo de club dans une pastille ronde blanche (padding 2 px). Sans logo, ou si
 * l'image ne charge pas : pastille vide #EDF1EC de même taille (alignement gardé).
 * alt vide : le nom du club est écrit à côté.
 */
export default function Pastille({ src, taille, bordure = false, lazy = true }) {
  const [echec, setEchec] = useState(false);
  const vide = !src || echec;
  return (
    <span
      className={`acc-pastille${bordure ? ' acc-pastille-bord' : ''}${vide ? ' acc-pastille-vide' : ''}`}
      style={{ width: taille, height: taille }}
    >
      {!vide && (
        <img src={src} width={taille - 4} height={taille - 4} alt=""
          loading={lazy ? 'lazy' : undefined} decoding="async" onError={() => setEchec(true)} />
      )}
    </span>
  );
}
