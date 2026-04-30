#!/bin/bash

# SCR Social Manager - Script de démarrage
echo "🟢 Démarrage SCR Social Manager..."

# Kill les processus existants sur les ports 3001 et 5173
echo "⏹️  Arrêt des processus existants..."
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
sleep 1

# Démarrage Backend
echo "🔧 Démarrage Backend (port 3001)..."
cd ~/scr-social-manager/backend
npm run dev &

sleep 2

# Démarrage Frontend
echo "🎨 Démarrage Frontend (port 5173)..."
cd ~/scr-social-manager/frontend
npm run dev &

echo ""
echo "✅ SCR Social Manager lancé !"
echo "   → Frontend : http://localhost:5173"
echo "   → Backend  : http://localhost:3001"
echo ""
echo "Ctrl+C pour tout arrêter"

# Attendre et afficher les logs
wait
