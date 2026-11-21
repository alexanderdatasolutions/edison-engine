import test from "node:test";
import assert from "node:assert/strict";
import { OcgMessageType as M, OcgResponseType as R, OcgLocation as L, SelectIdleCMDAction as I } from "ocgcore-wasm";
import { Duel } from "../lib/duel.js";
import { formats, getCard } from "../lib/data.js";
import { redact, SPECTATOR } from "../lib/redact.js";
import { playOne } from "./fuzz.mjs";
import { answer, makeRng } from "./bot.js";
import { sampleDecks as aiDecks } from "./decks.js";

const edison = formats.get("edison");
const LONEFIRE = 48686504, EXILED = 74131780, ELF = 15025844, TORRENTIAL = 53582587, REBORN = 83764718;
const PILE_OF = { [L.DECK]: "deck", [L.HAND]: "hand", [L.MZONE]: "mzone", [L.SZONE]: "szone", [L.GRAVE]: "grave", [L.REMOVED]: "removed", [L.EXTRA]: "extra" };
const deckOf = (...codes) => ({ main: Array.from({ length: 40 }, (_, i) => codes[i % codes.length]), extra: [] });

// Plays until the turn player may act, passing every optional response on the way.
function toIdle(d) {
  for (let i = 0; i < 50; i++) {
    d.advance();
    if (d.prompt.type === M.SELECT_IDLECMD) return d.prompt;
    assert.equal(d.prompt.type, M.SELECT_CHAIN);
    d.respond({ type: R.SELECT_CHAIN, index: null });
  }
  assert.fail("never reached the main phase");
}

function ignitionOfferedOnSummon(format) {
  const d = new Duel({ format, decks: [deckOf(LONEFIRE), deckOf(ELF)] });
  const idle = toIdle(d);
  d.respond({ type: R.SELECT_IDLECMD, action: I.SELECT_SUMMON, index: 0 });
  let offered = false;
  for (let i = 0; i < 20; i++) {
    d.advance();
    const m = d.prompt;
    if (m.type === M.SELECT_IDLECMD) break;
    if (m.type === M.SELECT_PLACE || m.type === M.SELECT_POSITION) { d.respond(answer(m, makeRng(1))); continue; }
    if (m.type === M.SELECT_CHAIN && m.player === 0 && m.selects.some((c) => c.code === LONEFIRE)) offered = true;
    d.respond({ type: R.SELECT_CHAIN, index: null });
  }
  assert.ok(idle.summons.length > 0);
  d.destroy();
  return offered;
}

test("Edison lets the turn player use an ignition effect straight after a summon; modern rules do not", () => {
  assert.equal(ignitionOfferedOnSummon(edison), true);
  assert.equal(ignitionOfferedOnSummon({ ...edison, duelFlags: ["MODE_MR5"] }), false);
});

test("a player never receives the codes of the opponent's hand, deck or set cards", () => {
  for (let seed = 1; seed <= 15; seed++) {
    playOne(seed, undefined, (duel, events) => {
      for (const viewer of [0, 1]) {
        const them = duel.view(viewer).players[1 - viewer];
        for (const c of them.hand) if (!(c.position & 5)) assert.equal(c.code, 0, "opponent hand card");
        for (const c of [...them.mzone, ...them.szone]) if (c && !(c.position & 5)) assert.equal(c.code, 0, "opponent set card");
        assert.equal(typeof them.deck, "number");
      }
      const p = duel.promptView();
      for (const list of Object.values(p ?? {})) {
        if (!Array.isArray(list)) continue;
        for (const c of list) if (c?.code && c.controller === 1 - p.player && (c.location & (L.HAND | L.MZONE | L.SZONE | L.DECK | L.EXTRA))) {
          const there = duel.view(p.player).players[c.controller][{ 2: "hand", 4: "mzone", 8: "szone" }[c.location]]?.[c.sequence];
          assert.ok(there?.code === c.code || duel.shown[p.player].get(`${c.controller}:${c.location}:${c.sequence}`) === c.code, `prompt ${p.type} names a hidden card`);
        }
      }
    });
  }
});

test("what an effect showed a player stays on the card that was shown, over whole duels: every entry names the card now in its place", () => {
  // The computer's decks, which look at hands and Set cards (Trap Dustshoot, attacks on Set monsters), in an order fixed by the seed.
  let entries = 0;
  const decks = aiDecks();
  for (let g = 0; g < 80; g++) {
    const rnd = makeRng(1000 + g);
    const order = (d) => ({ main: d.main.map((c) => [rnd(), c]).sort((x, y) => x[0] - y[0]).map(([, c]) => c), extra: d.extra });
    const duel = new Duel({ format: edison, decks: [order(decks[g % decks.length].deck), order(decks[(g * 5 + 1) % decks.length].deck)], seed: [BigInt(g + 1), 1n, 2n, 3n], shuffle: false });
    for (let i = 0; i < 5000; i++) {
      duel.advance();
      if (duel.winner !== null) break;
      for (const seen of duel.shown) for (const [key, code] of seen) {
        const [c, l, q] = key.split(":").map(Number);
        if (!PILE_OF[l]) continue; // a material: always seen
        const codes = duel.contents(c, PILE_OF[l]);
        entries++;
        assert.equal((l === L.DECK ? codes.reverse() : codes)[q], code, `game ${g}: shown ${key} is still the card that was shown`);
      }
      duel.respond(answer(duel.prompt, rnd));
    }
    duel.destroy();
  }
  assert.ok(entries > 10, `${entries} shown cards checked`);
});

test("a card shown in a hand stays named on that card when the hand closes up, and never on another copy that slid into its place", () => {
  // A hand of nothing but Lonefire Blossoms for player 0. The core sends a pile's cards by place, so when a card leaves the hand the ones after it move down.
  const duel = new Duel({ format: edison, decks: [deckOf(LONEFIRE), deckOf(ELF)] });
  duel.advance();
  assert.ok(duel.contents(0, "hand").length >= 5 && duel.contents(0, "hand").every((c) => c === LONEFIRE));
  const inHand = (sequence) => ({ code: LONEFIRE, controller: 0, location: L.HAND, sequence });
  const leaves = (sequence) => ({ type: M.MOVE, card: LONEFIRE, from: { controller: 0, location: L.HAND, sequence, position: 10 }, to: { controller: 0, location: L.GRAVE, sequence: 0, position: 10 }, reason: 0 });
  // The card shown to player 1 is sent to the Graveyard: the copy that is now first in the hand was never shown.
  duel.track({ type: M.CONFIRM_CARDS, player: 1, cards: [inHand(0)] });
  duel.track(leaves(0));
  assert.equal(duel.canSee(1, inHand(0)), false, "a copy nobody saw is not named");
  // The card before the shown one leaves: the shown card is now one place earlier, and named there only.
  duel.track({ type: M.CONFIRM_CARDS, player: 1, cards: [inHand(2)] });
  duel.track(leaves(0));
  assert.equal(duel.canSee(1, inHand(1)), true, "the shown card, one place down");
  assert.equal(duel.canSee(1, inHand(2)), false, "the copy that came after it");
  duel.destroy();
});

/** Every card code a redacted message carries, by where it sits in the message. */
function codesIn(m, at = "", out = new Map()) {
  if (m === null || typeof m !== "object") return out;
  for (const [k, v] of Object.entries(m)) {
    if ((k === "code" || k === "card") && typeof v === "number") { if (v) out.set(`${at}${k}`, v); } else if (typeof v === "object") codesIn(v, `${at}${k}.`, out);
  }
  return out;
}

test("a spectator never receives the code of a card that is not public: the table and every event, over whole duels", () => {
  const PILES = ["hand", "mzone", "szone", "grave", "removed", "extra"];
  let events = 0, named = 0, blanked = 0;
  for (let seed = 1; seed <= 25; seed++) {
    playOne(seed, undefined, (duel, msgs) => {
      // The table: nothing hidden from either player is shown, and nothing is shown that both players cannot see.
      const neutral = duel.view(SPECTATOR), seen = [duel.view(0), duel.view(1)];
      neutral.players.forEach((side, p) => {
        for (const c of side.hand) if (!(c.position & 5)) assert.equal(c.code, 0, "a card in hand");
        for (const c of [...side.mzone, ...side.szone]) if (c && !(c.position & 5)) assert.equal(c.code, 0, "a set card");
        for (const c of side.extra) assert.equal(c.code, 0, "an Extra Deck card");
        for (const c of side.removed) if (!(c.position & 5)) assert.equal(c.code, 0, "a card banished face-down");
        assert.equal(typeof side.deck, "number", "a Deck is only a count");
        for (const pile of PILES) side[pile].forEach((c, i) => { if (c?.code) for (const v of seen) assert.equal(v.players[p][pile][i].code, c.code, `${pile} ${i}: shown to a spectator but not to both players`); });
      });
      // The events: no question, nothing addressed to one player, and no card named that either player is not also told.
      for (const m of msgs) {
        const s = redact(m, SPECTATOR), forPlayers = [redact(m, 0), redact(m, 1)];
        if (!s) continue;
        events++;
        assert.ok(![M.CONFIRM_CARDS, M.CONFIRM_DECKTOP, M.CONFIRM_EXTRATOP, M.MISSED_EFFECT].includes(s.type), "shown to one player only");
        if (s.type === M.HINT) { assert.ok(![1, 2, 3, 5].includes(s.hint_type), "a hint for one player"); continue; } // what is left is a player's public declaration
        assert.ok(forPlayers[0] && forPlayers[1], `message ${s.type} goes to a spectator but not to both players`);
        if (s.type === M.DRAW) for (const c of s.drawn) if (!(c.position & 5)) assert.equal(c.code, 0, "a drawn card");
        if (s.type === M.SET) assert.equal(s.code, 0, "a set card");
        if (s.type === M.SPSUMMONING && !(s.position & 5)) assert.equal(s.code, 0, "a monster Special Summoned face-down");
        for (const [where, code] of codesIn(s)) { named++; for (const f of forPlayers) assert.equal(codesIn(f).get(where), code, `message ${s.type} ${where}: named to a spectator but not to both players`); }
        if (s.type === M.MOVE && !s.card) blanked++;
      }
    });
  }
  assert.ok(events > 5000 && named > 1000 && blanked > 100, `${events} events, ${named} codes compared, ${blanked} moves blanked`);
});

test("300 random duels finish with no script errors and no stuck prompts", () => {
  for (let seed = 1; seed <= 300; seed++) {
    const r = playOne(seed);
    assert.equal(r.stuck, null, `seed ${seed} stuck`);
    assert.deepEqual(r.errors, [], `seed ${seed}`);
    assert.notEqual(r.winner, null, `seed ${seed} did not end`);
  }
});
