/**
 * Fusion des clubs adverses en doublon (« Mothern FC » / « Mothern F.C »…)
 *
 * suggererDoublons()  : groupes de doublons probables (même nom une fois retirés
 *   casse, accents, ponctuation, sigles FC/AS/US… et numéro d'équipe) et groupes
 *   à vérifier (noms abrégés : « Schiltigh » / « Schiltigheim »).
 * previsualiser()     : ce que la fusion va changer, sans rien écrire.
 * fusionner()         : applique la fusion dans une transaction :
 *   - matchs portant le nom (ou le cl_no) d'un club absorbé → nom du club conservé,
 *     numéro d'équipe final conservé ; un conflit avec la contrainte UNIQUE
 *     (equipe, date, adversaire) annule tout ;
 *   - logos, nom d'affichage, nom court : ceux du conservé, sinon du premier absorbé
 *     qui en a ; cl_no FFF repris si le conservé n'en a pas ;
 *   - logos temporaires et alias existants réassignés ;
 *   - noms des absorbés → club_aliases (avec leur cl_no s'il diffère de celui du
 *     conservé, voir assurerClub), puis suppression des absorbés.
 */

const pool = require('../db');

class ErreurFusion extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// ── Détection ─────────────────────────────────────────────────────────────────

// Sigles et préfixes ignorés dans la comparaison des noms
const SIGLES = new Set([
  'fc', 'as', 'sc', 'us', 'ent', 'es', 'esp', 'ss', 'ass', 'assb', 'asp', 'asc', 'sr',
  'cs', 'fce', 'afj', 'fr', 'suc', 'ac', 'sporting', 'club',
]);

// "Gambsheim A.S. 2" → ['gambsheim'] ; "AS Gambsheim" → ['gambsheim']
function motsCles(nom) {
  return String(nom || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\./g, '')                 // F.C → fc
    .replace(/[^a-z0-9]+/g, ' ')
    .trim().split(' ')
    .filter(w => w && !/^\d+$/.test(w) && !SIGLES.has(w))
    .sort();
}

// Deux listes de mots de même longueur, chaque mot de l'une préfixe (≥ 4 lettres) d'un mot de l'autre
function abreviations(a, b) {
  if (a.length !== b.length || a.length === 0) return false;
  const [courts, longs] = a.join(' ').length <= b.join(' ').length ? [a, b] : [b, a];
  const restants = [...longs];
  for (const w of courts) {
    const i = restants.findIndex(l => w.length >= 4 && l.startsWith(w));
    if (i < 0) return false;
    restants.splice(i, 1);
  }
  return true;
}

// Club conservé proposé : rattaché FFF, puis avec logo, puis le plus ancien
const rangConserve = (c) => [c.fff_cl_no == null ? 1 : 0, c.logo_url ? 0 : 1, c.id];
function comparerConserve(a, b) {
  const [ra, rb] = [rangConserve(a), rangConserve(b)];
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
  return 0;
}

function decrireGroupe(clubs, niveau) {
  const tries = [...clubs].sort(comparerConserve);
  const clNos = new Set(tries.map(c => c.fff_cl_no).filter(n => n != null));
  return {
    niveau,                                   // 'probable' | 'a_verifier'
    clubs: tries,
    conserve_suggere: tries[0].id,
    cl_no_differents: clNos.size > 1,
  };
}

async function suggererDoublons(db = pool) {
  const { rows } = await db.query(
    `SELECT c.id, c.nom, c.equipe, c.fff_cl_no, c.logo_url, c.logo_monochrome_url,
            (SELECT COUNT(*)::int FROM matches m
              WHERE m.adversaire_cl_no = c.fff_cl_no
                 OR LOWER(TRIM(m.adversaire)) = LOWER(TRIM(c.nom))) AS nb_matchs
       FROM clubs c ORDER BY c.id`);
  const clubs = rows.map(c => ({ ...c, mots: motsCles(c.nom) })).filter(c => c.mots.length > 0);

  // Doublons probables : mêmes mots-clés
  const parCle = new Map();
  for (const c of clubs) {
    const cle = c.mots.join(' ');
    if (!parCle.has(cle)) parCle.set(cle, []);
    parCle.get(cle).push(c);
  }
  const probables = [...parCle.values()].filter(g => g.length > 1);

  // À vérifier : noms abrégés entre groupes (union des groupes reliés)
  const groupes = [...parCle.values()];
  const parent = groupes.map((_, i) => i);
  const racine = (i) => (parent[i] === i ? i : (parent[i] = racine(parent[i])));
  for (let i = 0; i < groupes.length; i++) {
    for (let j = i + 1; j < groupes.length; j++) {
      if (abreviations(groupes[i][0].mots, groupes[j][0].mots)) parent[racine(j)] = racine(i);
    }
  }
  const unions = new Map();
  groupes.forEach((g, i) => {
    const r = racine(i);
    if (!unions.has(r)) unions.set(r, []);
    unions.get(r).push(g);
  });
  const aVerifier = [...unions.values()].filter(u => u.length > 1).map(u => u.flat());

  const sansMots = ({ mots, ...c }) => c;
  return [
    ...probables.map(g => decrireGroupe(g.map(sansMots), 'probable')),
    ...aVerifier.map(g => decrireGroupe(g.map(sansMots), 'a_verifier')),
  ];
}

// ── Prévisualisation ──────────────────────────────────────────────────────────

const cleNom = (s) => String(s || '').trim().toLowerCase();

function lireIds(conserveId, absorbesIds) {
  const conserve = Number(conserveId);
  if (!Number.isInteger(conserve)) throw new ErreurFusion(400, 'club_conserve_id invalide');
  if (!Array.isArray(absorbesIds) || absorbesIds.length === 0) {
    throw new ErreurFusion(400, 'clubs_absorbes_ids doit contenir au moins un club');
  }
  const absorbes = [...new Set(absorbesIds.map(Number))];
  if (absorbes.some(id => !Number.isInteger(id))) throw new ErreurFusion(400, 'clubs_absorbes_ids invalide');
  if (absorbes.includes(conserve)) throw new ErreurFusion(400, 'Le club conservé ne peut pas être absorbé');
  return { conserve, absorbes };
}

/**
 * Calcule la fusion sans rien écrire. verrou = true (dans une transaction) :
 * les clubs et matchs concernés sont verrouillés jusqu'au COMMIT.
 */
async function previsualiser(conserveId, absorbesIds, { db = pool, verrou = false } = {}) {
  const { conserve: idConserve, absorbes: idsAbsorbes } = lireIds(conserveId, absorbesIds);
  const forUpdate = verrou ? 'FOR UPDATE' : '';

  const { rows: lignes } = await db.query(
    `SELECT * FROM clubs WHERE id = ANY($1::int[]) ORDER BY id ${forUpdate}`,
    [[idConserve, ...idsAbsorbes]]);
  const parId = new Map(lignes.map(c => [c.id, c]));
  const manquants = [idConserve, ...idsAbsorbes].filter(id => !parId.has(id));
  if (manquants.length) throw new ErreurFusion(404, `Club(s) introuvable(s) : ${manquants.join(', ')}`);

  const conserve = parId.get(idConserve);
  const absorbes = idsAbsorbes.map(id => parId.get(id));   // ordre choisi : priorité pour les logos

  const { rows: aliasExistants } = await db.query(
    'SELECT id, club_id, alias, fff_cl_no FROM club_aliases WHERE club_id = ANY($1::int[])',
    [[idConserve, ...idsAbsorbes]]);

  // ── Club résultant ──
  const premier = (col) => {
    if (conserve[col]) return { valeur: conserve[col], source: conserve.id };
    const a = absorbes.find(c => c[col]);
    return a ? { valeur: a[col], source: a.id } : { valeur: null, source: null };
  };
  const logo = premier('logo_url');
  const logoMono = premier('logo_monochrome_url');

  // cl_no : celui du conservé, sinon celui du premier absorbé rattaché ; les autres → alias
  let clNoFinal = conserve.fff_cl_no;
  let nomFffFinal = conserve.nom_fff;
  const clNoAlias = [];          // [{ club, fff_cl_no }]
  for (const a of absorbes) {
    if (a.fff_cl_no == null) continue;
    if (clNoFinal == null) { clNoFinal = a.fff_cl_no; nomFffFinal = a.nom_fff; }
    else clNoAlias.push({ club: a, fff_cl_no: a.fff_cl_no });
  }

  // ── Alias ──
  const dejaConnus = new Set([conserve.nom, conserve.equipe, ...aliasExistants.map(a => a.alias)]
    .filter(Boolean).map(cleNom));
  const aliases = [];
  const ajouterAlias = (alias, fffClNo = null) => {
    if (!alias || !alias.trim()) return;
    const cle = cleNom(alias);
    const existant = aliases.find(a => cleNom(a.alias) === cle);
    if (existant) { if (fffClNo != null && existant.fff_cl_no == null) existant.fff_cl_no = fffClNo; return; }
    if (dejaConnus.has(cle) && fffClNo == null) return;
    aliases.push({ alias: alias.trim(), fff_cl_no: fffClNo });
  };
  for (const { club, fff_cl_no } of clNoAlias) ajouterAlias(club.nom, fff_cl_no);
  for (const a of absorbes) {
    ajouterAlias(a.nom);
    ajouterAlias(a.equipe);
    ajouterAlias(a.nom_fff);
  }
  const aliasDeplaces = aliasExistants.filter(a => a.club_id !== idConserve);

  // Alias déjà utilisés par un autre club (ni conservé ni absorbé)
  const avertissements = [];
  if (aliases.length) {
    const { rows: pris } = await db.query(
      `SELECT a.alias, a.fff_cl_no, a.club_id, c.nom FROM club_aliases a JOIN clubs c ON c.id = a.club_id
        WHERE NOT (a.club_id = ANY($1::int[]))
          AND (LOWER(TRIM(a.alias)) = ANY($2::text[]) OR a.fff_cl_no = ANY($3::int[]))`,
      [[idConserve, ...idsAbsorbes], aliases.map(a => cleNom(a.alias)),
       aliases.map(a => a.fff_cl_no).filter(n => n != null)]);
    for (const p of pris) {
      if (p.fff_cl_no != null && aliases.some(a => a.fff_cl_no === p.fff_cl_no)) {
        throw new ErreurFusion(409, `Le numéro FFF ${p.fff_cl_no} est déjà un alias du club #${p.club_id} ${p.nom}`);
      }
      const i = aliases.findIndex(a => cleNom(a.alias) === cleNom(p.alias));
      if (i < 0) continue;
      if (aliases[i].fff_cl_no != null) {
        throw new ErreurFusion(409, `L'alias « ${p.alias} » appartient déjà au club #${p.club_id} ${p.nom}`);
      }
      avertissements.push(`L'alias « ${p.alias} » appartient déjà au club #${p.club_id} ${p.nom} : il n'est pas repris.`);
      aliases.splice(i, 1);
    }
  }

  // Autres lignes portant le nom d'un absorbé, non incluses dans la fusion
  const nomsAbsorbes = [...new Set(absorbes.flatMap(a => [a.nom, a.equipe]).filter(Boolean).map(cleNom))];
  const { rows: homonymes } = await db.query(
    `SELECT id, nom, equipe FROM clubs
      WHERE NOT (id = ANY($1::int[]))
        AND (LOWER(TRIM(nom)) = ANY($2::text[]) OR LOWER(TRIM(equipe)) = ANY($2::text[]))`,
    [[idConserve, ...idsAbsorbes], nomsAbsorbes]);
  for (const h of homonymes) {
    avertissements.push(`Le club #${h.id} ${h.equipe || h.nom} porte le même nom qu'un club absorbé mais n'est pas dans la fusion.`);
  }

  // ── Matchs à renommer ──
  const clNoAbsorbes = absorbes.map(a => a.fff_cl_no).filter(n => n != null);
  const { rows: matchs } = await db.query(
    `SELECT id, equipe, date, adversaire, adversaire_cl_no FROM matches
      WHERE LOWER(TRIM(adversaire)) = ANY($1::text[])
         OR LOWER(TRIM(regexp_replace(adversaire, '\\s+\\d+$', ''))) = ANY($1::text[])
         OR adversaire_cl_no = ANY($2::int[])
      ORDER BY date, equipe ${forUpdate}`,
    [nomsAbsorbes, clNoAbsorbes]);

  const renommes = [];
  for (const m of matchs) {
    const num = String(m.adversaire).trim().match(/\s+(\d+)$/)?.[1];
    const apres = num && !conserve.nom.endsWith(` ${num}`) ? `${conserve.nom} ${num}` : conserve.nom;
    const clNo = m.adversaire_cl_no ?? clNoFinal ?? null;
    if (apres === m.adversaire && clNo === m.adversaire_cl_no) continue;
    renommes.push({
      id: m.id, equipe: m.equipe, date: m.date,
      avant: m.adversaire, apres,
      adversaire_cl_no: clNo,
    });
  }

  // Conflits UNIQUE (equipe, date, adversaire) : avec un match non renommé ou entre renommés
  const conflits = [];
  const idsRenommes = renommes.map(r => r.id);
  const cibles = new Map();
  for (const r of renommes) {
    const cle = JSON.stringify([r.equipe, r.date, r.apres]);
    if (!cibles.has(cle)) cibles.set(cle, []);
    cibles.get(cle).push(r.id);
  }
  for (const [cle, ids] of cibles) {
    const [equipe, date, adversaire] = JSON.parse(cle);
    const { rows: autres } = await db.query(
      `SELECT id FROM matches
        WHERE equipe = $1 AND date = $2 AND adversaire = $3 AND NOT (id = ANY($4::int[]))`,
      [equipe, date, adversaire, idsRenommes]);
    const tous = [...ids, ...autres.map(a => a.id)];
    if (tous.length > 1) conflits.push({ equipe, date, adversaire, match_ids: tous });
  }

  const { rows: [{ n: nbLogosTemp }] } = await db.query(
    'SELECT COUNT(*)::int AS n FROM logos_temporaires WHERE club_id = ANY($1::int[])', [idsAbsorbes]);

  const resume = (c) => ({
    id: c.id, nom: c.nom, equipe: c.equipe, fff_cl_no: c.fff_cl_no,
    logo_url: c.logo_url, logo_monochrome_url: c.logo_monochrome_url,
  });

  return {
    conserve: resume(conserve),
    absorbes: absorbes.map(resume),
    resultat: {
      nom: conserve.nom,
      fff_cl_no: clNoFinal,
      nom_fff: nomFffFinal,
      logo_url: logo.valeur,
      logo_source_id: logo.source,
      logo_monochrome_url: logoMono.valeur,
      logo_monochrome_source_id: logoMono.source,
      nom_affiche: premier('nom_affiche').valeur,
      nom_court: premier('nom_court').valeur,
    },
    matchs: renommes,
    nb_matchs: renommes.length,
    conflits,
    logos_temporaires: nbLogosTemp,
    aliases,
    aliases_deplaces: aliasDeplaces.length,
    cl_no_absorbes: clNoAlias.map(({ club, fff_cl_no }) => ({ club_id: club.id, nom: club.nom, fff_cl_no })),
    avertissements,
    peut_fusionner: conflits.length === 0,
  };
}

// ── Fusion ────────────────────────────────────────────────────────────────────

/**
 * Applique la fusion. confirmerClNo doit être vrai si des clubs absorbés ont un
 * numéro FFF différent de celui du conservé (ils deviennent des alias).
 * Lève ErreurFusion(409) en cas de conflit : rien n'est écrit.
 */
async function fusionner(conserveId, absorbesIds, { confirmerClNo = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const p = await previsualiser(conserveId, absorbesIds, { db: client, verrou: true });

    if (p.conflits.length) {
      throw new ErreurFusion(409, 'Fusion annulée : des matchs entreraient en conflit', p);
    }
    if (p.cl_no_absorbes.length && !confirmerClNo) {
      throw new ErreurFusion(409, 'Des clubs absorbés ont un numéro FFF différent : confirmation requise', p);
    }

    const idConserve = p.conserve.id;
    const idsAbsorbes = p.absorbes.map(a => a.id);
    const r = p.resultat;

    // cl_no libérés d'abord (unicité de clubs.fff_cl_no)
    await client.query('UPDATE clubs SET fff_cl_no = NULL WHERE id = ANY($1::int[])', [idsAbsorbes]);
    await client.query(
      `UPDATE clubs SET fff_cl_no = $1, nom_fff = $2, logo_url = $3, logo_monochrome_url = $4,
                        nom_affiche = $5, nom_court = $6
        WHERE id = $7`,
      [r.fff_cl_no, r.nom_fff, r.logo_url, r.logo_monochrome_url, r.nom_affiche, r.nom_court, idConserve]);

    for (const m of p.matchs) {
      await client.query(
        'UPDATE matches SET adversaire = $1, adversaire_cl_no = $2, updated_at = NOW() WHERE id = $3',
        [m.apres, m.adversaire_cl_no, m.id]);
    }

    await client.query(
      'UPDATE logos_temporaires SET club_id = $1 WHERE club_id = ANY($2::int[])', [idConserve, idsAbsorbes]);
    await client.query(
      'UPDATE club_aliases SET club_id = $1 WHERE club_id = ANY($2::int[])', [idConserve, idsAbsorbes]);

    for (const a of p.aliases) {
      // Alias du même nom déjà au conservé (déplacé ci-dessus) : on lui ajoute le cl_no
      await client.query(
        `INSERT INTO club_aliases (club_id, alias, fff_cl_no) VALUES ($1, $2, $3)
         ON CONFLICT (alias) DO UPDATE SET fff_cl_no = COALESCE(club_aliases.fff_cl_no, EXCLUDED.fff_cl_no)
          WHERE club_aliases.club_id = EXCLUDED.club_id`,
        [idConserve, a.alias, a.fff_cl_no]);
    }

    // Logos Drive (club_logos) et dossier Drive : repris par le conservé s'il ne les a pas
    for (const id of idsAbsorbes) {
      await client.query(
        `UPDATE club_logos SET club_id = $1, updated_at = NOW()
          WHERE club_id = $2 AND variante NOT IN (SELECT variante FROM club_logos WHERE club_id = $1)`,
        [idConserve, id]);
    }
    const { rows: [dossier] } = await client.query(
      `SELECT drive_folder_id, drive_folder_nom, drive_folder_manuel FROM clubs
        WHERE id = ANY($1::int[]) AND drive_folder_id IS NOT NULL ORDER BY array_position($1::int[], id) LIMIT 1`,
      [idsAbsorbes]);
    if (dossier) {
      await client.query('UPDATE clubs SET drive_folder_id = NULL WHERE id = ANY($1::int[])', [idsAbsorbes]);
      await client.query(
        `UPDATE clubs SET drive_folder_id = $1, drive_folder_nom = $2, drive_folder_manuel = $3
          WHERE id = $4 AND drive_folder_id IS NULL AND NOT drive_folder_manuel`,
        [dossier.drive_folder_id, dossier.drive_folder_nom, dossier.drive_folder_manuel, idConserve]);
    }

    await client.query('DELETE FROM clubs WHERE id = ANY($1::int[])', [idsAbsorbes]);
    await client.query('COMMIT');

    console.log(`[Clubs] Fusion : #${idsAbsorbes.join(', #')} → #${idConserve} ${p.conserve.nom} ` +
      `(${p.nb_matchs} match(s), ${p.aliases.length} alias)`);
    return p;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { suggererDoublons, previsualiser, fusionner, ErreurFusion, motsCles };
