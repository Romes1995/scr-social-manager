import { useLayoutEffect, useRef, useState } from 'react';
import { dateLongue, decouperHeure, libelleEquipe, villeCasse } from './format';

const COULEUR_EQUIPE = { 'SCR 1': '#3dff6e', 'SCR 2': '#5500ff', 'SCR 3': '#00bf63' };

const TAILLE_NOM = 30;      // px
const TAILLE_NOM_MIN = 22;  // px : en dessous, le nom est coupé (…)

/**
 * Nom d'équipe sur une ligne : nom complet, sinon nom court s'il déborde,
 * sinon police réduite jusqu'à 22 px. Mesuré une fois les polices chargées.
 * Le composant est remonté (key) quand le nom change.
 */
function NomEquipe({ complet, court }) {
  const ref = useRef(null);
  const [rendu, setRendu] = useState({ texte: complet, taille: TAILLE_NOM });

  useLayoutEffect(() => {
    let actif = true;
    const ajuster = () => {
      const el = ref.current;
      if (!actif || !el) return;
      // Largeur du texte à 30 px, mesurée avec la police réelle de l'élément
      const style = getComputedStyle(el);
      const ctx = document.createElement('canvas').getContext('2d');
      const largeur = (texte) => {
        ctx.font = `${style.fontWeight} ${TAILLE_NOM}px ${style.fontFamily}`;
        return ctx.measureText(texte).width;
      };
      const dispo = el.clientWidth;
      if (largeur(complet) <= dispo) return;
      const texte = court || complet;
      const taille = Math.max(TAILLE_NOM_MIN, Math.min(TAILLE_NOM, Math.floor(TAILLE_NOM * dispo / largeur(texte))));
      setRendu({ texte, taille });
    };
    (document.fonts?.ready ?? Promise.resolve()).then(ajuster);
    return () => { actif = false; };
  }, [complet, court]);

  return (
    <span ref={ref} className="acc-billet-nom" style={{ fontSize: rendu.taille }} title={complet}>
      {rendu.texte}
    </span>
  );
}

function PictoMaison() {
  return (
    <svg className="acc-picto" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z" fill="currentColor" />
    </svg>
  );
}

function PictoAvion() {
  return (
    <svg className="acc-picto" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 15.5v-2l-8-5V3.8a1.5 1.5 0 0 0-3 0v4.7l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-5z" fill="currentColor" />
    </svg>
  );
}

export default function Billet({ match }) {
  const heure   = decouperHeure(match.heure);
  const coupe   = match.competition_type === 'CP';
  const ville   = villeCasse(match.terrain?.ville);
  const domicile = match.domicile;

  const lieu = domicile ? 'À domicile, voir le stade' : `${ville || 'Lieu du match'}, itinéraire`;
  const resume = `${libelleEquipe(match.equipe)} : ${match.equipe_domicile} reçoit ${match.equipe_exterieur}, ` +
    `${dateLongue(match.date)}${match.reporte ? ', match reporté' : heure ? ` à ${heure.h} h ${heure.m}` : ''}`;

  return (
    <article className="acc-billet" aria-label={resume}>
      <div className="acc-billet-corps">
        <p className="acc-billet-compet">
          {libelleEquipe(match.equipe)}, {match.competition_court || match.competition}
        </p>
        <p className="acc-billet-date">{dateLongue(match.date)}</p>
        <div className="acc-billet-affiche">
          <NomEquipe key={`d-${match.equipe_domicile}`} complet={match.equipe_domicile} court={match.equipe_domicile_court} />
          <span className="acc-billet-recoit">reçoit</span>
          <NomEquipe key={`e-${match.equipe_exterieur}`} complet={match.equipe_exterieur} court={match.equipe_exterieur_court} />
        </div>
        <div className="acc-billet-lieu">
          {domicile ? <PictoMaison /> : <PictoAvion />}
          {match.lien_itineraire ? (
            <a href={match.lien_itineraire} target="_blank" rel="noopener">{lieu}</a>
          ) : (
            <span>{domicile ? 'À domicile' : ville || 'Lieu à confirmer'}</span>
          )}
        </div>
      </div>

      <div className="acc-billet-talon" aria-hidden="true">
        <span className="acc-billet-bandeau" style={{ background: COULEUR_EQUIPE[match.equipe] || 'var(--acc-dore)' }} />
        {match.reporte ? (
          <span className="acc-billet-reporte">Reporté</span>
        ) : heure ? (
          <span className="acc-billet-heure">
            <span className="acc-billet-h">{heure.h}</span>
            <span className="acc-billet-m">h {heure.m}</span>
          </span>
        ) : (
          <span className="acc-billet-reporte">Heure à venir</span>
        )}
        <span className="acc-billet-journee">{coupe ? 'Coupe' : match.journee ? `J${match.journee}` : ''}</span>
      </div>
    </article>
  );
}
