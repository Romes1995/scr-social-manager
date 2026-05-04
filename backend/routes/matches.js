const express = require('express');
const router = express.Router();
const pool = require('../db');
const { ensureAdversaireClub } = require('../utils/ensureClub');

// GET /api/matches - Liste tous les matchs
router.get('/', async (req, res) => {
  try {
    const { statut, equipe, upcoming, limit } = req.query;
    // Enrichit chaque match avec le logo local du club adversaire (clubs.logo_url)
    let query = `
      SELECT *,
        (SELECT c.logo_url FROM clubs c
         WHERE c.logo_url IS NOT NULL
           AND LOWER(TRIM(c.nom)) = LOWER(TRIM(adversaire))
         LIMIT 1) AS logo_adversaire_local
      FROM matches
    `;
    const params = [];
    const conditions = [];

    // upcoming=true → prochains matchs programmés
    if (upcoming === 'true') {
      conditions.push(`statut = 'programme'`);
    } else if (statut) {
      params.push(statut);
      conditions.push(`statut = $${params.length}`);
    }
    if (equipe) {
      params.push(equipe);
      conditions.push(`equipe = $${params.length}`);
    }

    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY date ASC, heure ASC';
    if (limit) query += ` LIMIT ${Math.min(Math.max(parseInt(limit) || 10, 1), 50)}`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/matches/standings — bilan par équipe calculé depuis les matchs terminés
router.get('/standings', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        equipe,
        COUNT(*)::int                                                                      AS joues,
        SUM(CASE WHEN score_scr > score_adv THEN 1 ELSE 0 END)::int                      AS victoires,
        SUM(CASE WHEN score_scr = score_adv THEN 1 ELSE 0 END)::int                      AS nuls,
        SUM(CASE WHEN score_scr < score_adv THEN 1 ELSE 0 END)::int                      AS defaites,
        SUM(score_scr)::int                                                               AS buts_pour,
        SUM(score_adv)::int                                                               AS buts_contre,
        (SUM(score_scr) - SUM(score_adv))::int                                           AS diff,
        SUM(CASE WHEN score_scr > score_adv THEN 3
                 WHEN score_scr = score_adv THEN 1 ELSE 0 END)::int                      AS points,
        (SELECT division FROM matches m2
         WHERE m2.equipe = matches.equipe AND m2.statut = 'termine'
         ORDER BY m2.date DESC LIMIT 1)                                                   AS division,
        ARRAY(
          SELECT CASE WHEN score_scr > score_adv THEN 'V'
                      WHEN score_scr = score_adv THEN 'N' ELSE 'D' END
          FROM matches m3
          WHERE m3.equipe = matches.equipe AND m3.statut = 'termine'
          ORDER BY m3.date DESC LIMIT 5
        )                                                                                  AS forme
      FROM matches
      WHERE statut = 'termine'
      GROUP BY equipe
      ORDER BY equipe ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/matches/top-scorers — meilleurs buteurs + photo joueur (LEFT JOIN joueurs)
router.get('/top-scorers', async (req, res) => {
  try {
    const lim = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const result = await pool.query(`
      SELECT
        sub.buteur,
        sub.equipe,
        COUNT(*)::int                                        AS buts,
        (SELECT j.photo FROM joueurs j
         WHERE LOWER(TRIM(j.prenom || ' ' || j.nom)) = LOWER(TRIM(sub.buteur))
         LIMIT 1)                                           AS joueur_photo
      FROM (
        SELECT UNNEST(buteurs) AS buteur, equipe
        FROM matches
        WHERE statut = 'termine' AND cardinality(buteurs) > 0
      ) sub
      WHERE sub.buteur IS NOT NULL AND TRIM(sub.buteur) <> ''
      GROUP BY sub.buteur, sub.equipe
      ORDER BY buts DESC, sub.buteur ASC
      LIMIT $1
    `, [lim]);
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

// PATCH /api/matches/:id/buteurs - Mettre à jour les buteurs d'un match terminé
router.patch('/:id/buteurs', async (req, res) => {
  try {
    const { buteurs } = req.body;
    if (!Array.isArray(buteurs)) {
      return res.status(400).json({ error: 'buteurs doit être un tableau' });
    }
    const result = await pool.query(
      `UPDATE matches SET buteurs=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [buteurs, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Match non trouvé' });
    }
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

// Construit le texte de publication programme à partir des matchs BDD
function formatProgrammeText(matchs) {
  const JOURS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const MOIS  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

  const numEquipe = (equipe) => String(equipe || '').replace(/\D/g, '') || '';

  // Ordre fixe : équipe 1 → 2 → 3, reste en dernier
  const teamRank = (m) => {
    const num = numEquipe(m.equipe);
    return num === '1' ? 0 : num === '2' ? 1 : num === '3' ? 2 : 99;
  };
  const sorted = [...matchs].sort((a, b) => teamRank(a) - teamRank(b));

  const lines = sorted.map(m => {
    // Équipes
    const scrLabel = `SC Roeschwoog ${numEquipe(m.equipe)}`.trim();
    const homeTeam = m.domicile ? scrLabel : m.adversaire;
    const awayTeam = m.domicile ? m.adversaire : scrLabel;

    // Date
    let dateStr = '';
    if (m.date) {
      const d = new Date(m.date);
      dateStr = `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
    }

    // Heure : "15:00" ou "15:00:00" → "15h00"
    let heureStr = '';
    if (m.heure) {
      const [h, min] = m.heure.slice(0, 5).split(':');
      heureStr = `${parseInt(h)}h${min}`;
    }

    return [
      `⚽ ${m.division || 'Compétition'}`,
      `${homeTeam} 🆚 ${awayTeam}`,
      dateStr ? `📅 ${dateStr}` : '',
      heureStr ? `🕐 ${heureStr}` : '',
    ].filter(Boolean).join('\n');
  });

  return [
    '🏟️ Programme du week-end - SC Roeschwoog',
    '',
    lines.join('\n\n'),
    '',
    '💚 Venez nombreux encourager nos verts et blancs ce week-end !',
  ].join('\n');
}

// POST /api/matches/generate-text
router.post('/generate-text', async (req, res) => {
  try {
    const { match_ids } = req.body;
    if (!Array.isArray(match_ids) || match_ids.length === 0) {
      return res.status(400).json({ error: 'match_ids requis (tableau non vide)' });
    }

    const { rows: matchs } = await pool.query(
      'SELECT * FROM matches WHERE id = ANY($1::int[]) ORDER BY heure ASC',
      [match_ids]
    );
    if (matchs.length === 0) {
      return res.status(404).json({ error: 'Aucun match trouvé pour ces IDs' });
    }

    const text = formatProgrammeText(matchs);
    res.json({ success: true, text });
  } catch (err) {
    console.error('[generate-text]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
