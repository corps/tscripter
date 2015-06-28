#!/usr/bin/env bash
set -e
cd "$( dirname "${BASH_SOURCE[0]}" )"

./node_modules/typescript/bin/tsc

rm -rf ./test
rm -rf ./typings

rm index.ts
rm lib/analyzer.ts
rm lib/statements.ts
