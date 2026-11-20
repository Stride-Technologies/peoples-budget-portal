#!/usr/bin/env bash
# One-time setup script for the server (Ubuntu with Docker).
# Run as the user that owns the checkout, after copying .env to /opt/budget-portal/.env
#
# Usage: bash deploy/setup-server.sh
set -euo pipefail

ENV_FILE="/opt/budget-portal/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found."
  echo "Copy .env.production.example to /opt/budget-portal/.env and fill in all values first."
  exit 1
fi

# Load env vars from .env
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

echo "==> Creating app directories..."
sudo mkdir -p /opt/budget-portal/nginx /var/www/certbot
sudo chown -R "$USER":"$USER" /opt/budget-portal

echo "==> Installing Certbot..."
sudo snap install certbot --classic
sudo ln -sf /snap/bin/certbot /usr/bin/certbot

# Registry-less deploy: images are built on the Droplet, never pulled from a
# registry, so no `docker login` / DO_API_TOKEN is needed here.

# Standalone is correct HERE and nowhere else: nginx cannot start without a
# cert, so it cannot yet serve the ACME challenge. But certonly also persists
# `authenticator = standalone` into the renewal conf, and that is wrong for
# every renewal after this one — the nginx container owns :80 by then, so
# certbot can never bind it and renewal fails silently until the cert expires.
# Step 5 below converts the conf to webroot once nginx is up. Do not skip it.
echo "==> Issuing TLS certificate (standalone — nginx must not be running)..."
sudo certbot certonly --standalone \
  -d "${SITE_HOST:?Set SITE_HOST in .env}" \
  --email "${CERTBOT_EMAIL:?Set CERTBOT_EMAIL in .env}" \
  --agree-tos \
  --non-interactive

# No renewal cron here on purpose. `snap install certbot` already installs
# snap.certbot.renew.timer, which runs as root twice a day. The cron this
# script used to add ran as the deploy user, so every 3am run died on
# `Permission denied: /var/log/letsencrypt/.certbot.lock` before it renewed
# anything.

echo ""
echo "Setup complete. Next steps:"
echo "  1. Copy docker-compose.yml and nginx/ to /opt/budget-portal/"
echo "  2. docker compose --profile local-db up -d"
echo "  3. bash /opt/budget-portal/deploy/init-db.sh"
echo "  4. Confirm https://${SITE_HOST} serves a valid certificate"
echo "  5. REQUIRED — point renewals at webroot now that nginx is up:"
echo "       sudo certbot certonly --webroot -w /var/www/certbot -d ${SITE_HOST} \\"
echo "         --deploy-hook \"docker compose -f /opt/budget-portal/docker-compose.yml exec -T nginx nginx -s reload\""
