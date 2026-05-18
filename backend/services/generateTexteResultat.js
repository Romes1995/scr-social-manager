'use strict';

function generateTexteResultat(matches) {
  const lignes = [];
  lignes.push('🔄 Résultats du week-end - SC Roeschwoog 🔄\n');

  matches.forEach((match, i) => {
    const numEquipe = i + 1;
    lignes.push(`🟢 Équipe ${numEquipe}`);

    const [scoreG, scoreD] = match.score.split('-').map(s => parseInt(s.trim()));
    const scrScore = match.domicile ? scoreG : scoreD;
    const advScore = match.domicile ? scoreD : scoreG;
    const adversaire = match.domicile ? match.nomDroite : match.nomGauche;

    let resultat;
    if (scrScore > advScore) {
      resultat = `Victoire ${scrScore}-${advScore} face à ${adversaire}`;
    } else if (scrScore < advScore) {
      resultat = `Défaite ${scrScore}-${advScore} face à ${adversaire}`;
    } else {
      resultat = `Match nul ${scrScore}-${advScore} face à ${adversaire}`;
    }
    lignes.push(resultat);

    if (match.scorers && match.scorers.trim()) {
      const scorersList = match.scorers
        .split(/[\n;]/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(line => {
          const m = line.match(/^(.+?)\s+\[(\d+)\]$/);
          if (m) {
            const count = parseInt(m[2]);
            const nameParts = m[1].trim().split(' ');
            const short = nameParts[0][0] + '. ' + nameParts.slice(1).join(' ');
            return count > 1 ? `${short} (x${count})` : short;
          } else {
            const nameParts = line.trim().split(' ');
            return nameParts[0][0] + '. ' + nameParts.slice(1).join(' ');
          }
        });

      const label = scorersList.length > 1 ? 'Buteurs' : 'Buteur';
      lignes.push(`⚽ ${label} : ${scorersList.join(', ')}`);
    }

    lignes.push('');
  });

  lignes.push('#SCR #SCROESCHWOOG #Résultats #WeekEnd');

  return lignes.join('\n');
}

module.exports = { generateTexteResultat };
