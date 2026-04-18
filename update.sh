#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# SCR Social Manager — Script de mise à jour
# Usage : bash update.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -e

GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║     SCR Social Manager — Mise à jour         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Récupérer les dernières modifications ──────────────────────────────────
info "Récupération des mises à jour depuis GitHub..."
cd "$SCRIPT_DIR"
git pull origin main
success "Code mis à jour"

# ── 2. Dépendances backend ────────────────────────────────────────────────────
info "Mise à jour des dépendances backend..."
cd "$SCRIPT_DIR/backend" && npm install --production --silent
success "Dépendances backend OK"

# ── 3. Build frontend ─────────────────────────────────────────────────────────
info "Mise à jour des dépendances frontend..."
cd "$SCRIPT_DIR/frontend" && npm install --silent
info "Build du frontend..."
npm run build --silent
success "Frontend buildé"

# ── 4. Migrations DB éventuelles ─────────────────────────────────────────────
# Applique le schema en mode idempotent (CREATE IF NOT EXISTS)
info "Vérification du schéma base de données..."
DB_NAME="scr_social_manager"
sudo -u postgres psql "$DB_NAME" < "$SCRIPT_DIR/backend/database/schema.sql" 2>/dev/null || true
success "Schéma vérifié"

# ── 5. Redémarrage PM2 ────────────────────────────────────────────────────────
info "Redémarrage des processus PM2..."
pm2 restart scr-backend --update-env
pm2 restart scr-frontend 2>/dev/null || true
success "Processus redémarrés"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ✅  Mise à jour terminée !                  ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
pm2 status
echo ""
