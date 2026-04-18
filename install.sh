#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# SCR Social Manager — Script d'installation automatique (Ubuntu 22.04 / 20.04)
# Usage : bash install.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERR]${NC}  $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_NAME="scr_social_manager"
DB_USER="scr_user"
DB_PASS="scr_$(openssl rand -hex 8)"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   SCR Social Manager — Installation Ubuntu   ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Mise à jour système ─────────────────────────────────────────────────────
info "Mise à jour des paquets système..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
success "Système mis à jour"

# ── 2. Dépendances système ─────────────────────────────────────────────────────
info "Installation des dépendances système..."
sudo apt-get install -y -qq curl git build-essential libvips-dev
success "Dépendances système installées"

# ── 3. Node.js 20 via NodeSource ──────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  info "Installation de Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - -qq
  sudo apt-get install -y -qq nodejs
  success "Node.js $(node -v) installé"
else
  success "Node.js $(node -v) déjà présent"
fi

# ── 4. PostgreSQL ──────────────────────────────────────────────────────────────
if ! command -v psql &>/dev/null; then
  info "Installation de PostgreSQL..."
  sudo apt-get install -y -qq postgresql postgresql-contrib
  sudo systemctl enable postgresql
  sudo systemctl start postgresql
  success "PostgreSQL installé et démarré"
else
  success "PostgreSQL déjà présent ($(psql --version | head -1))"
  sudo systemctl start postgresql 2>/dev/null || true
fi

# ── 5. Création base de données ───────────────────────────────────────────────
info "Création de la base de données '$DB_NAME'..."
if sudo -u postgres psql -lqt | cut -d\| -f1 | grep -qw "$DB_NAME"; then
  warn "La base '$DB_NAME' existe déjà — ignoré"
else
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || true
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
  success "Base '$DB_NAME' créée (user: $DB_USER)"
fi

# ── 6. Import schema + seed ───────────────────────────────────────────────────
info "Import du schéma SQL..."
sudo -u postgres psql "$DB_NAME" < "$SCRIPT_DIR/backend/database/schema.sql"
success "Schéma importé"

if [ -f "$SCRIPT_DIR/backend/database/seed.sql" ]; then
  info "Import des données initiales (seed)..."
  sudo -u postgres psql "$DB_NAME" < "$SCRIPT_DIR/backend/database/seed.sql" 2>/dev/null || warn "Seed ignoré (données déjà présentes ou erreur)"
fi

# ── 7. Configuration backend .env ─────────────────────────────────────────────
ENV_FILE="$SCRIPT_DIR/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
  info "Création du fichier .env backend..."
  cp "$SCRIPT_DIR/backend/.env.example" "$ENV_FILE"
  # Remplacer les valeurs par défaut
  sed -i "s/DB_USER=postgres/DB_USER=$DB_USER/" "$ENV_FILE"
  sed -i "s/DB_PASSWORD=yourpassword/DB_PASSWORD=$DB_PASS/" "$ENV_FILE"
  sed -i "s|FRONTEND_URL=http://localhost:5173|FRONTEND_URL=http://$(hostname -I | awk '{print $1}')|" "$ENV_FILE"
  success ".env backend créé"
  warn "⚠  Pensez à configurer les tokens Meta dans backend/.env"
else
  warn "backend/.env existe déjà — non modifié"
fi

# ── 8. Dépendances npm ────────────────────────────────────────────────────────
info "Installation des dépendances backend..."
cd "$SCRIPT_DIR/backend" && npm install --production --silent
success "Dépendances backend installées"

info "Installation des dépendances frontend..."
cd "$SCRIPT_DIR/frontend" && npm install --silent
success "Dépendances frontend installées"

# ── 9. Build frontend ─────────────────────────────────────────────────────────
info "Build du frontend (Vite)..."
# Pointer le frontend vers l'IP du serveur
SERVER_IP=$(hostname -I | awk '{print $1}')
VITE_ENV="$SCRIPT_DIR/frontend/.env.production"
echo "VITE_API_URL=http://${SERVER_IP}:3001/api" > "$VITE_ENV"
cd "$SCRIPT_DIR/frontend" && npm run build --silent
success "Frontend buildé → frontend/dist/"

# ── 10. PM2 ───────────────────────────────────────────────────────────────────
info "Installation de PM2..."
sudo npm install -g pm2 --silent
success "PM2 installé ($(pm2 --version))"

# ── 11. Création dossiers uploads ─────────────────────────────────────────────
info "Création des dossiers d'uploads..."
mkdir -p "$SCRIPT_DIR/backend/uploads/logos"
mkdir -p "$SCRIPT_DIR/backend/uploads/templates"
mkdir -p "$SCRIPT_DIR/backend/uploads/generated"
touch "$SCRIPT_DIR/backend/uploads/.gitkeep"
success "Dossiers uploads créés"

# ── 12. Lancement PM2 ─────────────────────────────────────────────────────────
info "Démarrage de l'application avec PM2..."
cd "$SCRIPT_DIR"

# Arrêter les instances existantes si présentes
pm2 delete scr-backend 2>/dev/null || true

pm2 start backend/index.js \
  --name scr-backend \
  --cwd "$SCRIPT_DIR/backend" \
  --env production

# Serveur statique pour le frontend (serve)
sudo npm install -g serve --silent
pm2 start "serve -s frontend/dist -l 8080" \
  --name scr-frontend \
  --cwd "$SCRIPT_DIR" \
  --interpreter bash 2>/dev/null || \
pm2 start "$SCRIPT_DIR/frontend/dist" \
  --name scr-frontend \
  --spa 2>/dev/null || true

pm2 save
sudo pm2 startup systemd -u "$USER" --hp "$HOME" 2>/dev/null | tail -1 | bash 2>/dev/null || true
success "PM2 configuré pour démarrer au boot"

# ── Résumé ────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║   ✅  SCR Social Manager installé avec succès !                  ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
printf "║   Backend API  : http://%-40s║\n" "${SERVER_IP}:3001"
printf "║   Frontend     : http://%-40s║\n" "${SERVER_IP}:8080"
echo "║                                                                  ║"
echo "║   Base de données :                                              ║"
printf "║     Nom    : %-51s║\n" "$DB_NAME"
printf "║     User   : %-51s║\n" "$DB_USER"
printf "║     Mdp    : %-51s║\n" "$DB_PASS"
echo "║                                                                  ║"
echo "║   ⚠  Sauvegardez ces identifiants DB !                          ║"
echo "║   ⚠  Configurez les tokens Meta dans backend/.env               ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "  Logs backend : pm2 logs scr-backend"
echo "  Statut PM2   : pm2 status"
echo "  Mise à jour  : bash update.sh"
echo ""
