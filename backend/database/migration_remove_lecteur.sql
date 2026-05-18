-- Migration : suppression du rôle 'lecteur'
-- Les utilisateurs ayant ce rôle sont promus 'gestionnaire'

-- 1. Supprimer le DEFAULT lié à 'lecteur'
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;

-- 2. Migrer les utilisateurs 'lecteur' existants
UPDATE users SET role = 'gestionnaire' WHERE role = 'lecteur';

-- 3. Recréer l'enum sans 'lecteur'
CREATE TYPE user_role_new AS ENUM ('admin', 'gestionnaire', 'coach', 'score_live');

ALTER TABLE users
  ALTER COLUMN role TYPE user_role_new
  USING role::text::user_role_new;

DROP TYPE user_role;
ALTER TYPE user_role_new RENAME TO user_role;

-- 4. Remettre un DEFAULT cohérent
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'gestionnaire';
