#!/bin/bash
# Rebuilds ocgcore.sync.wasm and ocgcore.sync.mjs from source. See BUILD.md.
# Usage: vendor/ocgcore/build.sh <work dir>     (em++ 4.0.9 on PATH: source <emsdk>/emsdk_env.sh)
set -e
here="$(cd "$(dirname "$0")" && pwd)"
work="${1:?work directory}"
em++ --version | grep -q " 4\.0\.9 " || { echo "em++ 4.0.9 is required" >&2; exit 1; }
[ -d "$work/ocgcore-wasm" ] || git clone https://github.com/n1xx1/ocgcore-wasm.git "$work/ocgcore-wasm"
cd "$work/ocgcore-wasm"
git checkout -q 70003ac4ffc55c32f4061d405a926a693ee2cc6a                # ocgcore-wasm 0.1.7
git submodule update --init --recursive                                 # cpp/ygo = edo9300/ygopro-core 1e3bcfd9, with its lua submodule
git -C cpp/ygo checkout -q -f 1e3bcfd95560eea7bddd00ef79a13b247d9a6585
git -C cpp/ygo -c user.name=build -c user.email=build@localhost am -q "$here"/patches/*.patch
bash scripts/build.sh
cp lib/ocgcore.sync.wasm lib/ocgcore.sync.mjs "$here/"
chmod 644 "$here"/ocgcore.sync.*
shasum -a 256 "$here"/ocgcore.sync.*
