#!/usr/bin/env bash
#================================================================
# Build a distributable .zip of the extension (for the Chrome Web
# Store or manual sharing). Run: ./build.sh
#================================================================
set -euo pipefail

cd "$(dirname "$0")"

# Read version from manifest.json for the archive name.
VERSION=$(node -e "process.stdout.write(require('./manifest.json').version)")
OUT="dist/vk-message-checker-${VERSION}.zip"

mkdir -p dist
rm -f "$OUT"

# Package only the files Chrome needs at runtime.
zip -r -X "$OUT" \
	manifest.json \
	_locales \
	css \
	html \
	js \
	icons \
	-x "icons/source.png" \
	-x "*.DS_Store"

echo "Created $OUT"
