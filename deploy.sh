#!/bin/bash
# ============================================================
#  ENSAM — Script de déploiement (à lancer sur la VM)
#  Usage : bash deploy.sh
# ============================================================
set -e

APP_DIR=~/ensam-platform/exam-platformV3

echo "[1/4] Installation des dépendances npm..."
cd $APP_DIR
npm install --production

echo "[2/4] Création du fichier .env (si absent)..."
if [ ! -f .env ]; then
    cp .env.example .env
    SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    sed -i "s/changez-moi-avec-une-chaine-aleatoire-de-256-bits/$SECRET/" .env
    echo "  .env créé avec un secret JWT aléatoire"
else
    echo "  .env déjà existant, conservé"
fi

echo "[3/4] Démarrage/rechargement avec PM2..."
if pm2 list | grep -q "ensam-exam"; then
    pm2 reload ecosystem.config.js --update-env
else
    pm2 start ecosystem.config.js
fi
pm2 save

echo "[4/4] Configuration du démarrage automatique..."
pm2 startup | tail -1 | sudo bash 2>/dev/null || true

echo ""
echo "==========================================="
echo "  Déploiement terminé !"
IP=$(curl -s ifconfig.me 2>/dev/null || echo "VOTRE_IP")
echo "  URL : http://$IP:3200"
echo "  Professeur : http://$IP:3200/professeur.html"
echo "  Logs : pm2 logs ensam-exam"
echo "==========================================="
