import Billet from './Billet';
import Visuel from './Visuel';
import useEcranLarge from './useEcranLarge';
import { libelleFenetre, phraseMatchs } from './format';
import { VISUELS } from './visuels';

/**
 * Prochains matchs de la fenêtre renvoyée par l'API (week-end ou jour isolé).
 * Titre : « Ce week-end au stade » pour le week-end qui vient ; sinon « Prochain
 * match » (un billet) ou « Prochains matchs » (plusieurs, ou aucun), avec la date.
 */
export default function ProchainsMatchs({ prochains, fenetre }) {
  const large = useEcranLarge();
  const ceWeekEnd = Boolean(fenetre?.est_ce_week_end) && prochains.length > 0;

  const titre = ceWeekEnd ? VISUELS.titreCeWeekEndAuStade
    : prochains.length === 1 ? VISUELS.titreProchainMatch
    : VISUELS.titreProchainsMatchs;

  const quand = !ceWeekEnd && prochains.length > 0 ? libelleFenetre(fenetre, prochains.map(m => m.date)) : '';
  // Sur ordinateur, les billets sont tous visibles : pas d'invitation à glisser
  const glisser = !large && prochains.length > 1 ? 'Glissez pour voir chaque équipe.' : '';
  const phrase = [prochains.length > 0 ? phraseMatchs(fenetre) : '', glisser].filter(Boolean).join(' ');

  return (
    <section className="acc-section acc-vert acc-grain acc-prochains" aria-labelledby="acc-titre-prochains">
      <span className="acc-ligne-mediane" aria-hidden="true" />
      <div className="acc-col acc-prochains-tete">
        <h2 id="acc-titre-prochains" className="acc-titre-images">
          <Visuel v={titre} fetchPriority="high" />
        </h2>

        {prochains.length === 0 ? (
          <p className="acc-vide acc-vide-clair">Pas de match programmé pour le moment.</p>
        ) : (
          <p className="acc-sous-titre">
            {quand && <><span className="acc-sous-titre-quand">{quand}</span>{' '}</>}
            {phrase}
          </p>
        )}
      </div>

      {prochains.length > 0 && (
        <div className="acc-terrain">
          <span className="acc-rond-central" aria-hidden="true" />
          <div className="acc-billets" role="region" aria-label="Billets des prochains matchs" tabIndex={0}>
            {prochains.map(m => <Billet key={`${m.equipe}-${m.date}-${m.heure}`} match={m} />)}
          </div>
        </div>
      )}
    </section>
  );
}
