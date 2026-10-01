-- Migration 002 : classements FFF stockés en base
-- Idempotente : peut être rejouée sans effet de bord.
--
-- matches.fff_cp_no / fff_phase_no / fff_poule_no / poule_nom :
--   identifiants DOFA de la poule (competition.cp_no, phase.number,
--   poule.stage_number, poule.name), remplis par services/fffImport.js
--
-- classements : une ligne par club et par classement d'équipe SCR,
--   remplacée en bloc par services/fffClassement.js (refreshClassements)

BEGIN;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS fff_cp_no    integer,
  ADD COLUMN IF NOT EXISTS fff_phase_no integer,
  ADD COLUMN IF NOT EXISTS fff_poule_no integer,
  ADD COLUMN IF NOT EXISTS poule_nom    varchar(50);

CREATE TABLE IF NOT EXISTS classements (
  id              serial PRIMARY KEY,
  equipe          varchar(10)  NOT NULL,              -- 'SCR 1'
  saison          integer      NOT NULL,              -- 2026 = saison 2026-2027
  division        varchar(100),
  fff_cp_no       integer      NOT NULL,
  fff_phase_no    integer      NOT NULL,
  fff_poule_no    integer      NOT NULL,              -- poule.stage_number
  poule_nom       varchar(50),
  rang            integer      NOT NULL,
  club            varchar(100) NOT NULL,
  club_cl_no      integer      NOT NULL,
  club_equipe_no  integer      NOT NULL DEFAULT 1,    -- equipe.code (1, 2, 3…)
  logo_url        text,
  points          integer NOT NULL,
  joues           integer NOT NULL,
  victoires       integer NOT NULL,
  nuls            integer NOT NULL,
  defaites        integer NOT NULL,
  forfaits        integer NOT NULL DEFAULT 0,
  penalites       integer NOT NULL DEFAULT 0,
  buts_pour       integer NOT NULL,
  buts_contre     integer NOT NULL,
  diff            integer NOT NULL,                   -- buts_pour - buts_contre (signé)
  is_scr          boolean NOT NULL DEFAULT false,
  journee         integer,                            -- valeur la plus fréquente de « joués »
  fff_journee_no  integer,                            -- cj_no brut DOFA
  classement_date date,                               -- date du classement côté FFF
  recupere_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classements_unique_club UNIQUE (equipe, saison, club_cl_no, club_equipe_no)
);

CREATE INDEX IF NOT EXISTS idx_classements_equipe ON classements(equipe, saison, rang);

COMMIT;
