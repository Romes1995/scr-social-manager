import { useEffect, useState } from 'react';
import { getAccueil } from '../services/api';
import EnTete from './EnTete';
import ProchainsMatchs from './ProchainsMatchs';
import DerniersResultats from './DerniersResultats';
import Classements from './Classements';
import PiedDePage from './PiedDePage';
import Squelette from './Squelette';
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

  return (
    <div className="acc">
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
            <ProchainsMatchs prochains={data.prochains || []} fenetre={data.fenetre} />
            <DerniersResultats resultats={data.resultats || []} />
            <Classements classements={data.classements || {}} />
          </>
        )}
      </main>
      <PiedDePage />
    </div>
  );
}
