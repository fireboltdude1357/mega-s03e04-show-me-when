#!/bin/bash
# Copies app/ to dist/ with the current git sha written into the build meta tag and footer.
# Recordings in ../media (outside the repo, so they don't change the sha) are served at /media/.
set -euo pipefail
cd "$(dirname "$0")"
sha=$(git rev-parse HEAD)
rm -rf dist && cp -r app dist
sed -i "s/__BUILD_SHA__/$sha/g" dist/index.html
if [ -d ../media ]; then cp -r ../media dist/media; fi
echo "$sha"
