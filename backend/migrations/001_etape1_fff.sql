-- Migration 001 : rattachement des matchs à la FFF (DOFA)
-- Idempotente : peut être rejouée sans effet de bord.
--
--   fff_match_id      ma_no DOFA (clé de rapprochement de l'import)
--   journee           poule_journee.number
--   competition_type  competition.type (CH = championnat, CP = coupe)
--   score_source      'app' (saisi dans l'app) | 'fff' (officiel) | NULL (pas de score)
--   score_fff_at      date à laquelle la FFF a publié/confirmé le score
--   terrain_*         terrain DOFA (name, address, zip_code, city)
--   fff_resultat      GA / PE / NU, vu côté SCR
--   forfait_scr/adv   home_is_forfeit / away_is_forfeit, vus côté SCR
--   reporte           seems_postponed ou initial_date renseigné
--   fff_updated_at    external_updated_at du match DOFA

BEGIN;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS fff_match_id     integer,
  ADD COLUMN IF NOT EXISTS journee          integer,
  ADD COLUMN IF NOT EXISTS competition_type varchar(5),
  ADD COLUMN IF NOT EXISTS score_source     varchar(10),
  ADD COLUMN IF NOT EXISTS score_fff_at     timestamptz,
  ADD COLUMN IF NOT EXISTS terrain_nom      varchar(150),
  ADD COLUMN IF NOT EXISTS terrain_adresse  varchar(200),
  ADD COLUMN IF NOT EXISTS terrain_cp       varchar(10),
  ADD COLUMN IF NOT EXISTS terrain_ville    varchar(100),
  ADD COLUMN IF NOT EXISTS fff_resultat     varchar(2),
  ADD COLUMN IF NOT EXISTS forfait_scr      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS forfait_adv      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reporte          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fff_updated_at   timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_fff_match_id_key') THEN
    ALTER TABLE matches ADD CONSTRAINT matches_fff_match_id_key UNIQUE (fff_match_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_score_source_check') THEN
    ALTER TABLE matches ADD CONSTRAINT matches_score_source_check
      CHECK (score_source IN ('app', 'fff'));
  END IF;
END $$;

-- Scores existants → 'app' (uniquement les matchs ayant réellement un score ;
-- les matchs 'programme' gardent NULL, leur 0-0 n'est qu'une valeur par défaut)
UPDATE matches SET score_source = 'app'
 WHERE score_source IS NULL AND statut IN ('termine', 'en_cours');

COMMIT;
