import { CLUB } from '../config/club';
import Visuel from './Visuel';
import { VISUELS } from './visuels';

const RESEAUX = [
  { cle: 'facebook',  libelle: 'Facebook' },
  { cle: 'instagram', libelle: 'Instagram' },
].filter(r => CLUB.reseaux[r.cle]);   // lien vide : bouton masqué

export default function PiedDePage() {
  return (
    <footer className="acc-section acc-vert acc-grain acc-pied">
      <div className="acc-col acc-pied-grille">
        <Visuel v={VISUELS.slogan} loading="lazy" className="acc-pied-slogan" />
        <div className="acc-pied-club">
          <Visuel v={VISUELS.logo90Ans} loading="lazy" />
          <address className="acc-pied-adresse">
            {CLUB.nom}<br />{CLUB.stade}<br />{CLUB.adresse}
          </address>
        </div>
        {RESEAUX.length > 0 && (
          <div className="acc-pied-reseaux">
            {RESEAUX.map(r => (
              <a key={r.cle} className="acc-bouton-reseau" href={CLUB.reseaux[r.cle]} target="_blank" rel="noopener">
                {r.libelle}
              </a>
            ))}
          </div>
        )}
      </div>
    </footer>
  );
}
