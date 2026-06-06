#!/bin/bash
# ============================================================
#  ENSAM Exam Platform — Script de configuration Oracle Cloud
#  Exécuter en tant que ubuntu sur Ubuntu 22.04 ARM
# ============================================================
set -e

echo ""
echo "========================================"
echo "  ENSAM Exam Platform — Setup Oracle VM"
echo "========================================"
echo ""

# ── 1. Mise à jour système ───────────────────────────────────
echo "[1/7] Mise à jour du système..."
sudo apt-get update -y && sudo apt-get upgrade -y

# ── 2. Installation Node.js 20 LTS ──────────────────────────
echo "[2/7] Installation de Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version && npm --version

# ── 3. Installation PM2 (gestionnaire de processus) ─────────
echo "[3/7] Installation de PM2..."
sudo npm install -g pm2
pm2 --version

# ── 4. Installation outils ───────────────────────────────────
echo "[4/7] Installation des outils (git, unzip)..."
sudo apt-get install -y git unzip curl

# ── 5. Configuration du pare-feu (UFW) ──────────────────────
echo "[5/7] Configuration du pare-feu..."
sudo apt-get install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 3200/tcp    # Application ENSAM
sudo ufw allow 80/tcp      # HTTP (optionnel, pour Nginx)
sudo ufw allow 443/tcp     # HTTPS (optionnel)
sudo ufw --force enable
sudo ufw status

# ── 6. Règles Oracle Cloud iptables (obligatoire) ───────────
echo "[6/7] Ouverture du port 3200 dans iptables Oracle..."
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3200 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || true
# Si netfilter-persistent n'est pas installé :
sudo apt-get install -y iptables-persistent
sudo sh -c "iptables-save > /etc/iptables/rules.v4"

# ── 7. Dossier de l'application ─────────────────────────────
echo "[7/7] Création des dossiers..."
mkdir -p ~/ensam-platform/Examens
mkdir -p ~/ensam-platform/exam-platformV3/logs

echo ""
echo "========================================"
echo "  Configuration terminée !"
echo "  Prochaine étape : uploader les fichiers"
echo "========================================"
