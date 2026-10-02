import Visuel from './Visuel';
import { VISUELS } from './visuels';

export default function EnTete() {
  return (
    <header className="acc-entete acc-vert acc-grain">
      <div className="acc-col acc-entete-contenu">
        <Visuel v={VISUELS.logoScrDore} fetchPriority="high" />
        <h1 className="acc-entete-nom">
          <Visuel v={VISUELS.nomClub} fetchPriority="high" />
        </h1>
      </div>
    </header>
  );
}
