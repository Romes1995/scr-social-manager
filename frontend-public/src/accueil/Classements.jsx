import { useState } from 'react';
import Visuel from './Visuel';
import useEcranLarge from './useEcranLarge';
import { diffSignee, infoClassement, jourMois, libelleEquipe, lignesAutourScr } from './format';
import { VISUELS } from './visuels';

function Ligne({ l }) {
  return (
    <div role="row" className={`acc-cl-ligne${l.is_scr ? ' acc-cl-scr' : ''}`}>
      <span role="cell" className="acc-cl-rang">{l.rang}</span>
      <span role="cell" className="acc-cl-club" title={l.nom_affiche}>{l.nom_affiche}</span>
      <span role="cell" className="acc-cl-num">{l.joues}</span>
      <span role="cell" className="acc-cl-num">{diffSignee(l.diff)}</span>
      <span role="cell" className="acc-cl-pts">{l.points}</span>
    </div>
  );
}

function Tableau({ equipe, lignes }) {
  return (
    <div role="table" aria-label={`Classement ${libelleEquipe(equipe)}`} className="acc-cl">
      <div role="row" className="acc-cl-entete">
        <span role="columnheader" aria-label="Rang">#</span>
        <span role="columnheader">Club</span>
        <span role="columnheader" aria-label="Matchs joués" className="acc-cl-num">J</span>
        <span role="columnheader" aria-label="Différence de buts" className="acc-cl-num">Diff</span>
        <span role="columnheader" aria-label="Points" className="acc-cl-num">Pts</span>
      </div>
      {lignes.map(l => <Ligne key={`${l.rang}-${l.club}-${l.club_equipe_no}`} l={l} />)}
    </div>
  );
}

// Mobile : onglets par équipe, 6 lignes autour du SCR dépliables
function ClassementsMobile({ classements, equipes }) {
  const [active, setActive] = useState(equipes[0]);
  const [complet, setComplet] = useState(false);

  const c = classements[active];
  const lignes = c?.lignes || [];
  const affichees = complet ? lignes : lignesAutourScr(lignes);

  const choisir = (e) => { setActive(e); setComplet(false); };

  return (
    <>
      {equipes.length > 1 && (
        <div className="acc-onglets" role="group" aria-label="Choisir l'équipe">
          {equipes.map(e => (
            <button key={e} type="button" aria-pressed={e === active}
              className={`acc-onglet${e === active ? ' acc-onglet-actif' : ''}`} onClick={() => choisir(e)}>
              {libelleEquipe(e)}
            </button>
          ))}
        </div>
      )}

      {lignes.length === 0 ? (
        <p className="acc-vide">{c?.message || 'Classement pas encore disponible.'}</p>
      ) : (
        <>
          <p className="acc-cl-info">{infoClassement(c)}</p>
          <Tableau equipe={active} lignes={affichees} />
          {lignes.length > affichees.length || complet ? (
            <button type="button" className="acc-bouton-texte" aria-expanded={complet}
              onClick={() => setComplet(v => !v)}>
              {complet ? 'Réduire' : 'Voir tout le classement'}
            </button>
          ) : null}
          {c.mis_a_jour && <p className="acc-cl-maj">Mis à jour le {jourMois(c.mis_a_jour)}</p>}
        </>
      )}
    </>
  );
}

// Ordinateur : les classements complets côte à côte, sans onglets
function ClassementsLarges({ classements, equipes }) {
  return (
    <div className="acc-cl-colonnes">
      {equipes.map(e => {
        const c = classements[e];
        return (
          <div key={e} className="acc-cl-colonne">
            <h3 className="acc-cl-equipe">{libelleEquipe(e)}</h3>
            {c.lignes.length === 0 ? (
              <p className="acc-vide">{c.message || 'Classement pas encore disponible.'}</p>
            ) : (
              <>
                <p className="acc-cl-info">{infoClassement(c)}</p>
                <Tableau equipe={e} lignes={c.lignes} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Classements({ classements }) {
  const large = useEcranLarge();
  const equipes = Object.keys(classements).sort();

  // Date affichée sur ordinateur : la mise à jour la plus récente des classements
  const majs = equipes.map(e => classements[e].mis_a_jour).filter(Boolean).sort();
  const derniereMaj = majs[majs.length - 1];

  return (
    <section className="acc-section acc-clair" aria-labelledby="acc-titre-classements">
      <div className="acc-col">
        <div className="acc-cl-tete">
          <h2 id="acc-titre-classements" className="acc-titre-images">
            <Visuel v={VISUELS.titreClassements} loading="lazy" />
          </h2>
          {large && derniereMaj && <p className="acc-cl-maj">Mis à jour le {jourMois(derniereMaj)}</p>}
        </div>

        {equipes.length === 0 ? (
          <p className="acc-vide">Classements pas encore disponibles.</p>
        ) : large ? (
          <ClassementsLarges classements={classements} equipes={equipes} />
        ) : (
          <ClassementsMobile classements={classements} equipes={equipes} />
        )}
      </div>
    </section>
  );
}
