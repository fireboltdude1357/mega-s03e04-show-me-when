#!/bin/bash
# Builds dist/ with the current sha and deploys it to the mega-s03e04-board Worker.
set -euo pipefail
cd "$(dirname "$0")"
./build.sh
set -a; . "$HOME/.claude/.env"; set +a
account=$(curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/accounts | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"][0]["id"])')
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_WORKERS_TOKEN" CLOUDFLARE_ACCOUNT_ID="$account" \
  /home/kyleb/.t3/scratch/mega-week2/S02E05/worker/node_modules/.bin/wrangler deploy 2>&1 | grep -Ev 'token|Token' 
