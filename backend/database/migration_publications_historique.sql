-- Migration : journal des publications Meta (mock / test / live)
-- À exécuter sur une base existante

CREATE TABLE IF NOT EXISTS publications_historique (
  id SERIAL PRIMARY KEY,
  match_id INTEGER REFERENCES matches(id) ON DELETE SET NULL,
  platform VARCHAR(20) NOT NULL,
  type VARCHAR(30) NOT NULL,
  meta_post_id TEXT,
  statut VARCHAR(20) NOT NULL,
  erreur TEXT,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT hist_platform_check CHECK (platform IN ('facebook', 'instagram')),
  CONSTRAINT hist_statut_check   CHECK (statut IN ('publie', 'erreur', 'mock', 'test'))
);

CREATE INDEX IF NOT EXISTS idx_historique_match   ON publications_historique(match_id);
CREATE INDEX IF NOT EXISTS idx_historique_created ON publications_historique(created_at DESC);
