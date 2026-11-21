// Card rulings F-H: each test states a ruling from https://www.edisonformat.com/rulings ("Individual Card Rulings [F-H]")
// and plays it under the Edison scripts and, where they differ, under the current-text scripts.
import test from "node:test";
import assert from "node:assert/strict";
import { scenario, run, act, edison, M, R, L, P, I, B } from "./scenario.js";

const current = { ...edison, scriptDirs: edison.scriptDirs.filter((d) => !d.startsWith("./")) };

/** Walks a duel through `steps` in order (see test/edison-errata.test.mjs). Returns {done, seen}. */
function play(d, steps, lastTurn = 1) {
  let done = 0;
  const seen = run(d, (m) => {
    for (;;) {
      if (done >= steps.length || d.turn > lastTurn) return "stop";
      let r = steps[done](m, d);
      if (r === undefined && steps[done].optional && done + 1 < steps.length && (r = steps[done + 1](m, d)) !== undefined) done++;
      if (r !== undefined) done++;
      if (r !== null) return r;
    }
  }, 1000);
  return { done, seen };
}
const maybe = (step) => Object.assign((m, d) => step(m, d), { optional: true });
const both = (fn) => ({ edison: fn(edison), current: fn(current) });

const idle = (m) => m.type === M.SELECT_IDLECMD;
const offers = (m, code) => idle(m) && m.activates.some((c) => c.code === code);
const zone = (d, team, name) => d.view(team).players[team][name].filter(Boolean).map((c) => c.code);
const moved = (seen, code, to, from) => seen.filter((e) => e.type === M.MOVE && e.card === code && e.to.location === to && (from === undefined || e.from.location === from)).length;
const chained = (seen, code) => seen.filter((e) => e.type === M.CHAINING && e.code === code).length;
const monster = (d, team, code) => d.view(team).players[team].mzone.find((c) => c?.code === code);
// steps
const activate = (code) => (m) => act.activate(m, code);
const summon = (code) => (m) => act.summon(m, code);
const special = (code) => (m) => act.special(m, code);
const pick = (...codes) => (m) => act.pick(m, ...codes);
const chain = (code) => (m) => act.chain(m, code);
const peek = (fn) => (m, d) => (idle(m) ? (fn(m, d), null) : undefined);
const look = (fn) => (m, d) => (idle(m) ? (fn(m, d), "stop") : undefined);
const turn = (n) => (m, d) => (d.turn >= n && idle(m) ? null : undefined);
const flip = (code) => (m) => { if (!idle(m)) return; const index = m.pos_changes.findIndex((c) => c.code === code); return index < 0 ? undefined : { type: R.SELECT_IDLECMD, action: I.SELECT_POS_CHANGE, index }; };
const toBattle = (m) => act.toBattle(m);
const attack = (code) => (m) => act.attack(m, code);
const fieldSpell = (code) => [, , , , , { code, position: P.FACEUP }];
const up = (code) => ({ code, position: P.FACEUP });

// Picks one of a card's effects by its string number (aux.Stringid(code, n) is code << 20 | n).
const activateEffect = (code, n) => (m) => { if (!idle(m)) return; const index = m.activates.findIndex((c) => c.code === code && Number(c.description) === code * 2 ** 20 + n); return index < 0 ? undefined : { type: R.SELECT_IDLECMD, action: I.SELECT_ACTIVATE, index }; };

const FILLER = 15025844, ELF = FILLER, VORSE = 14898066, DARK_HOLE = 53129443, MST = 5318639, KURIBOH = 40640057;
const BABOON = 46668237, RAT = 97017120, HONEST = 37742478, GATEWAY = 27970830, YAICHI = 64398890, GRANDMASTER = 83039729, KAMON = 90397998;

// "You can only activate the effect of 1 \"Green Baboon, Defender of the Forest,\" even if multiple copies are available in your hand/Graveyard."
// "The (1) Effect CANNOT ACTIVATE: during the Damage Step" (Individual Card Rulings F-H: Green Baboon, Defender of the Forest)
test("Green Baboon, Defender of the Forest: only 1 copy activates for a destroyed Beast, and not in the Damage Step", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [RAT], hand: [BABOON, DARK_HOLE], grave: [BABOON] }, {}], format);
    const { seen } = play(d, [activate(DARK_HOLE), chain(BABOON), maybe(chain(BABOON)), look(() => {})]);
    const out = { chained: chained(seen, BABOON), lp: d.view(0).players[0].lp };
    d.destroy();
    const b = scenario([{ mzone: [RAT], hand: [BABOON] }, { mzone: [VORSE] }], format);
    const battle = play(b, [turn(2), toBattle, attack(VORSE), look(() => {})], 2);
    out.damageStep = chained(battle.seen, BABOON);
    b.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { chained: 1, lp: 7000, damageStep: 0 });
  assert.deepEqual(r.current, { chained: 2, lp: 6000, damageStep: 0 });
});

// "This effect can activate in Substep 1 - Start of the Damage Step, Substep 3 - Before Damage Calculation, or Substep 4 - Damage Calculation."
// (Individual Card Rulings F-H: Honest)
// Not scripted: a damage-calculation window for Honest breaks the battle-phase ruling pinned in test/edison-rules.test.mjs
// ("Honest vs Honest ... once that chain resolves no new chain can be started"); left to the general-mechanics audit.
test("Honest: can be activated during damage calculation", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [ELF], hand: [HONEST, KURIBOH] }, { mzone: [VORSE] }], format);
    // The defender passes (the quiet default) until damage calculation, activates Kuriboh there, then chains Honest to it
    const mine = (code) => (m) => (m.type === M.SELECT_CHAIN && m.player === 0 ? act.chain(m, code) : undefined);
    const { seen } = play(d, [turn(2), toBattle, attack(VORSE), mine(KURIBOH), mine(HONEST), turn(3)], 3);
    const out = { honest: chained(seen, HONEST), vorse: zone(d, 1, "grave").includes(VORSE) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { honest: 1, vorse: true });
  assert.deepEqual(r.current, { honest: 0, vorse: false });
});

// "\"Gateway of the Six\" must remain face-up on the field in order to resolve this effect." (Individual Card Rulings F-H: Gateway of the Six)
test("Gateway of the Six: a counter effect does nothing if the Gateway is destroyed in response (the core already does this)", () => {
  const r = both((format) => {
    const d = scenario([{ szone: [up(GATEWAY)], hand: [YAICHI, GRANDMASTER], deck: [FILLER, KAMON] }, { szone: [MST] }], format);
    const { done } = play(d, [summon(YAICHI), special(GRANDMASTER), activateEffect(GATEWAY, 1), chain(MST), pick(GATEWAY), look(() => {})]);
    const out = { done, searched: zone(d, 0, "hand").includes(KAMON) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r, { edison: { done: 6, searched: false }, current: { done: 6, searched: false } });
});

const FLIP_FLOP = 81278754, TAIYOU = 38699854, WATCHER = 26084285, MORPHING_JAR = 33508719, FREED_BRAVE = 16556849, COMPULSORY = 94192409;
const FIRE_SORCERER = 27132350, SECUTOR = 77642288, TEST_TIGER = 92373006, LAQUARI = 78868776, HOPLOMUS = 4253484, DIMACARI = 31247589;

// "The \"once per turn\" restriction is reset by additional flips (by \"Book of Moon\" & \"Book of Taiyou\")." (Individual Card Rulings F-H: Flip Flop Frog)
test("Flip Flop Frog: flipped face-up again by Book of Taiyou, it can flip itself face-down again that turn", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [FLIP_FLOP], hand: [TAIYOU] }, { mzone: [VORSE] }], format);
    let again = null;
    const { done } = play(d, [activate(FLIP_FLOP), activate(TAIYOU), pick(FLIP_FLOP), look((m) => (again = offers(m, FLIP_FLOP)))]);
    d.destroy();
    return { done, again };
  });
  assert.deepEqual(r.edison, { done: 4, again: true });
  assert.deepEqual(r.current, { done: 4, again: false });
});

// "You cannot activate \"Gravekeeper's Watcher\" during the Damage Step (such as against a \"Morphing Jar\" that is flipped by an attack)."
// (Individual Card Rulings F-H: Gravekeeper's Watcher)
test("Gravekeeper's Watcher: cannot negate a Morphing Jar flipped by an attack", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [{ code: MORPHING_JAR, position: P.FACEDOWN_DEFENSE }], hand: [FILLER] }, { mzone: [VORSE], hand: [WATCHER] }], format);
    let offered = false;
    const watch = (m) => { if (m.type === M.SELECT_CHAIN && m.selects.some((c) => c.code === WATCHER)) offered = true; };
    play(d, [turn(2), toBattle, attack(VORSE), (m, d) => (watch(m), d.turn > 2 ? "stop" : undefined)], 2);
    d.destroy();
    return offered;
  });
  assert.deepEqual(r, { edison: false, current: true });
});

// "If Freed is flipped face-down / leaves the field, the target is still destroyed." (Individual Card Rulings F-H: Freed the Brave Wanderer)
test("Freed the Brave Wanderer: the target is destroyed even if Freed left the field in response", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [FREED_BRAVE], grave: [ELF, ELF], szone: [COMPULSORY] }, { mzone: [VORSE] }], format);
    const { done } = play(d, [activate(FREED_BRAVE), maybe(pick(ELF, ELF)), pick(VORSE), chain(COMPULSORY), pick(FREED_BRAVE), look(() => {})]);
    const out = { done, vorse: zone(d, 1, "grave").includes(VORSE), freed: zone(d, 0, "hand").includes(FREED_BRAVE) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { done: 6, vorse: true, freed: true });
  assert.deepEqual(r.current, { done: 6, vorse: false, freed: true });
});

// "Removing 2 cards from your hand is part of the resolution of this card's Flip Effect, not part of the cost."
// "If you have fewer than 2 cards in your hand when this card is flipped face-up its Flip Effect is not activated." (Individual Card Rulings F-H: Fire Sorcerer)
test("Fire Sorcerer: the 2 cards leave the hand when the Flip Effect resolves, and it does not activate with fewer than 2", () => {
  const r = both((format) => {
    const run1 = (hand) => {
      const d = scenario([{ mzone: [{ code: FIRE_SORCERER, position: P.FACEDOWN_DEFENSE }], hand }, {}], format);
      const { seen } = play(d, [flip(FIRE_SORCERER), look(() => {})]);
      const solving = seen.findIndex((e) => e.type === M.CHAIN_SOLVING);
      const removed = seen.findIndex((e) => e.type === M.MOVE && e.from.location === L.HAND && e.to.location === L.REMOVED);
      const out = { chained: chained(seen, FIRE_SORCERER), removedAtResolution: removed < 0 ? null : removed > solving, lp: d.view(0).players[1].lp };
      d.destroy();
      return out;
    };
    return [run1([FILLER]), run1([])]; // plus the card drawn on turn 1
  });
  assert.deepEqual(r.edison, [{ chained: 1, removedAtResolution: true, lp: 7200 }, { chained: 0, removedAtResolution: null, lp: 8000 }]);
  assert.deepEqual(r.current, [{ chained: 1, removedAtResolution: false, lp: 7200 }, { chained: 0, removedAtResolution: null, lp: 8000 }]);
});

// "If you have only 1 available Monster Zone Space, you will still choose 2 “Gladiator Beast” monsters. You will Special Summon one, and the other
// will be destroyed and sent to the Graveyard." (Individual Card Rulings F-H: Gladiator Beast Secutor)
test("Gladiator Beast Secutor: with 1 open Monster Zone, 1 is Summoned and the other is destroyed", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [{ code: ELF, position: P.FACEUP_DEFENSE }] }, { mzone: [TEST_TIGER, LAQUARI, FILLER, FILLER, FILLER], deck: [FILLER, SECUTOR, HOPLOMUS, DIMACARI] }], format);
    play(d, [turn(2), activate(TEST_TIGER), pick(LAQUARI), pick(SECUTOR), toBattle, attack(SECUTOR), maybe(pick(HOPLOMUS, DIMACARI)), maybe(pick(HOPLOMUS)), turn(2)], 2);
    // stop at Main Phase 2
    const out = { mzone: zone(d, 1, "mzone").filter((c) => c === HOPLOMUS || c === DIMACARI).length, grave: zone(d, 1, "grave").filter((c) => c === HOPLOMUS || c === DIMACARI).length };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { mzone: 1, grave: 1 });
  assert.deepEqual(r.current, { mzone: 0, grave: 0 });
});

const FAKE_FEATHER = 22628574, BORA = 49003716, REINFORCEMENTS = 17814387, NECROVALLEY = 47355498;

// "This effect targets 1 Normal Trap Card." "If the effect of the copied Normal Trap Card targets, you have to select the target for the copied
// effect when \"Fake Feather\" resolves. In this case, \"Fake Feather\" targets the Normal Trap Card, as well as the target for the effect."
// (Individual Card Rulings F-H: Fake Feather)
test("Fake Feather: targets the Normal Trap in the Graveyard on activation, and the copied effect's target on resolution", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [ELF], hand: [BORA], szone: [FAKE_FEATHER] }, { grave: [REINFORCEMENTS] }], format);
    const { seen } = play(d, [activate(FAKE_FEATHER), maybe(pick(BORA)), maybe(pick(REINFORCEMENTS)), maybe(pick(ELF)), look(() => {})]);
    const solving = seen.findIndex((e) => e.type === M.CHAIN_SOLVING);
    const targeted = seen.filter((e) => e.type === M.BECOME_TARGET).map((e) => [e.cards.map((c) => c.location), seen.indexOf(e) > solving]);
    const out = { targeted, atk: monster(d, 0, ELF).attack };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { targeted: [[[L.GRAVE], false], [[L.MZONE], true]], atk: 1300 });
  // the current script picks the Trap, then drops it as a target and picks the monster at activation
  assert.deepEqual(r.current, { targeted: [[[L.GRAVE], false], [[L.MZONE], false]], atk: 1300 });
});

test("Fake Feather: negated by Necrovalley, as it targets a card in the Graveyard", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [ELF], hand: [BORA], szone: [FAKE_FEATHER] }, { grave: [REINFORCEMENTS], szone: fieldSpell(NECROVALLEY) }], format);
    play(d, [activate(FAKE_FEATHER), maybe(pick(BORA)), maybe(pick(REINFORCEMENTS)), maybe(pick(ELF)), look(() => {})]);
    const atk = monster(d, 0, ELF).attack;
    d.destroy();
    return atk;
  });
  assert.deepEqual(r, { edison: 800, current: 1300 });
});

const DARIUS = 25924653, BOOK_OF_MOON = 14087893, BESTIARI = 41470137;

// "If 2 or more “Gladiator Beast” battled this turn, their effects will activate and resolve separately. They are not combined onto the same Chain."
// (Individual Card Rulings F-H: Gladiator Beast Laquari, Hoplomus, ...)
test("Gladiator Beasts: two tag-outs at the end of the Battle Phase each start their own Chain (the core already does this)", () => {
  const r = both((format) => {
    const d = scenario([{}, { mzone: [LAQUARI, HOPLOMUS], deck: [FILLER, DIMACARI, BESTIARI] }], format);
    const tagOut = (m) => (m.type === M.SELECT_CHAIN && m.player === 1 && m.selects.length ? act.chain(m, m.selects[0].code) : undefined);
    const { seen } = play(d, [turn(2), toBattle, attack(LAQUARI), attack(HOPLOMUS), tagOut, maybe(tagOut), tagOut, turn(2)], 2);
    const at = (code) => seen.findIndex((e) => e.type === M.CHAINING && e.code === code);
    const [a, b] = [at(LAQUARI), at(HOPLOMUS)].sort((x, y) => x - y);
    const out = { tagged: [at(LAQUARI) >= 0, at(HOPLOMUS) >= 0], chainEndBetween: seen.slice(a, b).some((e) => e.type === M.CHAIN_END) };
    d.destroy();
    return out;
  });
  const out = { tagged: [true, true], chainEndBetween: true };
  assert.deepEqual(r, { edison: out, current: out });
});

// "The target's effects are not negated: ... if Darius is flipped face-down / leaves the field (\"Book of Moon\" / \"Compulsory Evacuation Device\")."
// (Individual Card Rulings F-H: Gladiator Beast Darius)
test("Gladiator Beast Darius: while Darius stays face-up, the monster it Summoned has its effects negated", () => {
  const r = both((format) => {
    const d = scenario([{}, { mzone: [TEST_TIGER, LAQUARI], grave: [DIMACARI], deck: [FILLER, DARIUS] }], format);
    const { done, seen } = play(d, [turn(2), activate(TEST_TIGER), pick(LAQUARI), maybe(pick(DARIUS)), maybe(chain(DARIUS)), pick(DIMACARI), toBattle, attack(DIMACARI), turn(2)], 2);
    const out = { done, attacks: seen.filter((e) => e.type === M.ATTACK).length, tagOut: moved(seen, LAQUARI, L.MZONE, L.DECK) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r, { edison: { done: 9, attacks: 1, tagOut: 0 }, current: { done: 9, attacks: 1, tagOut: 0 } });
});

test("Gladiator Beast Darius: once Darius is flipped face-down, the monster it Summoned has its effects back", () => {
  const r = both((format) => {
    const d = scenario([{}, { mzone: [TEST_TIGER, LAQUARI], grave: [DIMACARI], hand: [BOOK_OF_MOON], deck: [FILLER, DARIUS] }], format);
    const { done, seen } = play(d, [turn(2), activate(TEST_TIGER), pick(LAQUARI), maybe(pick(DARIUS)), maybe(chain(DARIUS)), pick(DIMACARI), activate(BOOK_OF_MOON), pick(DARIUS), toBattle, attack(DIMACARI), attack(DIMACARI), turn(2)], 2);
    const attacks = seen.filter((e) => e.type === M.ATTACK).length;
    const tagOut = seen.filter((e) => e.type === M.MOVE && e.card === LAQUARI && e.to.location === L.MZONE).length;
    d.destroy();
    return { done, attacks, tagOut };
  });
  // Edison: "Dimacari" attacks twice and its tag-out Summons "Laquari"; current: its effects stay negated
  assert.deepEqual(r.edison, { done: 12, attacks: 2, tagOut: 1 });
  assert.deepEqual(r.current, { done: 10, attacks: 1, tagOut: 0 });
});

const DUO = 44763025, GEMINI_IMPS = 67688478, SPIRIT_REAPER = 23205979, HERO_BARRIER = 44676200, AVIAN = 21844576, FREED_GENERAL = 49681811;

// "You cannot activate the effect of “Gemini Imps” during the Damage Step. For this reason it is not possible to activate “Gemini Imps” to negate
// the effect of “Don Zaloog” or “Spirit Reaper” that activate when they inflict Battle Damage" (Individual Card Rulings F-H: Gemini Imps)
test("Gemini Imps: negates Delinquent Duo, but cannot negate Spirit Reaper's discard in the Damage Step", () => {
  const r = both((format) => {
    const imps = (m) => m.type === M.SELECT_CHAIN && m.selects.some((c) => c.code === GEMINI_IMPS);
    const d = scenario([{ hand: [GEMINI_IMPS, FILLER] }, { mzone: [SPIRIT_REAPER] }], format);
    let reaper = false;
    play(d, [turn(2), toBattle, attack(SPIRIT_REAPER), (m, d) => { if (imps(m)) reaper = true; return d.turn > 2 ? "stop" : undefined; }], 2);
    d.destroy();
    const e = scenario([{ hand: [DUO] }, { hand: [GEMINI_IMPS, FILLER, FILLER] }], format);
    let duo = false;
    play(e, [activate(DUO), (m) => { if (imps(m)) duo = true; return idle(m) ? "stop" : undefined; }]);
    e.destroy();
    return { duo, reaper };
  });
  // upstream's script never activates: it checks for the opponent discarding
  assert.deepEqual(r, { edison: { duo: true, reaper: false }, current: { duo: false, reaper: false } });
});

// "“Hero Barrier” can be activated even if you do not have a face-up “Elemental Hero” monster on the field. If you do not have an “Elemental Hero”
// monster on the field when “Hero Barrier” resolves, then it does nothing." (Individual Card Rulings F-H: Hero Barrier)
test("Hero Barrier: can be activated without an Elemental Hero, and negates an attack only if you control one when it resolves", () => {
  const r = both((format) => {
    const go = (mzone) => {
      const d = scenario([{ mzone, szone: [HERO_BARRIER] }, { mzone: [VORSE] }], format);
      let offered = false;
      const barrier = (m) => { if (m.type === M.SELECT_CHAIN && m.player === 0 && m.selects.some((c) => c.code === HERO_BARRIER)) { offered = true; return act.chain(m, HERO_BARRIER); } };
      // the Barrier is offered when the attack is declared; the quiet default passes before that
      play(d, [turn(2), toBattle, attack(VORSE), maybe(barrier), turn(3)], 3);
      const out = { offered, negated: d.view(0).players[0].lp === 8000 && !zone(d, 0, "grave").includes(AVIAN) };
      d.destroy();
      return out;
    };
    return { none: go([]), hero: go([AVIAN]) };
  });
  assert.deepEqual(r.edison, { none: { offered: true, negated: false }, hero: { offered: true, negated: true } });
  assert.deepEqual(r.current, { none: { offered: false, negated: false }, hero: { offered: true, negated: true } });
});

// "If you control two copies of \"Freed the Matchless General\", you can only activate the effect of one." (Individual Card Rulings F-H)
test("Freed the Matchless General: with two copies, only one search replaces the draw", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [FREED_GENERAL, FREED_GENERAL], deck: [FILLER, YAICHI, KAMON] }, {}], format);
    const both = (m) => (m.type === M.SELECT_CHAIN && m.selects.some((c) => c.code === FREED_GENERAL) ? act.chain(m, FREED_GENERAL) : undefined);
    const { seen } = play(d, [both, maybe(both), maybe(both), look(() => {})]);
    const out = { chained: chained(seen, FREED_GENERAL), warriors: zone(d, 0, "hand").filter((c) => c === YAICHI || c === KAMON).length };
    d.destroy();
    return out;
  });
  assert.deepEqual(r, { edison: { chained: 1, warriors: 1 }, current: { chained: 2, warriors: 1 } });
});

const GOBLIN_ATTACK_FORCE = 78658564, NEGATE_ATTACK = 14315573;

// "If \"Goblin Attack Force's\" attack is negated, it is not shifted to Defense Position at the end of the Battle Phase." (Individual Card Rulings F-H)
test("Goblin Attack Force: not changed to Defense Position when its attack was negated", () => {
  const r = both((format) => {
    const go = (negate) => {
      const d = scenario([{ szone: negate ? [NEGATE_ATTACK] : [] }, { mzone: [GOBLIN_ATTACK_FORCE] }], format);
      play(d, [turn(2), toBattle, attack(GOBLIN_ATTACK_FORCE), ...(negate ? [chain(NEGATE_ATTACK)] : []), turn(2)], 2);
      const position = monster(d, 1, GOBLIN_ATTACK_FORCE).position;
      d.destroy();
      return position;
    };
    return [go(true), go(false)];
  });
  const out = [P.FACEUP_ATTACK, P.FACEUP_DEFENSE]; // the core already does this
  assert.deepEqual(r, { edison: out, current: out });
});

const FLINT = 75560629, FLINT_LOCK = 83812099;

// "This card's effect to equip \"Flint\" to itself targets the \"Flint\" card." (Individual Card Rulings F-H: Flint Lock)
test("Flint Lock: equipping a Flint to itself targets the Flint", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [FLINT_LOCK], hand: [FLINT] }, { mzone: [VORSE] }], format);
    const { seen } = play(d, [activate(FLINT), maybe(pick(VORSE)), activateEffect(FLINT_LOCK, 0), maybe(pick(FLINT)), look(() => {})]);
    const out = { flintTargeted: seen.filter((e) => e.type === M.BECOME_TARGET && e.cards.some((c) => c.location === L.SZONE)).length, equipped: seen.filter((e) => e.type === M.EQUIP).length };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { flintTargeted: 1, equipped: 2 });
  assert.deepEqual(r.current, { flintTargeted: 0, equipped: 2 });
});

const GIGASTONE = 79080761, RYKO = 21502796;

// "The effect of “Gigastone Omega” which activates in the Graveyard can activate during the Damage Step." (Individual Card Rulings F-H)
test("Gigastone Omega: its Graveyard effect activates when it is destroyed in the Damage Step (by Ryko's Flip Effect)", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [{ code: RYKO, position: P.FACEDOWN_DEFENSE }], szone: [MST] }, { mzone: [GIGASTONE] }], format);
    const { seen } = play(d, [turn(2), toBattle, attack(GIGASTONE), maybe(pick(GIGASTONE)), turn(2)], 2);
    const out = { chained: chained(seen, GIGASTONE), mst: zone(d, 0, "grave").includes(MST) };
    d.destroy();
    return out;
  });
  const out = { chained: 1, mst: true };
  assert.deepEqual(r, { edison: out, current: out });
});
