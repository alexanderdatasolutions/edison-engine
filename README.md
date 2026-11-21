# edison-engine

The rules engine of [Edison Table](https://edison-sim.onrender.com), a browser Yu-Gi-Oh simulator for the Edison format (the TCG as it was played under the March 2010 list). It is a program of its own: the website starts it as a child process and talks to it over a pipe, and everything that touches the rules lives here.

- **The core**: EDOPro's [ygopro-core](https://github.com/edo9300/ygopro-core) (AGPL-3.0), built to WebAssembly the way the npm package [ocgcore-wasm](https://github.com/n1xx1/ocgcore-wasm) builds it, with our Edison patches. `vendor/ocgcore/` is the complete source of the build we run: the upstream commits, the patches, and the build script (`vendor/ocgcore/BUILD.md`).
- **The card scripts**: [Project Ignis CardScripts](https://github.com/ProjectIgnis/CardScripts) and the [BabelCDB](https://github.com/ProjectIgnis/BabelCDB) card database at pinned commits (`scripts/fetch-data.sh`), plus our Edison scripts in `formats/edison-scripts/` (cards played by their 2010 text, and `init.lua`, rules for groups of cards).
- **The rulesets**: `formats/<id>.json` (core flags, script folders, life points, hand and deck sizes, card pool, banlist).
- **The server**: `server.js` owns every duel. It creates duels, takes answers, rebuilds a duel from its record, plays records again, and decides hidden information: a host receives each player's and the spectators' table, events and question already redacted.

License: GNU Affero General Public License v3.0 or later (`LICENSE`). If you run a modified version for users over a network, offer them its source.

## Run

    npm install && npm run fetch-data   # card scripts and card database into data/ (EDISON_DATA to put them elsewhere)
    npm test                            # the rules suite: every Edison ruling, errata, mechanics, hidden information, replays (about 25 s)
    node test/fuzz.mjs 600              # random bot duels; prints script errors and stuck questions
    node server.js                      # the server on stdin/stdout

Environment: `EDISON_DATA` (where `fetch-data` put the scripts and database; default `./data`), `EDISON_ENGINE_COMMIT` (this engine's commit, when the host knows it and there is no `.git`), `RENDER_GIT_COMMIT` (the host's commit, recorded with each duel), `OCGCORE_WASM` (`package` runs the unpatched core inside `ocgcore-wasm`, a path runs another build).

## Protocol

One JSON object per line each way. Every request has an `op` and, for a duel, the `duel` id the host chose; the reply carries the same `id` and either the result or `error`. A request with `noreply: true` gets no reply. Requests are handled one at a time, in order. 64-bit numbers (masks) travel as decimal strings. Nothing but replies is written to stdout; the server exits when stdin closes.

| op | request | reply |
|---|---|---|
| `hello` | | `protocol` (1), `version` {core, scripts, cards, engine, server}, `formats` |
| `create` | `duel`, `spec` | `record` (format, flags, engine, seed, decks in draw order, started, answers []), `state` (before the core runs), `next` (the frame after it ran to its first question) |
| `respond` | `duel`, `response` | `taken` (false: the answer could not be encoded, nothing changed), `next` (the core run on to the next question) |
| `advance` | `duel` | `next` |
| `views` | `duel` | `views`: the table as player 0, player 1 and a spectator see it |
| `resume` | `duel`, `spec`, `answers` [{r}], `upTo`, `messages` | a duel rebuilt from its spec and first `upTo` answers: `accepted` (indices the core took), `record`, `state`, `next`, and with `messages: true` every core message on the way, unredacted, with `repeats` |
| `replay` | `spec`, `answers` | `messages` (every core message, prompts included, unredacted), `repeats`, `winner`, `winReason`, `turn`, `lp`, `errors` |
| `view` | `duel`, `viewer` | `view` (`viewer: "judge"`: every hand and face-down card) |
| `contents` | `duel`, `team`, `pile` | `codes`: a pile in order (a Deck from the top) |
| `destroy` | `duel` | |
| `stats` | | `duels`, `pid`, `memory` |

`spec` is `{format, decks: [{main, extra}, ...], seed?: [4 decimal strings], shuffle?, place?, lp?, draws?}`: `format` a ruleset id or `{id, ...fields to change}`; decks[0] takes the first turn; `shuffle: false` keeps deck order; `place`, `lp` and `draws` set up a board (tests, puzzles). A record's spec is `{format, decks: record.decks, seed: record.seed, shuffle: false}`: the same core build and card data give the same duel from it.

A **frame** (`next`, `state`) is what a host needs after one step: `events` (each `{p: message}` when everyone may see it as it is, else `{s: [as player 0, as player 1, as a spectator], j: unredacted}`, a null where it is none of that viewer's business), `prompt` (`{seq, view: the question as its player may see it, judge: unredacted}`; `seq` changes when the question does), `hint` (each player's selection hint), `turn`, `turnPlayer`, `phase`, `lp`, `chain`, `attack`, `window` (what the response window being asked is about: summons, chain links and their targets, the battle step; for a host's auto-pass), `winner`, `winReason`, `errors` (new script errors). Tables are fetched with `views`, once per step a host shows.

Hidden information is decided by `lib/duel.js` (`view`, `promptView`, what effects showed each player) and `lib/redact.js`. A field named `judge`, `view` with `viewer: "judge"`, `contents`, `messages` and the record are unredacted: a host must send them to a judge at the table, or store them, and to nobody else.
