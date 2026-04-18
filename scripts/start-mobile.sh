#!/bin/bash
#
# start-mobile.sh — Lance SCR Social Manager accessible depuis un téléphone via ngrok
#
# Plan gratuit ngrok = 1 seul tunnel à la fois.
# Stratégie : on expose uniquement le BACKEND (port 3001) via ngrok.
# Le frontend tourne en local ET est accessible sur le réseau Wi-Fi local.
# Pour un accès depuis l'extérieur du réseau, utiliser un compte ngrok payant
# ou exposer le frontend séparément après avoir arrêté le tunnel backend.
#

set -e

BACKEND_DIR="/Users/romaricnagel/scr-social-manager/backend"
FRONTEND_DIR="/Users/romaricnagel/scr-social-manager/frontend"
ENV_LOCAL="$FRONTEND_DIR/.env.local"

# ── 1. Tuer les serveurs existants ─────────────────────────────────────────────
echo "⏹  Arrêt des serveurs existants..."
lsof -ti :3001 | xargs kill -9 2>/dev/null || true
lsof -ti :5173 | xargs kill -9 2>/dev/null || true
sleep 1

# ── 2. Démarrer le backend ─────────────────────────────────────────────────────
echo "🚀 Démarrage du backend (port 3001)..."
cd "$BACKEND_DIR" && npm run dev > /tmp/backend.log 2>&1 &
BACKEND_PID=$!

# ── 3. Ouvrir le tunnel ngrok sur le backend ───────────────────────────────────
echo "🌐 Ouverture du tunnel ngrok sur le port 3001..."
ngrok http 3001 --log=stdout --log-format=json > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!

# Attendre que ngrok soit prêt et récupérer l'URL publique
NGROK_URL=""
for i in $(seq 1 15); do
  sleep 1
  NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null \
    | grep -o '"public_url":"https://[^"]*"' \
    | head -1 \
    | sed 's/"public_url":"//;s/"//')
  if [ -n "$NGROK_URL" ]; then break; fi
done

if [ -z "$NGROK_URL" ]; then
  echo "❌ Impossible de récupérer l'URL ngrok. Vérifie que tu es connecté (ngrok config add-authtoken ...)."
  kill $NGROK_PID 2>/dev/null
  exit 1
fi

NGROK_API_URL="${NGROK_URL}/api"
echo ""
echo "✅ Tunnel ngrok actif !"
echo "   URL publique backend : $NGROK_URL"
echo ""

# ── 4. Mettre à jour .env.local avec l'URL ngrok du backend ───────────────────
echo "VITE_API_URL=${NGROK_API_URL}" > "$ENV_LOCAL"
echo "📝 .env.local mis à jour : VITE_API_URL=${NGROK_API_URL}"
echo ""

# ── 5. Démarrer le frontend ────────────────────────────────────────────────────
echo "🖥  Démarrage du frontend (port 5173)..."
cd "$FRONTEND_DIR" && npm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
sleep 3

# Récupérer l'IP locale pour accès Wi-Fi
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "?")

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  SCR Social Manager — Mode Mobile"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Backend  (local)  : http://localhost:3001"
echo "  Backend  (public) : $NGROK_URL"
echo ""
echo "  Frontend (local)  : http://localhost:5173"
echo "  Frontend (Wi-Fi)  : http://${LOCAL_IP}:5173"
echo ""
echo "  📱 Depuis ton téléphone (même réseau Wi-Fi) :"
echo "     http://${LOCAL_IP}:5173"
echo ""
echo "  📱 Depuis l'extérieur du réseau :"
echo "     Lance un 2e tunnel : ngrok http 5173"
echo "     (nécessite d'arrêter ce tunnel ou un compte payant)"
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Ctrl+C pour tout arrêter"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── 6. Attendre et gérer l'arrêt propre ──────────────────────────────────────
cleanup() {
  echo ""
  echo "⏹  Arrêt des serveurs..."
  kill $BACKEND_PID $FRONTEND_PID $NGROK_PID 2>/dev/null || true
  # Restaurer .env.local en mode local
  echo "VITE_API_URL=http://localhost:3001/api" > "$ENV_LOCAL"
  echo "📝 .env.local restauré en mode local"
  exit 0
}
trap cleanup SIGINT SIGTERM

wait
