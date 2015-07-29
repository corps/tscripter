#!/usr/bin/env bash
set -e
cd "$( dirname "${BASH_SOURCE[0]}" )"

if [ ! -d "./TypeScript" ]; then
  git clone "https://github.com/Microsoft/TypeScript.git"
fi

cd TypeScript
git fetch
git reset v1.5.3 --hard
