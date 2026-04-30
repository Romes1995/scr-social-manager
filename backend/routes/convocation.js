const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const path    = require('path');
const { generateConvocationVisual } = require('../services/convocationVisualService');

// GET /api/convocation/matches-weekend
// Retourne les 10 prochains matchs à venir. Si aucun, retourne les 5 derniers matchs passés.
router.get('/matches-weekend', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    let result = await pool.query(
      `SELECT id, equipe, adversaire, date, heure, lieu, domicile, logo_adversaire
       FROM matches
       WHERE date >= $1
       ORDER BY date ASC, equipe ASC, heure ASC
       LIMIT 10`,
      [today]
    );

    if (result.rows.length === 0) {
      result = await pool.query(
        `SELECT id, equipe, adversaire, date, heure, lieu, domicile, logo_adversaire
         FROM matches
         WHERE date < $1
         ORDER BY date DESC, equipe ASC
         LIMIT 5`,
        [today]
      );
    }

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/convocation/joueurs/:equipe
// Retourne tous les joueurs triés par nom (la table joueurs n'a pas de champ equipe)
router.get('/joueurs/:equipe', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, prenom, nom, categorie
       FROM joueurs
       ORDER BY nom ASC, prenom ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/convocation/generate
router.post('/generate', async (req, res) => {
  try {
    const { match_id, joueur_ids, rdv_time_away, rdv_time_home, custom_match_time } = req.body;

    if (!match_id || !Array.isArray(joueur_ids) || joueur_ids.length === 0) {
      return res.status(400).json({ error: 'match_id et joueur_ids requis' });
    }

    const matchResult = await pool.query(
      'SELECT * FROM matches WHERE id = $1',
      [match_id]
    );
    if (matchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }
    const match = matchResult.rows[0];

    const joueurResult = await pool.query(
      'SELECT id, prenom, nom FROM joueurs WHERE id = ANY($1)',
      [joueur_ids]
    );
    const joueurMap = {};
    joueurResult.rows.forEach(j => { joueurMap[j.id] = j; });
    const orderedJoueurs = joueur_ids.map(id => joueurMap[id]).filter(Boolean);

    const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    let jourStr = '';
    if (match.date) {
      const d = typeof match.date === 'string' ? match.date.slice(0, 10) : match.date.toISOString().slice(0, 10);
      const [y, m, day] = d.split('-').map(Number);
      jourStr = JOURS[new Date(y, m - 1, day).getDay()];
    }

    let heureMatch = custom_match_time || '';
    if (!heureMatch && match.heure) {
      const [h, mn] = match.heure.split(':').map(Number);
      heureMatch = mn === 0 ? `${h}h` : `${h}h${String(mn).padStart(2, '0')}`;
    }

    const lines = orderedJoueurs.map((j, i) => {
      const initiale = j.nom ? j.nom[0].toUpperCase() + '.' : '';
      return ` ${i + 1}. ${j.prenom} ${initiale}`;
    }).join('\n');

    const text = `Salut à tous,\nmatch contre ${match.adversaire} ${jourStr} à ${heureMatch}. Rdv ${rdv_time_away} là-bas ou ${rdv_time_home} au stade pour :\n${lines}`;

    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/convocation/generate-visual
router.post('/generate-visual', async (req, res) => {
  try {
    const { match_id, joueur_ids, rdv_stade, rdv_la_bas, custom_match_time } = req.body;

    if (!match_id || !Array.isArray(joueur_ids) || joueur_ids.length === 0) {
      return res.status(400).json({ error: 'match_id et joueur_ids requis' });
    }

    // Charger le match
    const { rows: [match] } = await pool.query(
      'SELECT * FROM matches WHERE id = $1',
      [match_id]
    );
    if (!match) return res.status(404).json({ error: 'Match non trouvé' });

    // Charger les joueurs dans l'ordre imposé
    const { rows: joueurRows } = await pool.query(
      'SELECT id, prenom, nom, photo FROM joueurs WHERE id = ANY($1)',
      [joueur_ids]
    );
    const joueurMap = Object.fromEntries(joueurRows.map(j => [j.id, j]));
    const orderedJoueurs = joueur_ids
      .map(id => joueurMap[id])
      .filter(Boolean)
      .map(j => ({
        prenom: j.prenom,
        nom:    j.nom,
        photo:  j.photo || null,
      }));

    // Numéro d'équipe (ex: "SCR 1" → "Equipe 1")
    const teamNum  = String(match.equipe || '').replace(/\D/g, '') || '1';
    const equipeLabel = `Equipe ${teamNum}`;

    // Logo adversaire : priorité au logo local (table clubs), sinon logo_adversaire du match
    // On rejette les URLs CDN externes car le service ne les télécharge plus
    const { rows: clubRows } = await pool.query(
      `SELECT logo_url FROM clubs WHERE LOWER(nom) ILIKE $1 AND logo_url IS NOT NULL LIMIT 1`,
      [`%${(match.adversaire || '').toLowerCase()}%`]
    );
    const localClubLogo = clubRows[0]?.logo_url || null;
    const matchLogo     = match.logo_adversaire;
    const advLogo = localClubLogo
      || (matchLogo && !matchLogo.startsWith('http') ? matchLogo : null);
    console.log(`[convocation] logo adversaire "${match.adversaire}": local=${localClubLogo} match=${matchLogo} → utilisé=${advLogo}`);

    const visualUrl = await generateConvocationVisual({
      matchId:     match_id,
      equipe:      equipeLabel,
      estDomicile: match.domicile !== false,
      adversaire: {
        nom:  match.adversaire,
        logo: advLogo,
      },
      heureMatch: custom_match_time || match.heure || '',
      rdvStade:   rdv_stade   || '',
      rdvLaBas:   rdv_la_bas  || null,
      joueurs:    orderedJoueurs,
    });

    const BASE = `http://localhost:${process.env.PORT || 3001}`;
    res.json({ success: true, url: visualUrl, full_url: BASE + visualUrl });
  } catch (err) {
    console.error('[generate-visual]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
