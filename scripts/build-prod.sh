#!/bin/bash
# build-prod.sh

set -e

rm -rf dist

echo "🔄 Kompilacja TypeScript..."
tsc --project tsconfig.build.json

echo "🔄 Zamiana aliasów za pomocą tsc-alias..."
tsc-alias -p tsconfig.build.json

echo "✅ Build zakończony"