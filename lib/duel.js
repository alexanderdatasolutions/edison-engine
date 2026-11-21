// One duel on the EDOPro core. The core decides everything; this file feeds it decks and answers,
// and turns its state into what each player is allowed to see.
import createCore, { OcgDuelMode, OcgProcessResult, OcgMessageType as M, OcgLocation as L, OcgPosition as P, OcgQueryFlags as Q } from "ocgcore-wasm";
import { randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { getCard, readScript, dataVersion, root } from "./data.js";
import { newWindow, trackWindow } from "./window.js";

// The engine is our patched build of the core (vendor/ocgcore/BUILD.md), run by the package's own loader.
// OCGCORE_WASM=<path> runs another build; OCGCORE_WASM=package runs the unpatched one inside ocgcore-wasm.
const wasm = process.env.OCGCORE_WASM ?? new URL("../vendor/ocgcore/ocgcore.sync.wasm", import.meta.url);
const wasmBinary = wasm === "package" ? null : readFileSync(wasm);
const core = await createCore({ sync: true, ...(wasmBinary ? { wasmBinary } : {}) });
/** This engine's own commit: EDISON_ENGINE_COMMIT when the host knows it (an npm install has no .git), else this checkout's HEAD. */
const commit = () => { try { return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return "unknown"; } };
/**
 * What decided the rulings: the core build and the card data (a recorded duel replays only on the same three), this engine's commit
 * (which holds the Edison scripts), and the host's commit (`server`, RENDER_GIT_COMMIT).
 */
export const engineVersion = { core: wasmBinary ? createHash("sha256").update(wasmBinary).digest("hex").slice(0, 16) : "package", ...dataVersion,
  engine: (process.env.EDISON_ENGINE_COMMIT || commit()).slice(0, 12), server: process.env.RENDER_GIT_COMMIT?.slice(0, 12) ?? "local" };
const json = (x) => JSON.parse(JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
const QUERY = Q.CODE | Q.POSITION | Q.ATTACK | Q.DEFENSE | Q.COUNTERS | Q.EQUIP_CARD | Q.OVERLAY_CARD | Q.STATUS | Q.LEVEL;
const FACEUP = P.FACEUP_ATTACK | P.FACEUP_DEFENSE;
const HINT_SELECTMSG = 3;
const PILES = { deck: L.DECK, hand: L.HAND, mzone: L.MZONE, szone: L.SZONE, grave: L.GRAVE, removed: L.REMOVED, extra: L.EXTRA };

// Duel flags our build of the core adds to upstream's (vendor/ocgcore/patches); the unpatched core ignores them.
const EDISON_FLAGS = { EDISON_IGNITION_PRIORITY: 1n << 48n, EDISON_LP_COST: 1n << 49n, EDISON_DAMAGE_STEP_CHAINS: 1n << 50n };
const flagBit = (name) => {
  const bit = OcgDuelMode[name] ?? EDISON_FLAGS[name];
  if (bit === undefined) throw new Error(`unknown duel flag ${name}`);
  return bit;
};

/**
 * The viewer that is a judge at the table: `view(JUDGE)` shows every hand and every face-down card on the table or banished.
 * Decks and Extra Decks stay closed even to a judge until they ask (`contents`). A host must send what this returns to a judge and nobody else.
 */
export const JUDGE = "judge";
export const revive = (r) => (r && Array.isArray(r.races) ? { ...r, races: r.races.map(BigInt) } : r);

export const isPrompt = (m) => (m.type >= M.SELECT_BATTLECMD && m.type <= M.SELECT_UNSELECT_CARD) || (m.type >= M.ANNOUNCE_RACE && m.type <= M.ANNOUNCE_NUMBER) || m.type === M.ROCK_PAPER_SCISSORS;

export class Duel {
  /**
   * @param {{format: any, decks: {main: number[], extra: number[]}[], seed?: bigint[], shuffle?: boolean, place?: {team: number, code: number, location: number, sequence?: number, position?: number}[], lp?: number[], draws?: number[]}} o
   *   decks[0] takes the first turn. `shuffle: false` keeps deck order (first listed is drawn first) and `place` puts cards straight onto the table;
   *   `lp` and `draws` (cards drawn per turn) by team replace the format's. All of these are for tests and puzzles.
   */
  constructor({ format, decks, seed, shuffle = true, place = [], lp, draws }) {
    this.format = format;
    this.errors = [];
    this.lp = [0, 1].map((t) => lp?.[t] ?? format.startingLP);
    this.turn = 0; this.turnPlayer = 0; this.phase = 0;
    this.chain = [];
    this.window = newWindow(); // what the response window being asked is about, for the players' stops (lib/window.js)
    this.winner = null; // 0 | 1 | 2 (draw)
    this.winReason = null; // the core's victory string number, or "surrender" or "time" (set by the room)
    this.prompt = null; // the select message the core is waiting on
    this.hint = [0, 0]; // per team: the select hint the core sent since the last answer, which words the prompt that follows it
    this.attack = null; // { card, target } from an attack's declaration until that battle is over
    this.shown = [new Map(), new Map()]; // cards an effect has shown each player, until the chain or phase ends
    const team = (t) => ({ startingLP: this.lp[t], startingDrawCount: format.startingHand, drawCountPerTurn: draws?.[t] ?? format.drawPerTurn });
    const flags = format.duelFlags.reduce((f, n) => f | flagBit(n), 0n);
    seed ??= Array.from({ length: 4 }, () => randomBytes(8).readBigUInt64LE());
    const order = decks.map((deck) => ({ main: shuffle ? shuffled(deck.main) : [...deck.main], extra: [...deck.extra] })); // main in the order it will be drawn
    // Everything needed to play this duel again move for move: see replay(). Tests that place cards by hand are not replayable.
    this.record = { format: format.id, flags: format.duelFlags, engine: engineVersion, seed: seed.map(String), decks: order, started: Date.now(), answers: [] };
    this.h = core.createDuel({
      flags, seed, team1: team(0), team2: team(1),
      cardReader: (code) => getCard(code)?.core ?? null,
      scriptReader: (name) => readScript(name, format.scriptDirs) ?? "",
      errorHandler: (_type, text) => this.errors.push(text),
    });
    if (!this.h) throw new Error("core refused to create the duel");
    for (const f of ["constant.lua", "utility.lua"]) core.loadScript(this.h, f, readScript(f));
    const init = readScript("init.lua", format.scriptDirs); // a format's own rules, when one of its script folders has this file
    if (init) core.loadScript(this.h, "init.lua", init);
    order.forEach((deck, team) => {
      const add = (code, location) => core.duelNewCard(this.h, { team, duelist: 0, code, controller: team, location, sequence: 0, position: P.FACEDOWN_DEFENSE });
      for (const code of [...deck.main].reverse()) add(code, L.DECK);
      for (const code of deck.extra) add(code, L.EXTRA);
    });
    for (const c of place) core.duelNewCard(this.h, { team: c.team, duelist: 0, code: c.code, controller: c.team, location: c.location, sequence: c.sequence ?? 0, position: c.position ?? P.FACEUP_ATTACK });
    core.startDuel(this.h);
  }

  /** Runs the core until it needs an answer or the duel ends. Returns the messages it produced. */
  advance() {
    const out = [];
    while (this.winner === null) {
      const status = core.duelProcess(this.h);
      for (const m of core.duelGetMessage(this.h)) {
        this.track(m);
        if (m.type === M.RETRY) continue; // the prompt stays as it was; the caller asks again
        if (isPrompt(m)) this.prompt = m; else out.push(m);
      }
      if (status !== OcgProcessResult.CONTINUE) break;
    }
    return out;
  }

  /** Hands the core an answer to the current prompt. False when the answer could not even be encoded. */
  respond(response) {
    try { core.duelSetResponse(this.h, response); } catch { return false; }
    this.record.answers.push({ p: this.prompt?.player ?? null, at: Date.now() - this.record.started, r: json(response) });
    this.hint = [0, 0];
    return true;
  }

  track(m) {
    trackWindow(this.window, m);
    switch (m.type) {
      case M.NEW_TURN: this.turn++; this.turnPlayer = m.player; this.attack = null; break;
      case M.NEW_PHASE: this.phase = m.phase; this.attack = null; this.shown.forEach((s) => s.clear()); break;
      case M.HINT: if (m.hint_type === HINT_SELECTMSG && (m.player === 0 || m.player === 1)) this.hint[m.player] = m.hint; break;
      case M.ATTACK: this.attack = { card: m.card, target: m.target }; break;
      case M.ATTACK_DISABLED: case M.DAMAGE_STEP_END: this.attack = null; break;
      case M.DAMAGE: case M.PAY_LPCOST: this.lp[m.player] = Math.max(0, this.lp[m.player] - m.amount); break;
      case M.RECOVER: this.lp[m.player] += m.amount; break;
      case M.LPUPDATE: this.lp[m.player] = m.lp; break;
      case M.CHAINING: this.chain.push({ code: m.code, controller: m.controller }); break;
      case M.CHAIN_NEGATED: case M.CHAIN_DISABLED: { const link = this.chain[m.chain_size - 1]; if (link) link.negated = true; break; } // CHAIN_SOLVED still follows
      case M.CHAIN_SOLVED: this.chain.pop(); break;
      case M.CHAIN_END: this.chain = []; this.shown.forEach((s) => s.clear()); break;
      case M.CONFIRM_CARDS: for (const c of m.cards) this.shown[m.player].set(`${c.controller}:${c.location}:${c.sequence}`, c.code); break;
      case M.SHUFFLE_HAND: case M.SHUFFLE_SET_CARD: case M.TAG_SWAP: case M.REMOVE_CARDS: this.shown.forEach((s) => s.clear()); break;
      // A shown card is kept by where it is, so where it is follows the cards: a pile closes up behind a card that leaves it and opens
      // where one comes in (checked over whole duels in test/duel.test.mjs); a zone is emptied or filled. Otherwise, after a card left the
      // hand, another copy that slid into a shown card's place would be named although nobody saw it.
      case M.MOVE: this.reseat(m.from, -1); this.reseat(m.to, 1); break;
      case M.SWAP: this.reseat(m.card1, 0); this.reseat(m.card2, 0); break;
      case M.DRAW: case M.SHUFFLE_DECK: case M.SHUFFLE_EXTRA: case M.SWAP_GRAVE_DECK: case M.DECK_TOP: case M.REVERSE_DECK:
        this.forgetPiles(m.player); break;
      case M.WIN: this.winner = m.player; this.winReason = m.reason; this.prompt = null; break;
    }
  }

  /** A card left (`step` -1) or came into (+1) `at`, or was swapped (0): moves what each player was shown there to where those cards now are. */
  reseat({ controller, location, sequence }, step) {
    if (location & L.OVERLAY) return; // a material is always seen (canSee)
    const pile = !(location & (L.MZONE | L.SZONE));
    for (const seen of this.shown) {
      const moved = [];
      for (const [key, code] of seen) {
        const [c, l, q] = key.split(":").map(Number);
        if (c !== controller || l !== location) continue;
        if (q === sequence && step <= 0) seen.delete(key);
        else if (pile && step && (step < 0 ? q > sequence : q >= sequence)) { seen.delete(key); moved.push([q + step, code]); }
        else if (q === sequence) seen.delete(key); // a card came into a zone where one was shown
      }
      for (const [q, code] of moved) seen.set(`${controller}:${location}:${q}`, code);
    }
  }

  /** A Deck or Extra Deck changed order or its top: nothing shown in `player`'s (or, when unsaid, anyone's) Deck or Extra Deck is still where it was. */
  forgetPiles(player) {
    for (const seen of this.shown) for (const key of seen.keys()) {
      const [c, l] = key.split(":").map(Number);
      if ((player === undefined || c === player) && (l & (L.DECK | L.EXTRA))) seen.delete(key);
    }
  }

  /**
   * The current prompt as its player may see it. The core lists every selectable card with its code,
   * including the opponent's set cards and hand, so those codes are blanked unless an effect showed them.
   */
  promptView() {
    const m = this.prompt;
    if (!m) return null;
    const out = { ...m };
    for (const [key, list] of Object.entries(m)) {
      if (!Array.isArray(list) || typeof list[0]?.controller !== "number") continue;
      out[key] = list.map((c) => (c.code && c.controller !== m.player && !this.canSee(m.player, c) ? { ...c, code: 0 } : c));
    }
    return out;
  }

  canSee(player, c) {
    if (c.location === L.GRAVE) return true;
    if (this.shown[player].get(`${c.controller}:${c.location}:${c.sequence}`) === c.code) return true;
    if (c.location & (L.DECK | L.EXTRA | L.OVERLAY)) return c.location === L.OVERLAY;
    const q = core.duelQuery(this.h, { controller: c.controller, location: c.location, sequence: c.sequence, overlaySequence: 0, flags: Q.POSITION });
    return ((q?.position ?? 0) & FACEUP) !== 0;
  }

  /** The whole table as `viewer` (0 or 1, a spectator, or JUDGE) may see it. A card's code is 0 when it is hidden from them. */
  view(viewer) {
    const all = viewer === JUDGE;
    const players = [0, 1].map((p) => {
      const side = { lp: this.lp[p] };
      for (const [name, location] of Object.entries(PILES)) {
        const cards = core.duelQueryLocation(this.h, { controller: p, location, flags: QUERY });
        if (name === "deck") { side.deck = cards.length; continue; }
        side[name] = cards.map((c, sequence) => {
          if (!c) return null; // an empty zone
          const faceup = (c.position & FACEUP) !== 0;
          const visible = (all && name !== "extra") || name === "grave" || (faceup && name !== "extra") || (p === viewer && name !== "removed") || (name === "removed" && faceup);
          const card = { code: visible ? c.code : 0, position: c.position, sequence };
          if (faceup && name === "mzone") { card.attack = c.attack; card.defense = c.defense; }
          if (visible && c.counters?.length) card.counters = c.counters;
          if (c.overlayCards?.length) card.overlay = c.overlayCards;
          return card;
        });
      }
      return side;
    });
    return { players, turn: this.turn, turnPlayer: this.turnPlayer, phase: this.phase, chain: this.chain, winner: this.winner, winReason: this.winReason };
  }

  /** The codes of one of `team`'s piles, in order (a Deck from the top down). Hidden information: for a judge who asked, and nobody else. */
  contents(team, name) {
    const codes = core.duelQueryLocation(this.h, { controller: team, location: PILES[name], flags: Q.CODE }).map((c) => c?.code ?? 0);
    return name === "deck" ? codes.reverse() : codes;
  }

  destroy() { if (this.h) core.destroyDuel(this.h); this.h = null; }
}

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = randomBytes(4).readUInt32LE() % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * A live duel built from a record and played up to (not including) answer number `upTo`: the core has been given the first `upTo`
 * answers and not yet advanced past the last of them. Its own record carries the same seed, decks, start time and those answers,
 * so it can be played on and stored as one game. `messages`, when given, collects every core message on the way, prompts included.
 * This is what a replay and a judge's rollback both stand on: the same core build and card data give the same duel.
 */
export function resume(record, format, upTo = record.answers.length, messages = null) {
  const duel = new Duel({ format, decks: record.decks, seed: record.seed.map(BigInt), shuffle: false });
  duel.record.started = record.started;
  for (const a of record.answers.slice(0, upTo)) {
    const out = duel.advance();
    if (messages) { messages.push(...out); if (duel.prompt) messages.push(duel.prompt); }
    if (duel.respond(revive(a.r))) Object.assign(duel.record.answers.at(-1), a); // when it was given and the clocks then, as recorded
  }
  return duel;
}

/**
 * Plays a recorded duel again from its record and returns every core message in order, prompts included.
 * The same core build and card data give the same messages; that is what makes a record a replay.
 */
export function replay(record, format) {
  const messages = [], duel = resume(record, format, record.answers.length, messages);
  messages.push(...duel.advance());
  const end = { winner: duel.winner, winReason: duel.winReason, turn: duel.turn, lp: duel.lp, errors: duel.errors };
  duel.destroy();
  return { messages, ...end };
}
