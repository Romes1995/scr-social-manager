const express = require('express');
const router = express.Router();
const pool = require('../db');
const { ensureAdversaireClub } = require('../utils/ensureClub');

// GET /api/matches - Liste tous les matchs
router.get('/', async (req, res) => {
  try {
    const { statut, equipe } = req.query;
    let query = 'SELECT * FROM matches';
    const params = [];
    const conditions = [];

    if (statut) {
      params.push(statut);
      conditions.push(`statut = $${params.length}`);
    }
    if (equipe) {
      params.push(equipe);
      conditions.push(`equipe = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY date ASC, heure ASC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/matches/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM matches WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/matches - Créer un match
router.post('/', async (req, res) => {
  try {
    const {
      equipe, adversaire, logo_adversaire, date, heure,
      lieu, domicile, division, statut
    } = req.body;

    if (!equipe || !adversaire) {
      return res.status(400).json({ error: 'equipe et adversaire sont requis' });
    }

    // Déduplication : même équipe + même adversaire + même date
    if (date) {
      const dup = await pool.query(
        `SELECT id FROM matches WHERE LOWER(equipe)=LOWER($1) AND LOWER(adversaire)=LOWER($2) AND date=$3`,
        [equipe, adversaire, date]
      );
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: 'Match déjà existant (même équipe, adversaire et date)', duplicate_id: dup.rows[0].id });
      }
    }

    const result = await pool.query(
      `INSERT INTO matches (equipe, adversaire, logo_adversaire, date, heure, lieu, domicile, division, statut)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [equipe, adversaire, logo_adversaire || null, date || null, heure || null,
       lieu || null, domicile !== false, division || null, statut || 'programme']
    );

    const match = result.rows[0];

    // Auto-créer le club adversaire en arrière-plan (non-bloquant)
    ensureAdversaireClub(match.adversaire);

    // Si statut programme, créer une publication programmée à 00h01 le jour du match
    if (match.statut === 'programme' && match.date) {
      const pubDate = new Date(match.date);
      pubDate.setHours(0, 1, 0, 0);
      await pool.query(
        `INSERT INTO publications_programmees (match_id, type, heure_publication, statut)
         VALUES ($1, 'matchday', $2, 'en_attente')`,
        [match.id, pubDate]
      );
    }

    res.status(201).json(match);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/matches/:id - Modifier un match
router.put('/:id', async (req, res) => {
  try {
    const {
      equipe, adversaire, logo_adversaire, date, heure,
      lieu, domicile, division, statut
    } = req.body;

    const result = await pool.query(
      `UPDATE matches
       SET equipe=$1, adversaire=$2, logo_adversaire=$3, date=$4, heure=$5,
           lieu=$6, domicile=$7, division=$8, statut=$9, updated_at=NOW()
       WHERE id=$10
       RETURNING *`,
      [equipe, adversaire, logo_adversaire || null, date || null, heure || null,
       lieu || null, domicile !== false, division || null, statut || 'programme', req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }

    // Auto-créer le club adversaire en arrière-plan (non-bloquant)
    ensureAdversaireClub(result.rows[0].adversaire);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/matches/:id/score - Mise à jour score live
router.patch('/:id/score', async (req, res) => {
  try {
    const { score_scr, score_adv, buteurs, action } = req.body;
    const matchId = req.params.id;

    // Vérifier que le match existe et n'est pas terminé
    const existing = await pool.query('SELECT * FROM matches WHERE id = $1', [matchId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }

    const match = existing.rows[0];
    if (match.statut === 'termine') {
      return res.status(400).json({ error: 'Match terminé, score verrouillé' });
    }

    // Calculer les nouvelles valeurs
    let newScoreScr = match.score_scr;
    let newScoreAdv = match.score_adv;
    let newButeurs = match.buteurs || [];

    if (action === 'increment_scr') newScoreScr = Math.max(0, newScoreScr + 1);
    else if (action === 'decrement_scr') newScoreScr = Math.max(0, newScoreScr - 1);
    else if (action === 'increment_adv') newScoreAdv = Math.max(0, newScoreAdv + 1);
    else if (action === 'decrement_adv') newScoreAdv = Math.max(0, newScoreAdv - 1);
    else if (action === 'goal_scr' && req.body.buteur) {
      // But SCR : incrémente le score + ajoute le buteur en une seule requête
      newScoreScr = Math.max(0, newScoreScr + 1);
      newButeurs  = [...newButeurs, req.body.buteur];
    } else if (action === 'add_buteur' && req.body.buteur) {
      newButeurs = [...newButeurs, req.body.buteur];
    } else if (action === 'remove_buteur' && req.body.buteur) {
      const idx = newButeurs.lastIndexOf(req.body.buteur);
      if (idx !== -1) newButeurs = [...newButeurs.slice(0, idx), ...newButeurs.slice(idx + 1)];
    } else {
      // Mise à jour directe
      if (score_scr !== undefined) newScoreScr = Math.max(0, parseInt(score_scr));
      if (score_adv !== undefined) newScoreAdv = Math.max(0, parseInt(score_adv));
      if (buteurs !== undefined) newButeurs = buteurs;
    }

    const result = await pool.query(
      `UPDATE matches
       SET score_scr=$1, score_adv=$2, buteurs=$3, statut='en_cours', updated_at=NOW()
       WHERE id=$4
       RETURNING *`,
      [newScoreScr, newScoreAdv, newButeurs, matchId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/matches/:id/fin - Terminer un match
router.post('/:id/fin', async (req, res) => {
  try {
    const matchId = req.params.id;
    const result = await pool.query(
      `UPDATE matches
       SET statut='termine', updated_at=NOW()
       WHERE id=$1 AND statut != 'termine'
       RETURNING *`,
      [matchId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Match non trouvé ou déjà terminé' });
    }

    res.json({ success: true, match: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/matches/:id/start - Démarrer un match (en_cours)
router.post('/:id/start', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE matches
       SET statut='en_cours', score_scr=0, score_adv=0, buteurs='{}', updated_at=NOW()
       WHERE id=$1 AND statut='programme'
       RETURNING *`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Match non trouvé ou déjà démarré' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/matches/:id/reset - Réinitialiser un match (score 0-0, statut programmé, buteurs vides)
router.post('/:id/reset', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE matches
       SET score_scr=0, score_adv=0, buteurs='{}', statut='programme', updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }
    res.json({ success: true, match: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/matches/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM matches WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
