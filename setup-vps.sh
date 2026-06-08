#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Setup inicial del VPS — La Madriguera QR System
# Ejecutar UNA VEZ en el servidor, como root o con sudo:
#
#   bash setup-vps.sh
#
# Ubuntu 22.04 / Debian 12
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REMOTE_DIR="/var/www/la-madriguera-qr"

echo ""
echo "  La Madriguera — Setup VPS"
echo "  ──────────────────────────────────────"

# ── 1. Actualizar sistema ─────────────────────────────────────────────────
echo ""
echo "  [1/7] Actualizando paquetes del sistema…"
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. Node.js 22 ────────────────────────────────────────────────────────
echo ""
echo "  [2/7] Instalando Node.js 22…"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - 2>/dev/null
apt-get install -y -qq nodejs
echo "        node $(node -v) | npm $(npm -v)"

# ── 3. pnpm ──────────────────────────────────────────────────────────────
echo ""
echo "  [3/7] Instalando pnpm…"
npm install -g pnpm --silent
echo "        pnpm $(pnpm -v)"

# ── 4. PM2 ───────────────────────────────────────────────────────────────
echo ""
echo "  [4/7] Instalando PM2…"
npm install -g pm2 --silent
echo "        pm2 $(pm2 -v)"

# ── 5. Nginx + Certbot ───────────────────────────────────────────────────
echo ""
echo "  [5/7] Instalando Nginx y Certbot…"
apt-get install -y -qq nginx certbot python3-certbot-nginx

systemctl enable nginx
systemctl start nginx
echo "        nginx $(nginx -v 2>&1 | grep -oP '[\d.]+')"

# ── 6. Crear carpeta del proyecto ─────────────────────────────────────────
echo ""
echo "  [6/7] Creando directorio del proyecto: $REMOTE_DIR"
mkdir -p "$REMOTE_DIR/backend"
chown -R www-data:www-data "$REMOTE_DIR" 2>/dev/null || true

# ── 7. Firewall básico ────────────────────────────────────────────────────
echo ""
echo "  [7/7] Configurando firewall (ufw)…"
if command -v ufw &>/dev/null; then
  ufw allow OpenSSH
  ufw allow 'Nginx Full'
  ufw --force enable
  echo "        SSH, HTTP y HTTPS habilitados"
else
  echo "        ufw no disponible, omitiendo"
fi

echo ""
echo "  ──────────────────────────────────────"
echo "  ✓ Setup completo"
echo ""
echo "  PRÓXIMOS PASOS:"
echo "  1. Desde tu máquina local, ejecuta:  ./deploy.sh usuario@$(hostname -I | awk '{print $1}')"
echo "  2. Configura nginx:                  nano /etc/nginx/sites-available/la-madriguera-qr"
echo "  3. Symlink y reload:                 ln -s /etc/nginx/sites-available/la-madriguera-qr /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx"
echo "  4. SSL con certbot:                  certbot --nginx -d TU_DOMINIO.COM"
echo ""
