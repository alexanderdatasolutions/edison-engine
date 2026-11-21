#!/bin/sh
# Card scripts and card database from Project Ignis, pinned so every deploy runs the same rulings.
# Usage: sh scripts/fetch-data.sh [data dir]   (default: this repo's data/; the engine reads EDISON_DATA, or that folder)
set -e
dir="${1:-$(cd "$(dirname "$0")/.." && pwd)/data}"
fetch() { # dir repo sha
  if [ "$(git -C "$1" rev-parse HEAD 2>/dev/null)" = "$3" ]; then return; fi
  rm -rf "$1"; mkdir -p "$1"
  git -C "$1" init -q
  git -C "$1" fetch -q --depth 1 "https://github.com/ProjectIgnis/$2.git" "$3"
  git -C "$1" checkout -q FETCH_HEAD
}
fetch "$dir/scripts" CardScripts a236044e8b7ba0a5b2915bf5f3479c6fab5ae7b6
fetch "$dir/cdb" BabelCDB 3d673dfe3b90471022cf11898e8ebe53443c8f17
