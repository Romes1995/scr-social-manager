import { useEffect, useState } from 'react';
import { getAccueil } from '../services/api';
import EnTete from './EnTete';
import PhotoEntete from './PhotoEntete';
import ProchainsMatchs from './ProchainsMatchs';
import DerniersResultats from './DerniersResultats';
import Classements from './Classements';
import PiedDePage from './PiedDePage';
import Squelette from './Squelette';
import { logoPastille } from './visuels';
import './Accueil.css';

/**
 * Page d'accueil de la vitrine : une seule requête, GET /api/public/accueil.
 */
export default function Accueil() {
  const [etat, setEtat] = useState({ statut: 'chargement', data: null });

  useEffect(() => {
    let actif = true;
    getAccueil()
      .then(({ data }) => { if (actif) setEtat({ statut: 'ok', data }); })
      .catch(() => { if (actif) setEtat({ statut: 'erreur', data: null }); });
    return () => { actif = false; };
  }, []);

  const { statut, data } = etat;
  // Logo SCR des pastilles : celui enregistré dans l'admin (miniature servie par l'API)
  const logoScr = data ? logoPastille({ mini: data.club?.logo_mini, logo: data.club?.logo }) : null;

  return (
    <div className="acc">
      <PhotoEntete />
      <EnTete />
      <main>
        {statut === 'chargement' && <Squelette />}
        {statut === 'erreur' && (
          <section className="acc-section acc-vert acc-grain acc-erreur" role="alert">
            <div className="acc-col">
              <p>Les infos du club sont momentanément indisponibles.</p>
            </div>
          </section>
        )}
        {statut === 'ok' && (
          <>
            <ProchainsMatchs prochains={data.prochains || []} fenetre={data.fenetre} logoScr={logoScr} />
            <DerniersResultats resultats={data.resultats || []} logoScr={logoScr} />
            <Classements classements={data.classements || {}} />
          </>
        )}
      </main>
      <PiedDePage />
    </div>
  );
}
