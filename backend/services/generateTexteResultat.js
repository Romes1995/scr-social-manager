'use strict';

// Abrège "Prénom Nom" en "P. Nom" ; laisse "CSC" tel quel (pas un nom de joueur)
function shortenName(name) {
  if (name.trim().toUpperCase() === 'CSC') return 'CSC';
  const nameParts = name.trim().split(' ');
  return nameParts[0][0] + '. ' + nameParts.slice(1).join(' ');
}

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

    const hasTab = match.tab_domicile != null && match.tab_exterieur != null;
    const tabScr = hasTab ? (match.domicile ? match.tab_domicile : match.tab_exterieur) : null;
    const tabAdv = hasTab ? (match.domicile ? match.tab_exterieur : match.tab_domicile) : null;

    let resultat;
    if (hasTab) {
      resultat = tabScr > tabAdv
        ? `Qualification aux tirs au but ! SCR s'impose ${tabScr}-${tabAdv} aux tab après un match nul ${scrScore}-${advScore} face à ${adversaire}`
        : `Défaite aux tirs au but (${tabScr}-${tabAdv}) après un match nul ${scrScore}-${advScore} face à ${adversaire}`;
    } else if (scrScore > advScore) {
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
            const short = shortenName(m[1]);
            return count > 1 ? `${short} (x${count})` : short;
          } else {
            return shortenName(line);
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
