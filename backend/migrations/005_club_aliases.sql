-- Migration 005 : alias des clubs (fusion des doublons)
-- Idempotente : peut être rejouée sans effet de bord.
--
--   club_aliases.alias      ancien nom d'un club absorbé par une fusion (unique)
--   club_aliases.fff_cl_no  numéro FFF d'un club absorbé qui en avait un différent
--                           du club conservé (ex. entente Munchhausen/Mothern) ;
--                           NULL pour un simple nom
--
-- Écrite par services/clubsFusion.js (POST /api/clubs/fusion), lue par
-- services/clubsFff.js (assurerClub, jointures par cl_no) et utils/ensureClub.js
-- pour ne jamais recréer un club fusionné.

BEGIN;

CREATE TABLE IF NOT EXISTS club_aliases (
  id         SERIAL PRIMARY KEY,
  club_id    INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  alias      VARCHAR(100) NOT NULL,
  fff_cl_no  INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT club_aliases_alias_key     UNIQUE (alias),
  CONSTRAINT club_aliases_fff_cl_no_key UNIQUE (fff_cl_no)
);

CREATE INDEX IF NOT EXISTS idx_club_aliases_club ON club_aliases(club_id);

COMMIT;
