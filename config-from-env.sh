#!/bin/sh
# Writes js/config.js from an env file (default .env). Usage: ./config-from-env.sh [.env.development]  (default .env = production)
set -e
cd "$(dirname "$0")"
ENV_FILE="${1:-.env}"
API_BASE=$(grep -E '^API_BASE=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"'"'"'\r ')
cat > js/config.js <<JS
/* Generated from $ENV_FILE by config-from-env.sh — edit the env file, not this file.
   apiBase: the Thulori API (the server app). */
window.THULORI_ADMIN = {
  apiBase: '$API_BASE'
};
JS
echo "js/config.js → apiBase: '$API_BASE' (from $ENV_FILE)"
