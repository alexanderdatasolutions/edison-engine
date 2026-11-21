// Individual card rulings, cards L to O: one test per ruling that the engine has to get right.
// Source: https://www.edisonformat.com/rulings/individual-rulings-l-o (quoted above each test).
// Where an Edison script exists for the card, the test also runs the current-text script to show the difference.
import test from "node:test";
import assert from "node:assert/strict";
import { scenario, run, act, edison, M, R, L, P, I } from "./scenario.js";

// The same ruleset running the upstream current-text scripts, to show what each Edison script changes.
const current = { ...edison, scriptDirs: edison.scriptDirs.filter((d) => !d.startsWith("./")) };

/** Walks a duel through `steps` in order (the helper of test/edison-errata.test.mjs). Returns {done, seen}. */
function play(d, steps, lastTurn = 1) {
  let done = 0;
  const seen = run(d, (m) => {
    for (;;) {
      if (done >= steps.length || d.turn > lastTurn) return "stop";
      let r = steps[done](m, d);
      if (r === undefined && steps[done].optional && done + 1 < steps.length && (r = steps[done + 1](m, d)) !== undefined) done++;
      if (r !== undefined) done++;
      if (r !== null) return r; // null: the step only looked; the next step gets this prompt
    }
  }, 1000);
  return { done, seen };
}
const maybe = (step) => Object.assign((m, d) => step(m, d), { optional: true });
/** Runs `fn(format)` under the Edison scripts and under the current-text scripts. */
const both = (fn) => ({ edison: fn(edison), current: fn(current) });

const idle = (m) => m.type === M.SELECT_IDLECMD;
const offers = (m, code) => idle(m) && m.activates.some((c) => c.code === code);
const zone = (d, team, name) => d.view(team).players[team][name].filter(Boolean).map((c) => c.code);
const count = (list, code) => list.filter((c) => c === code).length;
const moved = (seen, code, to, from) => seen.filter((e) => e.type === M.MOVE && e.card === code && e.to.location === to && (from === undefined || e.from.location === from)).length;
// steps
const activate = (code) => (m) => act.activate(m, code);
const summon = (code) => (m) => act.summon(m, code);
const pick = (...codes) => (m) => act.pick(m, ...codes);
const chain = (code) => (m) => act.chain(m, code);
const specialSummon = (code) => (m) => { if (!idle(m)) return; const index = m.special_summons.findIndex((c) => c.code === code); return index < 0 ? undefined : { type: R.SELECT_IDLECMD, action: I.SELECT_SPECIAL_SUMMON, index }; };
const peek = (fn) => (m, d) => (idle(m) ? (fn(m, d), null) : undefined); // inspect the next Main Phase prompt and carry on
const turn = (n) => (m, d) => (d.turn >= n && idle(m) ? null : undefined); // wait for the Main Phase of turn n
const from = (n, step) => (m, d) => (d.turn >= n ? step(m, d) : undefined); // a step that only answers from turn n on
const chained = (seen, code) => seen.filter((e) => e.type === M.CHAINING && e.code === code).length;
const monster = (d, team, code) => d.view(team).players[team].mzone.find((c) => c?.code === code);
const toBattle = (m) => act.toBattle(m);
const attack = (code) => (m) => act.attack(m, code);
const look = (fn) => (m, d) => (idle(m) ? (fn(m, d), "stop") : undefined); // inspect the next Main Phase prompt, then stop
const yes = (m) => (m.type === M.SELECT_YESNO || m.type === M.SELECT_EFFECTYN ? { type: m.type === M.SELECT_YESNO ? R.SELECT_YESNO : R.SELECT_EFFECTYN, yes: true } : undefined);
const no = (m) => (m.type === M.SELECT_YESNO || m.type === M.SELECT_EFFECTYN ? { type: m.type === M.SELECT_YESNO ? R.SELECT_YESNO : R.SELECT_EFFECTYN, yes: false } : undefined);
const targeted = (seen) => seen.filter((e) => e.type === M.BECOME_TARGET).length;

const FILLER = 15025844, DARK_HOLE = 53129443, MST = 5318639, WARWOLF = 69247929, VORSE = 14898066, BLUE_EYES = 89631139;
const BOOK_OF_MOON = 14087893, COMPULSORY = 94192409, CALL_OF_THE_HAUNTED = 97077563, LADD = 47297616, MACRO_COSMOS = 30241314;
const JUJITSU = 25773409, LIMIT_REVERSE = 27551, LONEFIRE = 48686504, HELIOS = 54493213, FORTRESS = 5556499, GEARFRAME = 42940404;
const MANTICORE = 77121851, MAGICAL_DIMENSION = 28553439, SKILLED_DARK = 73752131, BREAKER = 71413901, SPIRIT_REAPER = 23205979;
const MACHINE_DUPLICATION = 63995093, CYBER_VALLEY = 3657444, GOKU_EN = 31571902, MEZUKI = 92826944;
const LIMITER_REMOVAL = 23171610, DNA_SURGERY = 74701381, CYBER_DRAGON = 70095154, NETTLES = 19505896;
const LADY_ASSAILANT = 90147755, DIVINE_WRATH = 49010598, TORRENTIAL = 53582587, GEMINI_ELF = 69140098, NON_SPELLCASTING = 20065549;
const REASON_EFFECT = 0x40, REASON_COST = 0x80, RACE_WARRIOR = 0x1;

const flip = (code) => (m) => { if (!idle(m)) return; const index = m.pos_changes.findIndex((c) => c.code === code); return index < 0 ? undefined : { type: R.SELECT_IDLECMD, action: I.SELECT_POS_CHANGE, index }; };
const race = (bit) => (m) => (m.type === M.ANNOUNCE_RACE ? { type: R.ANNOUNCE_RACE, races: [BigInt(bit)] } : undefined);
/** Picks the first `n` offered cards with this code. */
const pickN = (code, n) => (m) => { if (m.type !== M.SELECT_CARD) return; const ix = m.selects.map((c, i) => (c.code === code ? i : -1)).filter((i) => i >= 0).slice(0, n); return ix.length < Math.min(n, m.min) ? undefined : { type: R.SELECT_CARD, indicies: ix }; };
/** Answers a Tribute (or a card choice) with the card `code`. */
const tributeOf = (code) => (m) => { if (m.type !== M.SELECT_TRIBUTE && m.type !== M.SELECT_CARD && m.type !== M.SELECT_UNSELECT_CARD) return; const list = m.selects ?? m.select_cards; const i = list.findIndex((c) => c.code === code); if (i < 0) return; return m.type === M.SELECT_UNSELECT_CARD ? { type: R.SELECT_UNSELECT_CARD, index: i } : { type: m.type === M.SELECT_TRIBUTE ? R.SELECT_TRIBUTE : R.SELECT_CARD, indicies: [i] }; };
/** Chains `code` once `to` is on the chain. */
const respondTo = (to, code) => (m, d) => (m.type === M.SELECT_CHAIN && d.chain.some((c) => c.code === to) ? act.chain(m, code) : undefined);
const reasonOf = (seen, code, to) => { const e = seen.find((x) => x.type === M.MOVE && x.card === code && x.to.location === to); return !e ? "none" : e.reason & REASON_COST ? "cost" : e.reason & REASON_EFFECT ? "effect" : "?"; };

// "Removing 3 cards from the top of your Deck is part of the resolution of this card's Flip Effect, not part of the cost."
test("Lady Assailant of Flames: the 3 cards are removed when the Flip Effect resolves, so none are removed when it is negated", () => {
  const r = both((format) => {
    const run1 = (wrath) => {
      const d = scenario([{ mzone: [{ code: LADY_ASSAILANT, position: P.FACEDOWN_DEFENSE }] }, wrath ? { szone: [DIVINE_WRATH], hand: [FILLER] } : {}], format);
      const { seen } = play(d, [flip(LADY_ASSAILANT), ...(wrath ? [chain(DIVINE_WRATH)] : []), look(() => {})]);
      const out = { removed: zone(d, 0, "removed").length, by: reasonOf(seen, FILLER, L.REMOVED), lp: d.lp[1] };
      d.destroy();
      return out;
    };
    return { plain: run1(false), negated: run1(true) };
  });
  assert.deepEqual(r.edison, { plain: { removed: 3, by: "effect", lp: 7200 }, negated: { removed: 0, by: "none", lp: 8000 } });
  assert.deepEqual(r.current, { plain: { removed: 3, by: "cost", lp: 7200 }, negated: { removed: 3, by: "cost", lp: 8000 } });
});

// "Affected Machine-Type monsters are not destroyed if they are: flipped face-down, become Equip Cards, leave the field, or change Monster Type (by "DNA Surgery")."
test("Limiter Removal: a monster that is no longer Machine-Type in the End Phase is not destroyed", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [CYBER_DRAGON], hand: [LIMITER_REMOVAL], szone: [DNA_SURGERY] }, {}], format);
    const out = {};
    play(d, [activate(LIMITER_REMOVAL), peek(() => (out.atk = monster(d, 0, CYBER_DRAGON).attack)), activate(DNA_SURGERY), race(RACE_WARRIOR), turn(2)], 2);
    out.survived = zone(d, 0, "mzone").includes(CYBER_DRAGON);
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { atk: 4200, survived: true });
  assert.deepEqual(r.current, { atk: 4200, survived: false });
});

test("Limiter Removal: an affected Machine-Type monster is still destroyed in the End Phase", () => {
  const d = scenario([{ mzone: [CYBER_DRAGON], hand: [LIMITER_REMOVAL] }, {}]);
  play(d, [activate(LIMITER_REMOVAL), turn(2)], 2);
  assert.ok(zone(d, 0, "grave").includes(CYBER_DRAGON));
  d.destroy();
});

// "Tributing a monster for "Magical Dimension" is not a cost; it's part of the effect and happens when the effect resolves."
// "Because you select which monster to destroy when "Magical Dimension" resolves, (not when it's activated) "Magical Dimension" does not target."
test("Magical Dimension: nothing is targeted, and the monster to Tribute is chosen when it resolves", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [SKILLED_DARK, SPIRIT_REAPER], hand: [MAGICAL_DIMENSION, BREAKER] }, { mzone: [WARWOLF] }], format);
    const { seen } = play(d, [activate(MAGICAL_DIMENSION), pick(SPIRIT_REAPER), pick(BREAKER), no, look(() => {})]);
    const solving = seen.findIndex((e) => e.type === M.CHAIN_SOLVING), released = seen.findIndex((e) => e.type === M.MOVE && e.card === SPIRIT_REAPER && e.to.location === L.GRAVE);
    const out = { targeted: targeted(seen), tributedOnResolution: solving >= 0 && released > solving, breaker: zone(d, 0, "mzone").includes(BREAKER) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { targeted: 0, tributedOnResolution: true, breaker: true });
  assert.equal(r.current.targeted, 1);
});

// "If the effect of "Magical Dimension" is negated then you do not Tribute a monster."
// "You cannot Tribute a monster for "Magical Dimension" that is "unaffected by Spell Cards" ... If the only monster on your side of the field is
// "Gemini Elf" while "Non-Spellcasting Area" is active, then you could not activate "Magical Dimension"."
// "If your opponent activates "Magical Dimension" and chooses not to destroy a monster on the field, then you can activate "Torrential Tribute" ...
// If your opponent does decide to destroy a monster, then you cannot activate these cards ... So you have missed the timing."
test("Magical Dimension: negated, nothing is Tributed; a monster unaffected by Spells cannot be Tributed; destroying makes Torrential Tribute miss its timing", () => {
  const MAGIC_JAMMER = 77414722;
  const out = {};
  let d = scenario([{ mzone: [SKILLED_DARK], hand: [MAGICAL_DIMENSION, BREAKER] }, { szone: [MAGIC_JAMMER], hand: [FILLER] }]);
  play(d, [activate(MAGICAL_DIMENSION), chain(MAGIC_JAMMER), look(() => {})]);
  out.negatedKeeps = zone(d, 0, "mzone").includes(SKILLED_DARK);
  d.destroy();
  d = scenario([{ mzone: [GEMINI_ELF], hand: [MAGICAL_DIMENSION, BREAKER], szone: [{ code: NON_SPELLCASTING, position: P.FACEUP }] }, {}]);
  play(d, [look((m) => (out.immuneOnly = offers(m, MAGICAL_DIMENSION)))]);
  d.destroy();
  const torrential = (destroy) => {
    const e = scenario([{ mzone: [SKILLED_DARK], hand: [MAGICAL_DIMENSION, BREAKER] }, { mzone: [WARWOLF], szone: [TORRENTIAL] }]);
    const { seen } = play(e, [activate(MAGICAL_DIMENSION), pick(SKILLED_DARK), pick(BREAKER), destroy ? yes : no, ...(destroy ? [pick(WARWOLF)] : []), maybe(chain(TORRENTIAL)), look(() => {})]);
    e.destroy();
    return chained(seen, TORRENTIAL);
  };
  out.torrentialAfterNoDestroy = torrential(false);
  out.torrentialAfterDestroy = torrential(true);
  assert.deepEqual(out, { negatedKeeps: true, immuneOnly: false, torrentialAfterNoDestroy: 1, torrentialAfterDestroy: 0 });
});

// "This effect resolves without effect (Goku En is not destroyed) if an effect (like "Call of the Haunted") is chained that Summons an another
// Zombie-Type monster to the field face-up."
test("Malevolent Mech - Goku En: stays when another Zombie-Type monster is Summoned in Chain to its End Phase effect", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [GOKU_EN], szone: [CALL_OF_THE_HAUNTED], grave: [MEZUKI] }, {}], format);
    play(d, [summon(GOKU_EN), respondTo(GOKU_EN, CALL_OF_THE_HAUNTED), pick(MEZUKI), turn(2)], 2);
    const out = { goku: zone(d, 0, "mzone").includes(GOKU_EN), lp: d.lp[0] };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { goku: true, lp: 8000 });
  assert.deepEqual(r.current, { goku: false, lp: 5600 });
});

// "If the activation of this effect is negated by "Light and Darkness Dragon," it will activate again in the same End Phase."
test("Malevolent Mech - Goku En: its End Phase effect activates again after its activation is negated", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [GOKU_EN] }, { mzone: [LADD] }], format);
    const { seen } = play(d, [summon(GOKU_EN), turn(2)], 2);
    const out = { activations: chained(seen, GOKU_EN), goku: zone(d, 0, "grave").includes(GOKU_EN), lp: d.lp[0] };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { activations: 5, goku: true, lp: 5600 });
  assert.deepEqual(r.current, { activations: 1, goku: false, lp: 8000 });
});

// "If the target is flipped face-down / leaves the field, you still Special Summon from the Deck."
test("Machine Duplication: still Special Summons when the target was flipped face-down", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [CYBER_VALLEY], hand: [MACHINE_DUPLICATION], deck: [FILLER, CYBER_VALLEY, CYBER_VALLEY] }, { szone: [BOOK_OF_MOON] }], format);
    play(d, [activate(MACHINE_DUPLICATION), pick(CYBER_VALLEY), chain(BOOK_OF_MOON), pick(CYBER_VALLEY), pickN(CYBER_VALLEY, 2), look(() => {})]);
    const out = { valleys: count(zone(d, 0, "mzone"), CYBER_VALLEY) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r, { edison: { valleys: 3 }, current: { valleys: 1 } });
});

// "If "Nettles" is attacked while face-down, its effect cannot be applied when it is destroyed by battle."
test("Nettles: cannot destroy a Plant instead when it was attacked face-down", () => {
  const r = both((format) => [P.FACEUP_ATTACK, P.FACEDOWN_DEFENSE].map((position) => {
    const d = scenario([{ mzone: [{ code: NETTLES, position }, LONEFIRE] }, { mzone: [BLUE_EYES] }], format);
    play(d, [turn(2), toBattle, attack(BLUE_EYES), pick(NETTLES), maybe(yes), turn(3)], 3);
    const out = zone(d, 0, "mzone");
    d.destroy();
    return out;
  }));
  assert.deepEqual(r.edison, [[NETTLES], [LONEFIRE]]);
  assert.deepEqual(r.current, [[NETTLES], [NETTLES]]);
});

// ---- Cards whose upstream script plays differently from their Edison rulings.
const LUMINA = 95503687, LIGHTSWORN_BARRIER = 22201234, SABRE = 30502181, MAKYURA = 21593977, JAR_OF_GREED = 83968380, GRACEFUL_CHARITY = 79571449;
const LEVEL_WARRIOR = 97385276, SKILL_DRAIN = 82732705, GRAVITY_BIND = 85742772, MIST_ARCHFIEND = 28601770, OHKA = 69303178, GORYU = 95701283, SENKU = 32918479;
const STOP_DEFENSE = 63102017, CEASEFIRE = 36468556;
const faceUp = (code) => ({ code, position: P.FACEUP });
const canAttack = (code, out, key) => (m) => (m.type === M.SELECT_BATTLECMD ? ((out[key] = m.attacks.some((c) => c.code === code)), null) : undefined);

// "If "Lightsworn Sabre" is sent from your Deck to the Graveyard to pay a cost its effect cannot be activated."
test("Lightsworn Sabre: cannot equip itself when it was sent from the Deck for a cost (current script already does this: it misses the timing)", () => {
  const r = both((format) => {
    const sent = (how) => {
      // Lightsworn Barrier's cost sends the top 2 cards on turn 2 (after Lumina sent 3 on turn 1); Lumina's End Phase effect sends the top 3 by its effect.
      const d = scenario([{ mzone: [LUMINA], szone: [faceUp(LIGHTSWORN_BARRIER)], deck: how === "cost" ? [FILLER, FILLER, FILLER, FILLER, SABRE] : [FILLER, SABRE] }, { mzone: [BLUE_EYES] }], format);
      const { seen } = play(d, how === "cost" ? [turn(2), toBattle, attack(BLUE_EYES), pick(LUMINA), chain(LIGHTSWORN_BARRIER), maybe(chain(SABRE)), turn(3)] : [turn(2)], 3);
      const out = { inGrave: zone(d, 0, "grave").includes(SABRE) || zone(d, 0, "szone").includes(SABRE), offered: chained(seen, SABRE) };
      d.destroy();
      return out;
    };
    return { cost: sent("cost"), effect: sent("effect") };
  });
  assert.deepEqual(r.edison, { cost: { inGrave: true, offered: 0 }, effect: { inGrave: true, offered: 1 } });
  assert.deepEqual(r.current, r.edison);
});

// 2010 text: "During the turn this card is sent to the Graveyard, the owner of this card can activate Trap Card(s) from his/her hand."
// Ruling: "This card's effect is a Continuous Effect."
test("Makyura the Destructor: a Continuous Effect: once it is sent to the Graveyard, any number of Traps can be activated from the hand that turn", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [MAKYURA], hand: [DARK_HOLE, JAR_OF_GREED, JAR_OF_GREED] }, { mzone: [WARWOLF] }], format);
    const { seen } = play(d, [activate(DARK_HOLE), activate(JAR_OF_GREED), activate(JAR_OF_GREED), look(() => {})]);
    const out = { chains: chained(seen, MAKYURA), jars: chained(seen, JAR_OF_GREED) };
    d.destroy();
    // sent from the hand by a card effect
    const e = scenario([{ hand: [GRACEFUL_CHARITY, MAKYURA, JAR_OF_GREED] }, {}], format);
    const discard = (m) => (m.type === M.SELECT_CARD && m.selects.some((c) => c.code === MAKYURA) ? { type: R.SELECT_CARD, indicies: [m.selects.findIndex((c) => c.code === MAKYURA), m.selects.findIndex((c) => c.code === FILLER)] } : undefined);
    const s2 = play(e, [activate(GRACEFUL_CHARITY), discard, activate(JAR_OF_GREED), look(() => {})]).seen;
    out.fromHand = chained(s2, JAR_OF_GREED);
    e.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { chains: 0, jars: 2, fromHand: 1 });
  assert.equal(r.current.jars, 1);
  assert.equal(r.current.fromHand, 0);
});

// "Skill Drain" has no effect on "Level Warrior's" Level ... So "Skill Drain" will not cause "Level Warrior's" Level to become 3.
test("Level Warrior: keeps the Level it was Summoned at under Skill Drain", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [LEVEL_WARRIOR] }, { mzone: [{ code: WARWOLF, position: P.FACEUP_DEFENSE }], szone: [faceUp(SKILL_DRAIN), faceUp(GRAVITY_BIND)] }], format);
    const out = {};
    play(d, [specialSummon(LEVEL_WARRIOR), turn(3), toBattle, canAttack(LEVEL_WARRIOR, out, "attacks"), turn(4)], 4); // Gravity Bind: Level 4 or higher monsters cannot attack
    d.destroy();
    return out;
  });
  assert.deepEqual(r, { edison: { attacks: false }, current: { attacks: true } });
});

// "If this card is turned face-down by "Book of Moon", etc. Chained to its effect, it will still be destroyed and its controller will take 1000 damage."
test("Mist Archfiend: is still destroyed, and its controller takes 1000, when it is flipped face-down in Chain to its End Phase effect", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [MIST_ARCHFIEND] }, { szone: [BOOK_OF_MOON] }], format);
    play(d, [summon(MIST_ARCHFIEND), respondTo(MIST_ARCHFIEND, BOOK_OF_MOON), pick(MIST_ARCHFIEND), turn(2)], 2);
    const out = { grave: zone(d, 0, "grave").includes(MIST_ARCHFIEND), lp: d.lp[0] };
    d.destroy();
    return out;
  });
  assert.deepEqual(r, { edison: { grave: true, lp: 7000 }, current: { grave: false, lp: 8000 } });
});

// "Flipping "Majestic Mech – Ohka" or "Majestic Mech – Goryu" face-down will not reset their memory of how they were Summoned. So if you Normal
// Summoned them with fewer Tributes by using their effect, they will still be sent to the Graveyard by their effect during the End Phase even if
// they have been flipped face-down since being Summoned. (However, as long as they are face-down DURING the End Phase, their effect will not activate.)"
test("Majestic Mech - Ohka and Goryu: still sent to the Graveyard in a later End Phase after being flipped face-down and face-up again", () => {
  const r = both((format) => [OHKA, GORYU].map((code) => {
    const d = scenario([{ hand: [code, BOOK_OF_MOON], mzone: code === GORYU ? [FILLER] : [] }, {}], format);
    const out = {};
    play(d, [summon(code), maybe(pick(FILLER)), activate(BOOK_OF_MOON), pick(code), turn(2), peek(() => (out.turn2 = zone(d, 0, "mzone").includes(code))), turn(3), flip(code), turn(4), peek(() => (out.turn4 = zone(d, 0, "mzone").includes(code)))], 4);
    d.destroy();
    return out;
  }));
  assert.deepEqual(r.edison, [{ turn2: true, turn4: false }, { turn2: true, turn4: false }]);
  assert.deepEqual(r.current, [{ turn2: true, turn4: true }, { turn2: true, turn4: true }]);
});

// "The effect of "Majestic Mech – Senku" that sends itself to the Graveyard only activates during the End Phase of the turn it was Summoned. If it manages
// to remain on the field longer than that, it will not send itself to the Graveyard during any following End Phase."
test("Majestic Mech - Senku: only sent to the Graveyard in the End Phase of the turn it was Summoned", () => {
  const r = both((format) => {
    // Turn 1: Tribute Summoned, then flipped face-down, so it stays. Turn 2: the opponent's Stop Defense turns it face-up; it was not Summoned that turn.
    const d = scenario([{ hand: [SENKU, BOOK_OF_MOON], mzone: [FILLER] }, { hand: [STOP_DEFENSE] }], format);
    const out = {};
    play(d, [summon(SENKU), maybe(pick(FILLER)), activate(BOOK_OF_MOON), pick(SENKU), turn(2), activate(STOP_DEFENSE), pick(SENKU), peek(() => (out.faceUp = monster(d, 0, SENKU)?.position === P.FACEUP_ATTACK)), turn(3), peek(() => (out.turn3 = zone(d, 0, "mzone").includes(SENKU)))], 3);
    d.destroy();
    return out;
  });
  assert.deepEqual(r, { edison: { faceUp: true, turn3: true }, current: { faceUp: true, turn3: false } });
});

const MANTICORE_DARK = 77121851, GAZELLE = 5818798, MIRROR = 53341729, DNA_TRANSPLANT = 56769674, LORD_BRITISH = 35514096, LAST_RESORT = 97970833;
const RAINBOW_RUINS = 34487429, NECROVALLEY = 47355498, METEORAIN = 64274292, MAGNEN_BAR = 45593005, MOSAIC = 8483333;
const ATTRIBUTE_LIGHT = 0x10, PHASE_MAIN2 = 0x100;
const attribute = (bit) => (m) => (m.type === M.ANNOUNCE_ATTRIB ? { type: R.ANNOUNCE_ATTRIB, attributes: [bit] } : undefined);
/** Graceful Charity's discard: `code` and one Mystical Elf, wherever they are in the hand. */
const discardWith = (code) => (m) => (m.type === M.SELECT_CARD && m.selects.some((c) => c.code === code) ? { type: R.SELECT_CARD, indicies: [m.selects.findIndex((c) => c.code === code), m.selects.findIndex((c) => c.code === FILLER)] } : undefined);

// "You can send a face-down Beast, Beast-Warrior, or Winged Beast-Type monster to the Graveyard for "Manticore of Darkness"' effect."
test("Manticore of Darkness: a face-down Beast-Type monster can be sent for its effect", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [GRACEFUL_CHARITY, MANTICORE_DARK], mzone: [{ code: GAZELLE, position: P.FACEDOWN_DEFENSE }] }, {}], format);
    const { seen } = play(d, [activate(GRACEFUL_CHARITY), discardWith(MANTICORE_DARK), turn(2)], 2);
    const out = { activated: chained(seen, MANTICORE_DARK), summoned: zone(d, 0, "mzone").includes(MANTICORE_DARK) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r, { edison: { activated: 1, summoned: true }, current: { activated: 0, summoned: false } });
});

// "When determining if a monster's effect should be negated by "Light-Imprisoning Mirror", check the monster's Attribute at the time its effect is resolved."
// "When a Non-LIGHT monster's effect is activated while the monster and "Light-Imprisoning Mirror" are both face-up on the field, if you chain
// "DNA Transplant" and select "LIGHT", the monster's effect will be negated if the monster is still face-up on the field when its effect resolves"
test("Light-Imprisoning Mirror: the Attribute is checked when the effect resolves (current script already does this)", () => {
  const RYKO = 21502796, ATTRIBUTE_DARK = 0x20;
  const r = both((format) => {
    // Lonefire Blossom (FIRE) Tributes Nettles; in Chain, DNA Transplant makes every face-up monster LIGHT.
    const d = scenario([{ mzone: [LONEFIRE, NETTLES], szone: [faceUp(MIRROR), DNA_TRANSPLANT], deck: [FILLER, LONEFIRE] }, {}], format);
    const { seen } = play(d, [activate(LONEFIRE), tributeOf(NETTLES), respondTo(LONEFIRE, DNA_TRANSPLANT), attribute(ATTRIBUTE_LIGHT), look(() => {})]);
    const out = { becameLight: { negated: seen.some((e) => e.type === M.CHAIN_DISABLED), summoned: count(zone(d, 0, "mzone"), LONEFIRE) } };
    d.destroy();
    // Lumina (LIGHT) Special Summons Ryko; in Chain, DNA Transplant makes every face-up monster DARK.
    const e = scenario([{ mzone: [LUMINA], hand: [FILLER], grave: [RYKO], szone: [faceUp(MIRROR), DNA_TRANSPLANT] }, {}], format);
    const s2 = play(e, [activate(LUMINA), tributeOf(FILLER), respondTo(LUMINA, DNA_TRANSPLANT), attribute(ATTRIBUTE_DARK), maybe(pick(RYKO)), look(() => {})]).seen;
    out.becameDark = { negated: s2.some((x) => x.type === M.CHAIN_DISABLED), summoned: zone(e, 0, "mzone").includes(RYKO) };
    e.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { becameLight: { negated: true, summoned: 1 }, becameDark: { negated: false, summoned: true } });
  assert.deepEqual(r.current, r.edison);
});

// "If both this and the opponent's monster are destroyed by battle with each other, you can still activate the second or third effect of this card."
test("Lord British Space Fighter: its effect still activates when it is destroyed in the same battle", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [LORD_BRITISH] }, { mzone: [NETTLES] }], format); // both 1200 ATK
    const { seen } = play(d, [turn(3), toBattle, attack(LORD_BRITISH), pick(NETTLES), turn(4)], 4);
    const out = { activated: chained(seen, LORD_BRITISH), mine: zone(d, 0, "mzone").length };
    d.destroy();
    return out;
  });
  assert.deepEqual(r, { edison: { activated: 1, mine: 1 }, current: { activated: 0, mine: 0 } }); // the Multi Token
});

// "If your opponent has an active Field Spell Card when you activate this card they can draw 1 card when this card resolves, even if that Field Spell
// Card is destroyed by an effect Chained to this card's activation."
test("Last Resort: the opponent may draw if they had a face-up Field Spell when it was activated", () => {
  const r = both((format) => {
    const d = scenario([{ szone: [LAST_RESORT], deck: [FILLER, RAINBOW_RUINS] }, { mzone: [WARWOLF], szone: [MST, , , , , faceUp(NECROVALLEY)] }], format);
    const out = {};
    play(d, [turn(2), peek(() => (out.hand = zone(d, 1, "hand").length)), toBattle, attack(WARWOLF), chain(LAST_RESORT), respondTo(LAST_RESORT, MST), pick(NECROVALLEY), turn(3)], 3);
    out.drew = zone(d, 1, "hand").length - out.hand;
    out.ruins = zone(d, 0, "szone").includes(RAINBOW_RUINS);
    delete out.hand;
    d.destroy();
    return out;
  });
  assert.deepEqual(r, { edison: { drew: 1, ruins: true }, current: { drew: 0, ruins: true } });
});

// "You can activate "Meteorain" during your turn at any point from the Draw Phase to the end of your Battle Phase; you cannot activate it during the
// Damage Step, Main Phase 2, your End Phase, or your opponent's turn."
test("Meteorain: cannot be activated in Main Phase 2", () => {
  const r = both((format) => {
    const d = scenario([{ szone: [METEORAIN], mzone: [WARWOLF] }, {}], format);
    const out = {};
    play(d, [turn(3), peek((m) => (out.main1 = offers(m, METEORAIN))), toBattle, (m, dd) => (idle(m) && dd.phase === PHASE_MAIN2 ? ((out.main2 = offers(m, METEORAIN)), "stop") : undefined)], 3);
    d.destroy();
    return out;
  });
  assert.deepEqual(r, { edison: { main1: true, main2: false }, current: { main1: true, main2: true } });
});

// "You cannot activate this card's Attack Position effect during Main Phase 2."
test("Morphtronic Magnen Bar: its Attack Position effect cannot be activated in Main Phase 2", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [MAGNEN_BAR, WARWOLF, VORSE] }, {}], format);
    const out = {};
    play(d, [turn(3), peek((m) => (out.main1 = offers(m, MAGNEN_BAR))), toBattle, (m, dd) => (idle(m) && dd.phase === PHASE_MAIN2 ? ((out.main2 = offers(m, MAGNEN_BAR)), "stop") : undefined)], 3);
    d.destroy();
    return out;
  });
  assert.deepEqual(r, { edison: { main1: true, main2: false }, current: { main1: true, main2: true } });
});

// "If you Tribute monsters to Set "Mosaic Manticore", "Mosaic Manticore's" effect can be activated if it is flipped face-up before your next Standby Phase."
// "If your "Mosaic Manticore" is flipped face-down after being Tributed Summoned and is flipped face-up before your next Standby Phase, its effect can be
// activated during your next Standby Phase."
test("Mosaic Manticore: Tribute Set, or flipped face-down after its Tribute Summon, it still brings the Tributes back if face-up in the next Standby Phase", () => {
  const r = both((format) => ["set", "flipped"].map((how) => {
    const d = scenario([{ hand: [MOSAIC, BOOK_OF_MOON], mzone: [WARWOLF, VORSE] }, { hand: [STOP_DEFENSE] }], format);
    const setIt = (m) => { if (!idle(m)) return; const index = m.monster_sets.findIndex((c) => c.code === MOSAIC); return index < 0 ? undefined : { type: R.SELECT_IDLECMD, action: I.SELECT_MONSTER_SET, index }; };
    const tribute = (m) => (m.type === M.SELECT_TRIBUTE ? { type: R.SELECT_TRIBUTE, indicies: [0, 1] } : undefined);
    const first = how === "set" ? [setIt, tribute] : [summon(MOSAIC), tribute, activate(BOOK_OF_MOON), pick(MOSAIC)];
    play(d, [...first, turn(2), activate(STOP_DEFENSE), pick(MOSAIC), turn(3), look(() => {})], 3);
    const out = zone(d, 0, "mzone").sort();
    d.destroy();
    return out;
  }));
  const all = [MOSAIC, WARWOLF, VORSE].sort();
  assert.deepEqual(r, { edison: [all, all], current: [[MOSAIC], [MOSAIC]] });
});

// "If you have two "Ogre of the Scarlet Sorrow" in your hand when your opponent declares their second direct attack, you can only activate the effect of one of them."
// "If you have both "Ogre of the Scarlet Sorrow" and "Battle Fader" in your hand when your opponent declares their second direct attack, you can only activate the effect of one of them."
test("Ogre of the Scarlet Sorrow: only one copy can be activated for the same direct attack", () => {
  const OGRE = 82670878, BATTLE_FADER = 19665973;
  const r = both((format) => [[OGRE, OGRE], [OGRE, BATTLE_FADER]].map((hand) => {
    const d = scenario([{ hand }, { mzone: [WARWOLF, VORSE] }], format);
    // The first direct attack is let through (Battle Fader declined); at the second, every copy offered is activated.
    let attacks = 0;
    const seen = run(d, (m, dd) => {
      if (dd.turn > 2) return "stop";
      if (dd.turn < 2) return;
      if (m.type === M.SELECT_IDLECMD) return act.toBattle(m);
      if (m.type === M.SELECT_BATTLECMD) { const a = act.attack(m, attacks === 0 ? WARWOLF : VORSE); if (a) attacks++; return a; }
      if (attacks < 2) return m.type === M.SELECT_EFFECTYN || m.type === M.SELECT_YESNO ? no(m) : m.type === M.SELECT_CHAIN ? { type: R.SELECT_CHAIN, index: null } : undefined;
      if (m.type === M.SELECT_CHAIN) { const i = m.selects.findIndex((c) => c.code === OGRE || c.code === BATTLE_FADER); return i < 0 ? undefined : { type: R.SELECT_CHAIN, index: i }; }
    }, 1000);
    const out = zone(d, 0, "mzone").filter((c) => c === OGRE || c === BATTLE_FADER).length + zone(d, 0, "removed").filter((c) => c === BATTLE_FADER).length;
    d.destroy();
    return out;
  }));
  // [two Ogres, Ogre + Battle Fader]: one activation either way.
  assert.deepEqual(r.edison, [1, 1]);
  assert.deepEqual(r.current, [2, 2]);
});
