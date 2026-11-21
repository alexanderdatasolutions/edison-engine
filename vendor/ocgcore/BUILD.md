# The rules engine we serve

`ocgcore.sync.wasm` is EDOPro's core (edo9300/ygopro-core, AGPL-3.0) with the patches in `patches/`, built the way the
npm package `ocgcore-wasm` 0.1.7 builds its own. `lib/duel.js` hands it to that package's loader (`createCore({ wasmBinary })`),
so nothing in `node_modules` is replaced and `npm install` needs no build step. This folder is the complete source of what we
serve: upstream commits below plus the patch files.

| | |
|---|---|
| Wrapper and build script | github.com/n1xx1/ocgcore-wasm at `70003ac4ffc55c32f4061d405a926a693ee2cc6a` (0.1.7): `scripts/build.sh`, `cpp/wasm.cpp` |
| Core | github.com/edo9300/ygopro-core at `1e3bcfd95560eea7bddd00ef79a13b247d9a6585` (the wrapper's `cpp/ygo` submodule) |
| Lua | github.com/lua/lua at `6e22fedb74cf0c9b6656e9fce8b7331db847c605` (the core's `lua/src` submodule) |
| Compiler | emscripten 4.0.9 (the wrapper's CI, `.github/workflows/build.yaml`, `EM_VERSION`) |
| Result | `ocgcore.sync.wasm` sha256 `a266a67931fb322d8795fa6ad64a50b25f3313ab13c998f9804d509a2463e1bd` |

## Build

    git clone https://github.com/emscripten-core/emsdk.git && cd emsdk
    ./emsdk install 4.0.9 && ./emsdk activate 4.0.9 && source ./emsdk_env.sh     # also needs git, bash, and java for --closure
    cd <this repo> && vendor/ocgcore/build.sh /some/work/dir                     # about 80 s
    npm test && node test/fuzz.mjs 600

`build.sh` clones the wrapper at the commit above, applies `patches/*.patch` to `cpp/ygo`, runs the wrapper's own
`scripts/build.sh` unchanged, and copies `lib/ocgcore.sync.{wasm,mjs}` here. The build is reproducible: without the patches
it gives the published package's files byte for byte (`ocgcore.sync.wasm` sha256 `bb866e4a…5eda6c`), on macOS arm64 as on
the package's Linux CI.

`ocgcore.sync.mjs` is not loaded. It is the loader emscripten wrote for this wasm, kept because the package runs our wasm with
its own copy of that loader and the two must match (closure-minified import names). `test/edison-engine.test.mjs` fails if they differ,
which will happen on an `ocgcore-wasm` upgrade: rebuild from the new version's commits then. The JSPI variant is built too but not used.

## Patches

Each is one commit on top of the core commit above and adds one duel flag; with the flag off the core behaves as upstream.
The flag bits start at `1 << 48`, far above upstream's highest (`0x1000000000`). `lib/duel.js` maps the names (`EDISON_FLAGS`).

| Patch | Flag | Rule |
|---|---|---|
| 0001 | `DUEL_EDISON_IGNITION_PRIORITY` `1<<48` | Ignition Effect priority only in the response timing of the turn player's own Summon that triggered nothing; any Ignition Effect; none after a chain; declining the Summon's optional trigger passes priority (edisonformat.com/priority.html) |
| 0002 | `DUEL_EDISON_LP_COST` `1<<49` | A cost cannot reduce your Life Points to 0 (edisonformat.com/edison-rule-differences.html, rule 10) |
| 0003 | `DUEL_EDISON_DAMAGE_STEP_CHAINS` `1<<50` | Several chains before damage calculation, whatever started the last one (a monster's Quick Effect such as Honest included), one from then on (edisonformat.com/battle-phase.html; Honest's ruling: Substeps 1, 3 and 4) |

To move to a newer core: `git am` the patches onto it (they touch `ocgapi_constants.h`, `processor.cpp`, `processor_unit.h`, `field.cpp`),
update the commits in `build.sh` and this file, rebuild, run the tests against both `OCGCORE_WASM=package` (the new tests must fail) and ours.
