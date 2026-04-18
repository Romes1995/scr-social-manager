#!/bin/bash
echo "🚀 Démarrage SCR Social Manager..."
cd /Users/romaricnagel/scr-social-manager/backend && npm run dev &
cd /Users/romaricnagel/scr-social-manager/frontend && npm run dev &
sleep 3
echo "📱 Démarrage du tunnel ngrok..."
ngrok http 5174
