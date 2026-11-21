// Cards A to C against https://www.edisonformat.com/rulings ("Individual Card Rulings [A-C]"): one test per ruling checked on the real
// core. Where an Edison script was needed (formats/edison-scripts/c<passcode>.lua) the same board is also played with the upstream script,
// to show what the script changes. Each test quotes the ruling it states.
import test from "node:test";
import assert from "node:assert/strict";
import { scenario, run, act, edison, M, R, L, P, I } from "./scenario.js";

// The same ruleset running the upstream current-text scripts.
const current = { ...edison, scriptDirs: edison.scriptDirs.filter((d) => !d.startsWith("./")) };

/**
 * Walks a duel through `steps` in order (the helper of edison-errata.test.mjs). Each step is asked at every prompt until it returns an
 * answer; prompts it leaves alone get scenario.js's quiet default (pass, end the phase, say yes, first legal pick). A step may return
 * "stop", or null to hand the same prompt to the next step; a `maybe(step)` is skipped when the step after it answers first.
 * Stops when the steps run out or the turn passes `lastTurn`. Returns {done: steps completed, seen: messages}.
 */
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
  assert.deepEqual(d.errors, [], "no script errors");
  return { done, seen };
}
const maybe = (step) => Object.assign((m, d) => step(m, d), { optional: true });
/** Runs `fn(format)` under the Edison scripts and under the current-text scripts. */
const both = (fn) => ({ edison: fn(edison), current: fn(current) });

const idle = (m) => m.type === M.SELECT_IDLECMD;
const offers = (m, code) => (idle(m) && m.activates.some((c) => c.code === code)) || (m.type === M.SELECT_CHAIN && m.selects.some((c) => c.code === code)) || (m.type === M.SELECT_BATTLECMD && m.chains.some((c) => c.code === code));
const zone = (d, team, name) => d.view(team).players[team][name].filter(Boolean).map((c) => c.code);
const count = (list, code) => list.filter((c) => c === code).length;
const moved = (seen, code, to, from) => seen.filter((e) => e.type === M.MOVE && e.card === code && e.to.location === to && (from === undefined || e.from.location === from)).length;
const chained = (seen, code) => seen.filter((e) => e.type === M.CHAINING && e.code === code).length;
const monster = (d, team, code) => d.view(team).players[team].mzone.find((c) => c?.code === code);
// steps
const activate = (code) => (m) => act.activate(m, code);
const summon = (code) => (m) => act.summon(m, code);
const pick = (...codes) => (m) => act.pick(m, ...codes);
const chain = (code) => (m) => act.chain(m, code);
/** Activates `code`'s effect whether the core offers it in a chain list or asks yes/no for it alone. */
const use = (code) => (m) => (m.type === M.SELECT_EFFECTYN && m.code === code ? { type: R.SELECT_EFFECTYN, yes: true } : act.chain(m, code));
const chainBy = (team, code) => (m) => (m.player === team ? act.chain(m, code) : undefined);
const takeOne = (code) => (m) => { if (m.type !== M.SELECT_UNSELECT_CARD) return; const i = code === undefined ? 0 : m.select_cards.findIndex((c) => c.code === code); return i < 0 || !m.select_cards.length ? undefined : { type: R.SELECT_UNSELECT_CARD, index: i }; };
const finish = (m) => (m.type === M.SELECT_UNSELECT_CARD && m.can_finish ? { type: R.SELECT_UNSELECT_CARD, index: null } : undefined);
const specialSummon = (code) => (m) => { if (!idle(m)) return; const index = m.special_summons.findIndex((c) => c.code === code); return index < 0 ? undefined : { type: R.SELECT_IDLECMD, action: I.SELECT_SPECIAL_SUMMON, index }; };
const peek = (fn) => (m, d) => (idle(m) ? (fn(m, d), null) : undefined); // inspect the next Main Phase prompt and carry on
const turn = (n) => (m, d) => (d.turn >= n && idle(m) ? null : undefined); // wait for the Main Phase of turn n
const flip = (code) => (m) => { if (!idle(m)) return; const index = m.pos_changes.findIndex((c) => c.code === code); return index < 0 ? undefined : { type: R.SELECT_IDLECMD, action: I.SELECT_POS_CHANGE, index }; };
const toBattle = (m) => act.toBattle(m);
const attack = (code) => (m) => act.attack(m, code);
const fieldSpell = (code) => [, , , , , { code, position: P.FACEUP }];
const look = (fn) => (m, d) => (idle(m) ? (fn(m, d), "stop") : undefined); // inspect the next Main Phase prompt, then stop
const yes = (m) => (m.type === M.SELECT_EFFECTYN || m.type === M.SELECT_YESNO ? { type: m.type === M.SELECT_EFFECTYN ? R.SELECT_EFFECTYN : R.SELECT_YESNO, yes: true } : undefined);
const no = (m) => (m.type === M.SELECT_EFFECTYN || m.type === M.SELECT_YESNO ? { type: m.type === M.SELECT_EFFECTYN ? R.SELECT_EFFECTYN : R.SELECT_YESNO, yes: false } : undefined);
const up = (code) => ({ code, position: P.FACEUP });
const set = (code) => ({ code, position: P.FACEDOWN_DEFENSE });
const def = (code) => ({ code, position: P.FACEUP_DEFENSE });

const FILLER = 15025844; // Mystical Elf 800/2000 LIGHT
const VORSE = 14898066, GEMINI_ELF = 69140098, BLUE_EYES = 89631139, WARWOLF = 69247929;
const SKILL_DRAIN = 82732705, BOOK_OF_MOON = 14087893, BOOK_OF_TAIYOU = 38699854, MST = 5318639, DARK_HOLE = 53129443;
const BATTLE_FADER = 19665973, CAIUS = 9748752;

// ---- Battle Fader ----
test("Battle Fader: only one copy can be activated for one attack declaration", () => {
  // Individual Card Rulings [A-C], Battle Fader: "You cannot activate multiple copies of "Battle Fader" in response to a single attack declaration."
  const r = both((format) => {
    const d = scenario([{ hand: [BATTLE_FADER, BATTLE_FADER] }, { mzone: [VORSE] }], format);
    const { seen } = play(d, [turn(2), toBattle, attack(VORSE), chain(BATTLE_FADER), maybe(chain(BATTLE_FADER)), turn(3)], 3);
    const out = { activations: chained(seen, BATTLE_FADER), onField: count(zone(d, 0, "mzone"), BATTLE_FADER), lp: d.lp[0] };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { activations: 1, onField: 1, lp: 8000 });
  assert.deepEqual(r.current, { activations: 2, onField: 2, lp: 8000 });
});

test("Battle Fader: a second copy can be used against an attack declared on a later turn", () => {
  // The limit is per attack declaration ("in response to a single attack declaration"), not per turn or per Duel.
  // Turn 4: Vorse destroys the first Fader (banished), then Gemini Elf's direct attack is a new declaration.
  const d = scenario([{ hand: [BATTLE_FADER, BATTLE_FADER] }, { mzone: [VORSE, GEMINI_ELF] }]);
  const { seen } = play(d, [turn(2), toBattle, attack(VORSE), chain(BATTLE_FADER), turn(4), toBattle, attack(VORSE), attack(GEMINI_ELF), use(BATTLE_FADER), turn(5)], 5);
  assert.equal(chained(seen, BATTLE_FADER), 2);
  assert.equal(d.lp[0], 8000 - 1900, "only Vorse Raider's battle with the first Fader (Attack Position, 0 ATK) did damage");
  d.destroy();
});

// ---- Cyber Dinosaur, Alien Dog: one copy per Summon ----
const CYBER_DINOSAUR = 39439590, CYBER_DRAGON = 70095154, ALIEN_DOG = 15475415, ALIEN_GREY = 62437709;

test("Cyber Dinosaur: only one copy can be activated when the opponent Special Summons from the hand", () => {
  // Individual Card Rulings [A-C], Cyber Dinosaur: "If you have 2 "Cyber Dinosaurs" in your hand when your opponent Special Summons a
  // monster from their hand, you can only activate the effect of 1 of the "Cyber Dinosaurs"."
  const r = both((format) => {
    const d = scenario([{ hand: [CYBER_DINOSAUR, CYBER_DINOSAUR], mzone: [FILLER] }, { hand: [CYBER_DRAGON] }], format);
    const { seen } = play(d, [turn(2), specialSummon(CYBER_DRAGON), chain(CYBER_DINOSAUR), maybe(chain(CYBER_DINOSAUR)), peek(() => {})], 2);
    const out = { activations: chained(seen, CYBER_DINOSAUR), onField: count(zone(d, 0, "mzone"), CYBER_DINOSAUR) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { activations: 1, onField: 1 });
  assert.deepEqual(r.current, { activations: 2, onField: 2 });
});

test("Alien Dog: only one copy can be activated for one Normal Summon of an Alien", () => {
  // Individual Card Rulings [A-C], Alien Dog: "Even if you have more than 1 "Alien Dog" in your hand, you can only activate the effect of 1."
  const r = both((format) => {
    const d = scenario([{ hand: [ALIEN_DOG, ALIEN_DOG, ALIEN_GREY] }, { mzone: [FILLER] }], format);
    const { seen } = play(d, [summon(ALIEN_GREY), chain(ALIEN_DOG), maybe(chain(ALIEN_DOG)), peek(() => {})]);
    // each Dog that is Summoned also activates its own A-Counter effect, so count the Summons
    const out = { summoned: moved(seen, ALIEN_DOG, L.MZONE, L.HAND), onField: count(zone(d, 0, "mzone"), ALIEN_DOG) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { summoned: 1, onField: 1 });
  assert.deepEqual(r.current, { summoned: 2, onField: 2 });
});

// ---- Caius the Shadow Monarch ----
test("Caius the Shadow Monarch: no damage when it banishes a Battle Fader that is banished by its own condition", () => {
  // Individual Card Rulings [A-C], Caius the Shadow Monarch: "DO NOT inflict damage if the DARK Monster is banished by a Condition
  // instead. Examples include "Battle Fader", and "Plaguespreader Zombie"." Battle Fader: "If this card is targeted by "Caius the
  // Shadow Monarch's" effect, no Effect Damage is inflicted."
  const r = both((format) => {
    const d = scenario([{ hand: [BATTLE_FADER] }, { mzone: [VORSE], hand: [CAIUS] }], format);
    play(d, [turn(2), toBattle, attack(VORSE), use(BATTLE_FADER), turn(4), summon(CAIUS), pick(BATTLE_FADER), peek(() => {})], 4);
    const out = { fader: d.view(0).players[0].removed.map((c) => c.code), lp: d.lp[0] };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { fader: [BATTLE_FADER], lp: 8000 });
  assert.deepEqual(r.current, { fader: [BATTLE_FADER], lp: 7000 });
});

test("Caius the Shadow Monarch: a DARK monster with no such condition still costs its controller 1000", () => {
  const d = scenario([{ mzone: [VORSE] }, { mzone: [FILLER], hand: [CAIUS] }]);
  const { done } = play(d, [turn(2), summon(CAIUS), pick(VORSE), peek(() => {})], 2);
  assert.equal(done, 4);
  assert.deepEqual(d.view(0).players[0].removed.map((c) => c.code), [VORSE]);
  assert.equal(d.lp[0], 7000);
  d.destroy();
});

// ---- Cyber Valley ----
const CYBER_VALLEY = 3657444;
/** Activates the effect of `code` whose string index is `n` (cards with several effects). */
const activateEffect = (code, n) => (m) => {
  if (!idle(m)) return;
  const index = m.activates.findIndex((c) => c.code === code && BigInt(c.description) === (BigInt(code) << 20n) + BigInt(n));
  return index < 0 ? undefined : { type: R.SELECT_IDLECMD, action: I.SELECT_ACTIVATE, index };
};

test("Cyber Valley: its second effect still resolves when Cyber Valley is flipped face-down in response", () => {
  // Individual Card Rulings [A-C], Cyber Valley: "If "Cyber Valley" is flipped face-down (by "Book of Moon"): this effect will still
  // resolve with full effect."
  const d = scenario([{ mzone: [CYBER_VALLEY, FILLER], deck: [FILLER, FILLER] }, { szone: [BOOK_OF_MOON] }]);
  const { done } = play(d, [activateEffect(CYBER_VALLEY, 1), pick(FILLER), chainBy(1, BOOK_OF_MOON), pick(CYBER_VALLEY), peek(() => {})]);
  assert.equal(done, 5);
  assert.deepEqual(d.view(0).players[0].removed.map((c) => c.code).sort(), [CYBER_VALLEY, FILLER].sort());
  assert.equal(d.view(0).players[0].hand.length, 3, "the turn's draw and the 2 cards of Cyber Valley");
  d.destroy();
});

// ---- Archlord Kristya ----
const KRISTYA = 59509952, MACRO_COSMOS = 30241314;

test("Archlord Kristya: while Skill Drain applies it is not returned to the Deck", () => {
  // Individual Card Rulings [A-C], Archlord Kristya, the effect that returns it to the top of the Deck: "This effect will not apply
  // while "Skill Drain" is active, as this effect applies on the field."
  const r = both((format) => {
    const d = scenario([{ mzone: [KRISTYA], hand: [DARK_HOLE], szone: [{ code: SKILL_DRAIN, position: P.FACEUP }] }, {}], format);
    const { done } = play(d, [activate(DARK_HOLE), peek(() => {})]);
    const out = { done, grave: count(zone(d, 0, "grave"), KRISTYA) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { done: 2, grave: 1 });
  assert.deepEqual(r.current, { done: 2, grave: 0 });
});

test("Archlord Kristya: with Macro Cosmos active it is still returned to the Deck", () => {
  // Individual Card Rulings [A-C], Archlord Kristya: "While "Macro Cosmos" is active, "Archlord Kristya" is still returned to the Deck."
  const d = scenario([{ mzone: [KRISTYA], hand: [DARK_HOLE], szone: [{ code: MACRO_COSMOS, position: P.FACEUP }] }, {}]);
  const { done } = play(d, [activate(DARK_HOLE), peek(() => {})]);
  assert.equal(done, 2);
  assert.equal(count(zone(d, 0, "removed"), KRISTYA), 0);
  assert.equal(count(zone(d, 0, "grave"), KRISTYA), 0);
  d.destroy();
});

// ---- Cyber Barrier Dragon, Card Blocker ----
const CYBER_BARRIER = 68774379, CARD_BLOCKER = 42256406;

test("Cyber Barrier Dragon: two copies in Attack Position negate only the first attack", () => {
  // Individual Card Rulings [A-C], Cyber Barrier Dragon: "Even if there are 2 or more "Cyber Barrier Dragon" on your side of the field in
  // Attack Position, only the first attack is negated."
  // Upstream already plays it so: both copies use their effect on the first attack.
  const d = scenario([{ mzone: [CYBER_BARRIER, CYBER_BARRIER] }, { mzone: [VORSE, GEMINI_ELF] }]);
  const { seen, done } = play(d, [turn(2), toBattle, attack(VORSE), attack(GEMINI_ELF), turn(3)], 3);
  assert.equal(done, 5);
  assert.equal(seen.filter((e) => e.type === M.ATTACK_DISABLED).length, 1);
  d.destroy();
});

test("Card Blocker: with two copies only one can change the attack target", () => {
  // Individual Card Rulings [A-C], Card Blocker: "If you have multiple copies of "Card Blocker" on the field, you can only activate 1 of
  // their effects to change the attack target when your opponent's monster attacks."
  const r = both((format) => {
    const d = scenario([{ mzone: [def(CARD_BLOCKER), def(CARD_BLOCKER), FILLER] }, { mzone: [VORSE] }], format);
    const { seen } = play(d, [turn(2), toBattle, attack(VORSE), pick(FILLER), chain(CARD_BLOCKER), maybe(chain(CARD_BLOCKER)), turn(3)], 3);
    const out = seen.filter((e) => e.type === M.CHAINING && e.code === CARD_BLOCKER && BigInt(e.description) === (BigInt(CARD_BLOCKER) << 20n) + 1n).length;
    d.destroy();
    return out;
  });
  assert.equal(r.edison, 1);
  assert.equal(r.current, 2);
});

// ---- Armageddon Knight ----
const ARMAGEDDON_KNIGHT = 28985331, CALL_OF_THE_HAUNTED = 97077563;

test("Armageddon Knight: misses the timing when Summoned as Chain Link 2 by Call of the Haunted", () => {
  // Individual Card Rulings [A-C], Armageddon Knight: "This effect CAN'T activate if this card was Summoned as Chain Link 2+ (by "Call of
  // the Haunted")." ("When this card is Summoned, you can ...")
  const d = scenario([{ grave: [ARMAGEDDON_KNIGHT], hand: [MST], szone: [CALL_OF_THE_HAUNTED], deck: [FILLER, VORSE] }, { szone: [BOOK_OF_MOON] }]);
  const { seen, done } = play(d, [activate(MST), pick(BOOK_OF_MOON), chainBy(0, CALL_OF_THE_HAUNTED), pick(ARMAGEDDON_KNIGHT), peek(() => {})]);
  assert.equal(done, 5);
  assert.deepEqual(zone(d, 0, "mzone"), [ARMAGEDDON_KNIGHT]);
  assert.equal(chained(seen, ARMAGEDDON_KNIGHT), 0);
  d.destroy();
});

test("Armageddon Knight: activates when Call of the Haunted is Chain Link 1", () => {
  const d = scenario([{ grave: [ARMAGEDDON_KNIGHT], szone: [CALL_OF_THE_HAUNTED], deck: [FILLER, VORSE] }, {}]);
  const { seen, done } = play(d, [activate(CALL_OF_THE_HAUNTED), pick(ARMAGEDDON_KNIGHT), use(ARMAGEDDON_KNIGHT), peek(() => {})]);
  assert.equal(done, 4);
  assert.equal(chained(seen, ARMAGEDDON_KNIGHT), 1);
  assert.deepEqual(zone(d, 0, "grave"), [VORSE]);
  d.destroy();
});

// ---- Cocoon Veil ----
const COCOON_VEIL = 56641453, CHRYSALIS_DOLPHIN = 42682609, AQUA_DOLPHIN = 17955766;

test("Cocoon Veil: the Chrysalis monster is Tributed when it resolves, not as a cost", () => {
  // Individual Card Rulings [A-C], Cocoon Veil: "Tributing a "Chrysalis" monster is part of this card's effect, not a cost."
  const r = both((format) => {
    const d = scenario([{ mzone: [CHRYSALIS_DOLPHIN], szone: [COCOON_VEIL], deck: [FILLER, AQUA_DOLPHIN] }, {}], format);
    let onActivation;
    const { done } = play(d, [activate(COCOON_VEIL), (m, d) => (m.type === M.SELECT_CHAIN && m.player === 1 ? ((onActivation = zone(d, 0, "mzone")), null) : undefined), peek(() => {})]);
    const out = { done, onActivation, after: zone(d, 0, "mzone") };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { done: 3, onActivation: [CHRYSALIS_DOLPHIN], after: [AQUA_DOLPHIN] });
  assert.deepEqual(r.current, { done: 3, onActivation: [], after: [AQUA_DOLPHIN] });
});

// ---- Belial - Marquis of Darkness ----
const BELIAL = 33655493;

test("Belial - Marquis of Darkness: does not protect face-down monsters from attacks", () => {
  // Individual Card Rulings [A-C], Belial - Marquis of Darkness: "This effect does not apply to face-down monsters you control"; your
  // opponent can "attack your face-down Defense Position monsters".
  const d = scenario([{ mzone: [BELIAL, set(FILLER), FILLER] }, { mzone: [VORSE] }]);
  let targets;
  const { done } = play(d, [turn(2), toBattle, attack(VORSE), (m) => (m.type === M.SELECT_CARD ? ((targets = m.selects.map((c) => [c.code, c.code === BELIAL || (c.position & P.FACEDOWN) !== 0])), null) : undefined), turn(3)], 3);
  assert.equal(done, 5);
  assert.deepEqual(targets, [[BELIAL, true], [FILLER, true]], "Belial and the face-down monster, not the face-up Mystical Elf");
  d.destroy();
});
