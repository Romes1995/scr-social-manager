// Chargement : silhouettes des billets et des résultats, sans texte
export default function Squelette() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="acc-sr">Chargement des infos du club…</span>
      <section className="acc-section acc-vert acc-grain acc-prochains" aria-hidden="true">
        <div className="acc-col">
          <span className="acc-sq acc-sq-titre" />
          <span className="acc-sq acc-sq-ligne" />
        </div>
        <div className="acc-billets acc-billets-squelette">
          <span className="acc-sq acc-sq-billet" />
          <span className="acc-sq acc-sq-billet" />
        </div>
      </section>
      <section className="acc-section acc-blanc" aria-hidden="true">
        <div className="acc-col">
          <span className="acc-sq acc-sq-titre acc-sq-sombre" />
          <span className="acc-sq acc-sq-panneau" />
        </div>
      </section>
    </div>
  );
}
