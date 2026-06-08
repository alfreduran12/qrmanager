#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Deploy — La Madriguera QR System
# Ejecutar desde tu máquina local:
#
#   ./deploy.sh usuario@IP_DEL_VPS
#
# Ejemplo:
#   ./deploy.sh ubuntu@192.168.1.10
#   ./deploy.sh root@qr.lamadriguera.co
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REMOTE="${1:?Uso: ./deploy.sh usuario@ip_del_vps}"
REMOTE_DIR="/var/www/la-madriguera-qr"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  La Madriguera — Deploy QR System"
echo "  → $REMOTE:$REMOTE_DIR"
echo "  ──────────────────────────────────────"

# ── 1. Subir archivos via rsync ───────────────────────────────────────────
echo ""
echo "  [1/3] Sincronizando archivos…"
rsync -az --delete \
  --exclude 'node_modules/' \
  --exclude 'equipos.db' \
  --exclude '.DS_Store' \
  --exclude 'deploy.sh' \
  --exclude 'setup-vps.sh' \
  --exclude 'nginx.conf' \
  --exclude '*.sh' \
  --progress \
  "$SCRIPT_DIR/" \
  "$REMOTE:$REMOTE_DIR/"

# ── 2. Instalar dependencias en el servidor ───────────────────────────────
echo ""
echo "  [2/3] Instalando dependencias…"
ssh "$REMOTE" "cd $REMOTE_DIR/backend && pnpm install --prod --silent"

# ── 3. Reiniciar con PM2 ─────────────────────────────────────────────────
echo ""
echo "  [3/3] Reiniciando servicio con PM2…"
ssh "$REMOTE" "
  cd $REMOTE_DIR/backend
  if pm2 list | grep -q 'la-madriguera-qr'; then
    pm2 reload ecosystem.config.js --update-env
  else
    pm2 start ecosystem.config.js
    pm2 save
  fi
"

echo ""
echo "  ──────────────────────────────────────"
echo "  ✓ Deploy completo"
echo ""
echo "  Verifica que el servicio esté corriendo:"
echo "    ssh $REMOTE 'pm2 status'"
echo ""
echo "  Logs en tiempo real:"
echo "    ssh $REMOTE 'pm2 logs la-madriguera-qr'"
echo ""
