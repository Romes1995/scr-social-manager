import IssueLabel from './IssueLabel';
import Palette from './Palette';
import Pastille from './Pastille';
import useApparition from './useApparition';
import Visuel from './Visuel';
import { dateCourte, libelleEquipe } from './format';
import { VISUELS, logoPastille } from './visuels';

// Délais d'animation (s) : 0,25 s + 0,3 s par ligne, seconde palette 0,15 s après
const delai = (ligne, palette) => 0.25 + 0.3 * ligne + 0.15 * palette;

function Resultat({ r, index, retournee, logoScr }) {
  const scrDomicile = r.domicile;
  const aTab = r.tab_domicile != null && r.tab_exterieur != null;
  const score = `${r.equipe_domicile} ${r.score_domicile}, ${r.equipe_exterieur} ${r.score_exterieur}`;
  const logoAdv = logoPastille({ mini: r.logo_adversaire_mini, logo: r.logo_adversaire });
  const nom = (texte, scr) => (
    <span className={`acc-resultat-nom${scr ? ' acc-scr' : ''}`}>
      <Pastille src={scr ? logoScr : logoAdv} taille={22} />
      <span className="acc-resultat-nom-texte">{texte}</span>
    </span>
  );

  return (
    <li className="acc-resultat" aria-label={`${libelleEquipe(r.equipe)}, ${dateCourte(r.date)} : ${score}`}>
      <div className="acc-resultat-haut">
        <div>
          <p className="acc-resultat-equipe">{libelleEquipe(r.equipe)}, {dateCourte(r.date)}</p>
          <p className="acc-resultat-compet">{r.competition_court || r.competition}</p>
        </div>
        <IssueLabel issue={r.issue} />
      </div>
      <div className="acc-resultat-score" aria-hidden="true">
        {nom(r.equipe_domicile, scrDomicile)}
        <Palette valeur={r.score_domicile} delai={delai(index, 0)} retournee={retournee} />
        {nom(r.equipe_exterieur, !scrDomicile)}
        <Palette valeur={r.score_exterieur} delai={delai(index, 1)} retournee={retournee} />
      </div>
      {aTab && <p className="acc-resultat-tab">Tirs au but : {r.tab_domicile}-{r.tab_exterieur}</p>}
    </li>
  );
}

export default function DerniersResultats({ resultats, logoScr }) {
  const [ref, visible] = useApparition();

  return (
    <section className="acc-section acc-blanc" aria-labelledby="acc-titre-resultats">
      <div className="acc-col">
        <h2 id="acc-titre-resultats" className="acc-titre-images">
          <Visuel v={VISUELS.titreResultats} loading="lazy" />
        </h2>
        {resultats.length === 0 ? (
          <p className="acc-vide">Aucun résultat officiel pour l'instant.</p>
        ) : (
          <ul ref={ref} className="acc-panneau acc-vert acc-grain">
            {resultats.map((r, i) => (
              <Resultat key={`${r.equipe}-${r.date}`} r={r} index={i} retournee={visible} logoScr={logoScr} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
