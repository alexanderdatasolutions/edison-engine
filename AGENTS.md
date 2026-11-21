# edison-engine

The rules engine of edison-sim (the private website at https://edison-sim.onrender.com), as a program of its own. The website starts `server.js` as a child process and speaks the protocol in README.md; it imports nothing from here. This repo is public and AGPL-3.0: everything that touches the core, the Edison patches and the card scripts lives here, and nothing of the website does (no rooms, accounts, ranked, tournaments, AI, packs, UI, card texts or pictures). No game rule is written in JavaScript: where the core is wrong for Edison it is patched in `vendor/ocgcore/patches`, each patch behind its own duel flag, or a card is scripted in `formats/edison-scripts`.

## Run

    npm install && npm run fetch-data   # Project Ignis card scripts and card database into data/ (pinned commits)
    npm test                            # the rules suite, about 25 s
    node test/fuzz.mjs 600              # bot-vs-bot duels with random decks; prints script errors and stuck questions
    OCGCORE_WASM=package npm test       # the unpatched core from ocgcore-wasm: the tests of patched rules then fail

## Layout

- `server.js`: the program. Reads requests from stdin, one JSON object per line, answers each on stdout in order (README.md, Protocol). Holds every duel by the id the host gave it. `frame()` is what a host needs after one step; the tables are a separate `views` request because a host that answers a window at once (auto-pass) never shows that step, and the tables are most of a step's cost.
- `lib/duel.js`: one duel on the core. `advance()` runs it to the next question, `respond()` answers, `view(viewer)` and `promptView()` are what a player, a spectator (`-1`) or a judge (`JUDGE`) may see; `resume(record, format, upTo)` and `replay(record, format)` play a record again; `engineVersion` is the core build's hash, the card data's commits, this engine's commit and the host's.
- `lib/redact.js`: what each viewer may know of one core message. `lib/window.js`: what a response window is about (kept from public messages; a host's auto-pass reads it).
- `lib/data.js`: the card database (only what the core reads), the scripts (`readScript`: each of a format's `scriptDirs` in order; a `./` entry is a folder in this repo, any other is under `data/scripts`), the rulesets.
- `vendor/ocgcore/`: the core we run: upstream plus our Edison patches, built to wasm and committed. `BUILD.md` there has the commits, the patches and the build.
- `formats/<id>.json`: a ruleset: core flags, script folders, life points, hand and draw, deck sizes, card pool, banlist. A new format is a new file here. The names and texts a format printed and its card rulings are the website's (they decide what a player reads, not how a card plays).
- `formats/edison-scripts/`: Edison's own card scripts, tried before upstream's. `c<passcode>.lua` is a card played by its 2010 text: a copy of the upstream script with only the 2010 difference changed, named in its third header line. `init.lua` is loaded once per duel after `utility.lua` and holds rules for groups of cards. `test/edison-errata.test.mjs` has one test per card, each run against the Edison and the upstream script.
- `test/scenario.js`: sets up an exact board and walks a duel. `test/edison-rules.test.mjs`: one test per Edison ruling, played under the Edison flags and, where they differ, under modern rules or with one flag changed. A ruling the core gets wrong stays in as a `todo` test whose assertions are the Edison ruling. `edison-priority`, `edison-mechanics`, `edison-rulings-*` (by card name), `edison-engine` (the build and its flags), `duel.test.mjs` (hidden information over whole duels), `replay.test.mjs`, `server.test.mjs` (the protocol through a real process). `test/bot.js` is a legal random answer for every question type: the reference for answer shapes. `test/decks/` are the website's sample decks.

## Card rulings

The authority for how a card plays in Edison is https://www.edisonformat.com/rulings (Individual Card Rulings A-Z and Relevant Errata, compiled from the UDE FAQ and Konami rulings documents). Check it before scripting or changing any card; a printed text alone is not enough (Anteatereatingant's 2010 print has no "once per turn", its ruling does). A card's shown text must be what the engine does: a card whose 2010 text plays differently from its current script needs a script here and a test. The website pins the sentence of the 2010 text each Edison script is there for (its `test/edison-text.test.mjs` reads this repo's `formats/edison-scripts/`), so a new Edison script is also an entry there. The card database's text is not always the current print: where it says "The above text is unofficial and describes the card's functionality in the OCG", the script follows the OCG and the 2010 English text may say something else.

## Hidden information

The core hands the engine everything. A player must never receive the code of a card they cannot see. `view()`, `promptView()` and `redact()` are the only places that decide this, and `test/duel.test.mjs` checks them over whole duels. A hidden card has `code: 0`. A card an effect showed one player (`CONFIRM_CARDS`: Trap Dustshoot's look at a hand, a searched card) is named in that player's questions until the chain or phase ends or the pile is shuffled; `Duel.shown` keeps it by place and code and moves the place with every card that leaves or enters the pile, so another copy that slides into its place is never named. A spectator (`-1`) is told only what both players can see. The unredacted things a host gets are named: a frame's `judge` fields, `view` with `viewer: "judge"`, `contents`, the `messages` of `resume` and `replay`, and the record. The website sends those to a judge at the table or to storage only.

## Changing the engine

1. A branch and a pull request here. `npm test` and `node test/fuzz.mjs 600` (0 stuck, no new script errors) before it merges. A change to how a card or rule plays comes with its test.
2. In edison-sim, bump the pin: `npm install github:alexanderdatasolutions/edison-engine#<full commit>` (package.json and package-lock.json both name the commit), then its `npm test` and `node test/fuzz.mjs 200` through the process boundary, and deploy. The site links this repo at the pinned commit (footer, /about).
3. A recorded duel replays only on the same core build and card data (`engineVersion.core`, `scripts`, `cards`). A change to those, or to an Edison script, can make a game being played when it deploys rebuild differently; the website checks every rebuilt game against a hash of the table and calls off one that differs.

To work on both at once: in edison-sim, `npm install ../edison-engine` links this checkout (or set `EDISON_ENGINE_DIR=../edison-engine`); put the pin back before committing there.

## Protocol rules

- One request at a time; the host waits for each reply (edison-sim blocks on it). Keep every op fast: an answer and its step measured 0.14 ms through the pipe, the tables one more round trip of about 0.28 ms (M-series Mac).
- stdout is the protocol only (`console.log` goes to stderr). The server exits when stdin closes.
- A protocol change is backwards compatible or bumps `PROTOCOL` and the website's client in the same release.
