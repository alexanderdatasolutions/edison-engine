// Rulings of individual cards, I to K and U to Z, each played on the engine under the Edison scripts and, where the two
// differ, under the current-text scripts. Sources: https://www.edisonformat.com/rulings , the pages
// "Individual Card Rulings [I-K]" and "Individual Card Rulings [U-Z]"; each test quotes the ruling it plays.
import test from "node:test";
import assert from "node:assert/strict";
import { scenario, run, act, edison, M, R, L, P, I } from "./scenario.js";

// The same ruleset running the upstream current-text scripts, to show what each Edison script changes.
const current = { ...edison, scriptDirs: edison.scriptDirs.filter((d) => !d.startsWith("./")) };

/** Walks a duel through `steps` in order (see test/edison-errata.test.mjs, whose helpers these are). */
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
const chained = (seen, code) => seen.filter((e) => e.type === M.CHAINING && e.code === code).length;
const monster = (d, team, code) => d.view(team).players[team].mzone.find((c) => c?.code === code);
// steps
const activate = (code) => (m) => act.activate(m, code);
const summon = (code) => (m) => act.summon(m, code);
const pick = (...codes) => (m) => act.pick(m, ...codes);
const chain = (code) => (m) => act.chain(m, code);
const turn = (n) => (m, d) => (d.turn >= n && idle(m) ? null : undefined); // wait for the Main Phase of turn n
const toBattle = (m) => act.toBattle(m);
const attack = (code) => (m) => act.attack(m, code);
const fieldSpell = (code) => [, , , , , { code, position: P.FACEUP }];
const look = (fn) => (m, d) => (idle(m) ? (fn(m, d), "stop") : undefined); // inspect the next Main Phase prompt, then stop
const pass = (m) => (m.type === M.SELECT_CHAIN && !m.forced ? { type: R.SELECT_CHAIN, index: null } : undefined);
const yes = (m) => (m.type === M.SELECT_EFFECTYN || m.type === M.SELECT_YESNO ? { type: m.type === M.SELECT_EFFECTYN ? R.SELECT_EFFECTYN : R.SELECT_YESNO, yes: true } : undefined);
/** Activates the effect of `code` whose description is its string `n`, offered as a chain choice or as a yes/no question. */
const effect = (code, n) => (m) => {
  const desc = String(BigInt(code) * (1n << 20n) + BigInt(n));
  if (m.type === M.SELECT_CHAIN) { const i = m.selects.findIndex((c) => c.code === code && String(c.description) === desc); return i < 0 ? undefined : { type: R.SELECT_CHAIN, index: i }; }
  if (m.type === M.SELECT_EFFECTYN && m.code === code && String(m.description) === desc) return { type: R.SELECT_EFFECTYN, yes: true };
};
const option = (i) => (m) => (m.type === M.SELECT_OPTION ? { type: R.SELECT_OPTION, index: i } : undefined);
const no = (m) => (m.type === M.SELECT_EFFECTYN || m.type === M.SELECT_YESNO ? { type: m.type === M.SELECT_EFFECTYN ? R.SELECT_EFFECTYN : R.SELECT_YESNO, yes: false } : undefined);

const FILLER = 15025844, WARWOLF = 69247929, VORSE = 14898066, BLUE_EYES = 89631139;
const POT = 55144522, MAGIC_JAMMER = 77414722, MAGIC_DRAIN = 59344077, VANDALGYON = 24857466, VOLTANIS = 20951752;

// "If you have 2 or more "Van'Dalgyon the Dark Dragon Lord" (or "Voltanis the Adjudicator") in your hand when your Counter
// Trap Card negates your opponent's effect, you can only activate the effect of 1 "Van'Dalgyon the Dark Dragon Lord", even if
// you negate multiple card effects." (Individual Card Rulings U-Z: Van'Dalgyon the Dark Dragon Lord)
test("Van'Dalgyon the Dark Dragon Lord: only 1 copy in the hand is Special Summoned for one negation", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [POT] }, { hand: [VANDALGYON, VANDALGYON, FILLER], szone: [MAGIC_JAMMER] }], format);
    play(d, [activate(POT), chain(MAGIC_JAMMER), pick(FILLER), chain(VANDALGYON), maybe(chain(VANDALGYON)), look(() => {})]);
    const out = { summoned: count(zone(d, 1, "mzone"), VANDALGYON), lp: d.view(0).players[0].lp };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { summoned: 1, lp: 6500 });
  assert.deepEqual(r.current, { summoned: 2, lp: 5000 });
});

// "If you have "Voltanis the Adjunticator" and "Van'dalgyon the Dark Dragon Lord" in your hand and your Counter Trap Card
// negates your opponent's card effect, you can Special Summon only 1 of the 2 monsters. You cannot Special Summon both
// monsters." (Individual Card Rulings U-Z: Voltanis the Adjudicator)
test("Voltanis the Adjudicator and Van'Dalgyon: only 1 of the 2 is Special Summoned for one negation", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [POT] }, { hand: [VANDALGYON, VOLTANIS, FILLER], mzone: [VORSE], szone: [MAGIC_JAMMER] }], format);
    play(d, [activate(POT), chain(MAGIC_JAMMER), pick(FILLER), chain(VANDALGYON), maybe(chain(VOLTANIS)), look(() => {})]);
    const field = zone(d, 1, "mzone");
    const out = { vandalgyon: count(field, VANDALGYON), voltanis: count(field, VOLTANIS) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { vandalgyon: 1, voltanis: 0 });
  assert.deepEqual(r.current, { vandalgyon: 1, voltanis: 1 });
});

// "If you activate "Magic Drain" and your opponent discards 1 Spell Card, you cannot activate "Voltanis the Adjudicator's"
// effect." (Individual Card Rulings U-Z: Voltanis the Adjudicator)
test("Voltanis the Adjudicator: no Special Summon after a Magic Drain the opponent negated by discarding a Spell", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [POT, POT] }, { hand: [VOLTANIS], mzone: [VORSE], szone: [MAGIC_DRAIN] }], format);
    play(d, [activate(POT), chain(MAGIC_DRAIN), option(0) /* discard a Spell */, maybe(chain(VOLTANIS)), look(() => {})]);
    const out = { voltanis: count(zone(d, 1, "mzone"), VOLTANIS), hand: zone(d, 0, "hand").length };
    d.destroy();
    return out;
  });
  // 2 Pots and the turn's draw: 1 activated, 1 discarded, and Pot resolves, drawing 2
  assert.deepEqual(r.edison, { voltanis: 0, hand: 3 });
  assert.deepEqual(r.current, { voltanis: 1, hand: 3 });
});

test("Voltanis the Adjudicator: still Special Summoned after a Counter Trap Card that resolved (Magic Jammer)", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [POT] }, { hand: [VOLTANIS, FILLER], mzone: [VORSE], szone: [MAGIC_JAMMER] }], format);
    play(d, [activate(POT), chain(MAGIC_JAMMER), pick(FILLER), chain(VOLTANIS), look(() => {})]);
    const out = count(zone(d, 1, "mzone"), VOLTANIS);
    d.destroy();
    return out;
  });
  assert.deepEqual(r, { edison: 1, current: 1 });
});

const BLAZE_ACCELERATOR = 69537999, SCATTERSHOT = 69750546;
// "If this card is sent to the Graveyard for the effect of a "Blaze Accelerator" card, its effect to inflict 500 damage to
// your opponent does not activate. This UDE ruling applies in Edison Format." "The effect "inflict 500 damage to your
// opponent" of other "Volcanic Scattershot" cards sent to the Graveyard as a cost to activate the effect of this card will
// activate." (Individual Card Rulings U-Z: Volcanic Scattershot)
for (const destroyAll of [false, true]) {
  test(`Volcanic Scattershot: no 500 damage when sent by Blaze Accelerator; the copies sent for its cost do inflict it (${destroyAll ? "destroying all" : "declined"})`, () => {
    const r = both((format) => {
      const d = scenario([{ hand: [SCATTERSHOT], szone: [{ code: BLAZE_ACCELERATOR, position: P.FACEUP }], deck: [FILLER, SCATTERSHOT, SCATTERSHOT] }, { mzone: [WARWOLF, VORSE] }], format);
      play(d, [activate(BLAZE_ACCELERATOR), pick(WARWOLF), destroyAll ? effect(SCATTERSHOT, 1) : no, look(() => {})]);
      const out = { lp: d.view(1).players[1].lp, opponentMonsters: zone(d, 1, "mzone").length };
      d.destroy();
      return out;
    });
    assert.deepEqual(r.edison, destroyAll ? { lp: 7000, opponentMonsters: 0 } : { lp: 8000, opponentMonsters: 1 });
    assert.deepEqual(r.current, destroyAll ? { lp: 6500, opponentMonsters: 0 } : { lp: 7500, opponentMonsters: 1 });
  });
}

const ZOMBIE_WORLD = 4064256, SKULL = 70781052;
// "The monster's Type is checked while it is in the hand. Even though a non-Zombie-Type monster will become a Zombie-Type
// monster on the field, it cannot be Tribute Summoned." "You can Tribute Set (this is not a Tribute Summon) a
// non-Zombie-Type monster." (Individual Card Rulings U-Z: Zombie World)
test("Zombie World: a non-Zombie monster cannot be Tribute Summoned but can be Tribute Set", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [SKULL], mzone: [VORSE], szone: fieldSpell(ZOMBIE_WORLD) }, {}], format);
    let out = null;
    play(d, [look((m) => (out = { summon: m.summons.some((c) => c.code === SKULL), set: m.monster_sets.some((c) => c.code === SKULL) }))]);
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { summon: false, set: true });
  assert.deepEqual(r.current, { summon: false, set: false });
});

const WANGHU = 83986578, RETURN_DD = 27174286, HAMSTER = 5220687, DARK_GRAY = 9159938;
// "VS. "Return from the Different Dimension": If a monster(s) with ATK 1400 or less is Special Summoned simultaneously with
// Wanghu, Wanghu's effect will trigger and start another Chain." (Individual Card Rulings I-K: King Tiger Wanghu)
test("King Tiger Wanghu: destroys a 1400-or-less monster Special Summoned at the same time as itself", () => {
  const r = both((format) => {
    const d = scenario([{ removed: [WANGHU, FILLER], szone: [RETURN_DD] }, {}], format);
    const { seen } = play(d, [activate(RETURN_DD), look(() => {})]);
    const out = { triggered: chained(seen, WANGHU), field: zone(d, 0, "mzone").sort() };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { triggered: 1, field: [WANGHU] });
  assert.deepEqual(r.current, { triggered: 0, field: [WANGHU, FILLER].sort() });
});

// "This effect activates if a monster(s) is Summoned face-down (by "Super Nimble-Mega Hamster"), it does not destroy the
// Special Summoned monster because its ATK cannot be verified." (Individual Card Rulings I-K: King Tiger Wanghu)
test("King Tiger Wanghu: activates for a monster Special Summoned face-down, and does not destroy it", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [WANGHU, { code: HAMSTER, position: P.FACEDOWN_DEFENSE }], deck: [FILLER, DARK_GRAY] }, {}], format);
    const flip = (m) => { if (!idle(m)) return; const index = m.pos_changes.findIndex((c) => c.code === HAMSTER); return index < 0 ? undefined : { type: R.SELECT_IDLECMD, action: I.SELECT_POS_CHANGE, index }; };
    const { seen } = play(d, [flip, look(() => {})]);
    const out = { triggered: chained(seen, WANGHU), grayOnField: zone(d, 0, "mzone").length === 3 };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { triggered: 1, grayOnField: true });
  assert.deepEqual(r.current, { triggered: 0, grayOnField: true });
});

const INSPECTION = 16227556;
// ""Inspection's" effect can be activated multiple times during the same Standby Phase." (Individual Card Rulings I-K: Inspection)
test("Inspection: can be activated again in the same Standby Phase", () => {
  const r = both((format) => {
    const d = scenario([{ szone: [{ code: INSPECTION, position: P.FACEUP }] }, { hand: [FILLER, FILLER] }], format);
    const mine = (step) => (m) => (m.player === 0 ? step(m) : undefined);
    const { seen } = play(d, [turn(1), mine(yes), maybe(mine(yes)), mine(no), turn(2)], 2);
    const out = { activations: chained(seen, INSPECTION), lp: d.view(0).players[0].lp };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { activations: 2, lp: 7000 });
  assert.deepEqual(r.current, { activations: 1, lp: 7500 });
});

const VAMPIRES_CURSE = 34294855;
// "You pay 500 Life Points when "Vampire's Curse" is sent to the Graveyard. Paying 500 Life Points is a cost." "The effect
// that increases "Vampire's Curse's" ATK starts a Chain when it is Special Summoned by its effect." (Individual Card Rulings
// U-Z: Vampire's Curse)
test("Vampire's Curse: the 500 Life Points are paid when it is destroyed by battle, and it returns in the next Standby Phase with 500 more ATK", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [VAMPIRES_CURSE] }, { mzone: [BLUE_EYES] }], format);
    let afterBattle = null, back = null;
    const peek = (fn) => (m, dd) => (idle(m) ? (fn(m, dd), null) : undefined);
    play(d, [turn(2), toBattle, attack(BLUE_EYES), maybe(pick(VAMPIRES_CURSE)), peek(() => (afterBattle = d.view(0).players[0].lp)), turn(3),
      look(() => (back = { lp: d.view(0).players[0].lp, atk: monster(d, 0, VAMPIRES_CURSE)?.attack ?? null }))], 3);
    const errors = d.errors.length;
    d.destroy();
    return { afterBattle, ...back, errors };
  });
  assert.deepEqual(r.edison, { afterBattle: 6500, lp: 6500, atk: 2500, errors: 0 });
  assert.deepEqual(r.current, { afterBattle: 7000, lp: 6500, atk: 2500, errors: 0 });
});

const FULHELMKNIGHT = 78422252, RYKO = 21502796, AIRBELLUM = 90508760;
// "This effects activates & resolves even if "XX-Saber Fulhelmknight" leaves the field. Example: "Ryko, Lightsworn Hunter"
// is destroyed by battle, its Flip Effect destroys Fulhelmknight during Substep 6 - Resolve Effects, and Fulhelmknight's
// effect activates in Substep 7 - End of the Damage Step." (Individual Card Rulings U-Z: XX-Saber Fulhelmknight)
test("XX-Saber Fulhelmknight: its Special Summon still activates after Ryko's Flip Effect destroys it in the Damage Step (current script already does this)", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [{ code: RYKO, position: P.FACEDOWN_DEFENSE }], deck: [FILLER, FILLER, FILLER, FILLER] }, { mzone: [FULHELMKNIGHT], grave: [AIRBELLUM] }], format);
    const { seen } = play(d, [turn(2), toBattle, attack(FULHELMKNIGHT), maybe(pick(RYKO)), yes /* Ryko: destroy a card */, pick(FULHELMKNIGHT), yes, pick(AIRBELLUM), look(() => {})], 2);
    const out = { fulhelmGone: zone(d, 1, "grave").includes(FULHELMKNIGHT), activated: chained(seen, FULHELMKNIGHT), airbellum: zone(d, 1, "mzone").includes(AIRBELLUM), errors: d.errors.length };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { fulhelmGone: true, activated: 1, airbellum: true, errors: 0 });
  assert.deepEqual(r.current, r.edison);
});

// Played cards whose rulings the current-text scripts already follow, each confirmed on the engine.
const INSTANT_FUSION = 1845204, DARK_BRIBE = 77538567, FLAME_SWORDSMAN = 45231177;
// "If "Instant Fusion's" activation is negated by "Dark Bribe", you can activate another copy." (Individual Card Rulings
// I-K: Instant Fusion)
test("Instant Fusion: after Dark Bribe negates its activation, another copy can be activated (current script already does this)", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [INSTANT_FUSION, INSTANT_FUSION], extra: [FLAME_SWORDSMAN, FLAME_SWORDSMAN] }, { szone: [DARK_BRIBE] }], format);
    let again = null;
    play(d, [activate(INSTANT_FUSION), chain(DARK_BRIBE), look((m) => (again = offers(m, INSTANT_FUSION)))]);
    d.destroy();
    return again;
  });
  assert.deepEqual(r, { edison: true, current: true });
});

const KREBONS = 59575539;
// "Paying 800 Life Points is a cost." "This effect does not target." (Individual Card Rulings I-K: Krebons)
test("Krebons: pays 800 when the effect activates and negates the attack (current script already does this)", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [KREBONS] }, { mzone: [WARWOLF] }], format);
    let lp = null;
    const { seen } = play(d, [turn(2), toBattle, attack(WARWOLF), maybe(pick(KREBONS)), (m) => (m.player === 0 ? yes(m) : undefined),
      (m, dd) => (m.type === M.SELECT_BATTLECMD ? ((lp = dd.view(0).players[0].lp), "stop") : undefined)], 2);
    const out = { lp, krebons: zone(d, 0, "mzone").includes(KREBONS), damaged: seen.some((e) => e.type === M.DAMAGE) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { lp: 7200, krebons: true, damaged: false });
  assert.deepEqual(r.current, r.edison);
});

const JUDGMENT_DRAGON = 57774843, CALL_OF_THE_HAUNTED = 97077563;
// "This card can ONLY be special summoned from the hand by this effect." "This card CANNOT be Summoned by "Call of the
// Haunted"" (Individual Card Rulings I-K: Judgment Dragon)
test("Judgment Dragon: Call of the Haunted cannot Special Summon it from the Graveyard (current script already does this)", () => {
  const r = both((format) => {
    const d = scenario([{ grave: [JUDGMENT_DRAGON], szone: [CALL_OF_THE_HAUNTED] }, {}], format);
    let can = null;
    play(d, [look((m) => (can = offers(m, CALL_OF_THE_HAUNTED)))]);
    d.destroy();
    return can;
  });
  assert.deepEqual(r, { edison: false, current: false });
});

const ZOMBIE_MASTER = 17259470, GOBLIN_ZOMBIE = 63665875;
// "You can target a Level 4 or lower Zombie-Type monster discarded as cost" "This effect cannot activate without a legal
// target in any Graveyard, even if you would discard a Level 4 or lower Zombie-Type monster." (Individual Card Rulings U-Z:
// Zombie Master)
test("Zombie Master: needs a target in a Graveyard before the cost, and can then target the monster sent as its cost (current script already does this)", () => {
  const r = both((format) => {
    const empty = scenario([{ mzone: [ZOMBIE_MASTER], hand: [GOBLIN_ZOMBIE] }, {}], format);
    let withoutTarget = null;
    play(empty, [look((m) => (withoutTarget = offers(m, ZOMBIE_MASTER)))]);
    empty.destroy();
    // Zombie World makes the Mystical Elf in the opponent's Graveyard a Zombie: a target in either Graveyard
    const z = scenario([{ mzone: [ZOMBIE_MASTER], hand: [GOBLIN_ZOMBIE], szone: fieldSpell(ZOMBIE_WORLD) }, { grave: [FILLER] }], format);
    let offered = null;
    play(z, [activate(ZOMBIE_MASTER), pick(GOBLIN_ZOMBIE), (m) => { if (m.type !== M.SELECT_CARD) return; offered = m.selects.map((c) => c.code).sort(); return act.pick(m, GOBLIN_ZOMBIE); }, look(() => {})]);
    const out = { withoutTarget, offered, summoned: zone(z, 0, "mzone").includes(GOBLIN_ZOMBIE) };
    z.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { withoutTarget: false, offered: [FILLER, GOBLIN_ZOMBIE].sort(), summoned: true });
  assert.deepEqual(r.current, r.edison);
});

const VOLCANIC_SHELL = 33365932;
// "Each copy of "Volcanic Shell" in your Graveyard may activate its effect once per turn." (Individual Card Rulings U-Z:
// Volcanic Shell)
test("Volcanic Shell: each copy in the Graveyard can use its effect once in the same turn (current script already does this)", () => {
  const r = both((format) => {
    const d = scenario([{ grave: [VOLCANIC_SHELL, VOLCANIC_SHELL], deck: [FILLER, VOLCANIC_SHELL, VOLCANIC_SHELL] }, {}], format);
    let third = null;
    play(d, [activate(VOLCANIC_SHELL), activate(VOLCANIC_SHELL), look((m) => (third = offers(m, VOLCANIC_SHELL)))]);
    const out = { inHand: count(zone(d, 0, "hand"), VOLCANIC_SHELL), lp: d.view(0).players[0].lp, third };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { inHand: 2, lp: 7000, third: false });
  assert.deepEqual(r.current, r.edison);
});

const WALL_OF_REVEALING_LIGHT = 17078030;
// "You can activate "Wall of Revealing Light" during the Battle Step after an attack has been declared. If the monster's
// ATK is lower than the Life Points you paid, the attack stops (does not enter the Damage Step)." (Individual Card Rulings
// U-Z: Wall of Revealing Light)
test("Wall of Revealing Light: activated after an attack is declared, it stops that attack (current script already does this)", () => {
  const r = both((format) => {
    const d = scenario([{ szone: [WALL_OF_REVEALING_LIGHT] }, { mzone: [WARWOLF] }], format);
    const announce = (m) => (m.type === M.ANNOUNCE_NUMBER ? { type: R.ANNOUNCE_NUMBER, value: m.options.findIndex((o) => Number(o) === 2000) } : undefined);
    const { seen } = play(d, [turn(2), toBattle, attack(WARWOLF), chain(WALL_OF_REVEALING_LIGHT), announce, (m) => (m.type === M.SELECT_BATTLECMD ? "stop" : undefined)], 2);
    const out = { lp: d.view(0).players[0].lp, damageStep: seen.some((e) => e.type === M.DAMAGE_STEP_START), errors: d.errors.length };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { lp: 6000, damageStep: false, errors: 0 });
  assert.deepEqual(r.current, r.edison);
});

// Edison rule 10: "you cannot pay costs if doing so would reduce your Life Points to 0"
// (https://www.edisonformat.com/edison-rule-differences.html). The current-text script offers every multiple of 1000 up to
// the Life Points, and paying all of them loses the Duel.
test("Wall of Revealing Light: only multiples of 1000 that leave Life Points are offered as its cost", () => {
  const r = both((format) => {
    const d = scenario([{ szone: [WALL_OF_REVEALING_LIGHT] }, {}], format);
    let most = null;
    const announce = (m) => (m.type === M.ANNOUNCE_NUMBER ? ((most = Math.max(...m.options.map(Number))), { type: R.ANNOUNCE_NUMBER, value: m.options.length - 1 }) : undefined);
    play(d, [activate(WALL_OF_REVEALING_LIGHT), announce, look(() => {})]);
    const out = { most, lp: d.view(0).players[0].lp, winner: d.winner };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { most: 7000, lp: 1000, winner: null });
  assert.deepEqual(r.current, { most: 8000, lp: 0, winner: 1 });
});

const ULTIMATE_TYRANNO = 15894048;
// 2010 text: "If this card is in face-up Attack Position at the beginning of your Battle Phase, it must attack first, and
// attack all monsters your opponent controls once each." "If "Ultimate Tyranno" attacks and destroys an opponent's "Mystic
// Tomato" and they use its effect to Special Summon another monster, then "Ultimate Tyranno" must also attack the newly
// Summoned monster." (Individual Card Rulings U-Z: Ultimate Tyranno)
test("Ultimate Tyranno: must attack every monster the opponent controls before the Battle Phase can end", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [VORSE, WARWOLF] }, { mzone: [ULTIMATE_TYRANNO] }], format);
    let firstMenu = null, afterOne = null;
    play(d, [turn(2), toBattle, (m) => { if (m.type !== M.SELECT_BATTLECMD) return; firstMenu = { toM2: m.to_m2, toEp: m.to_ep }; return act.attack(m, ULTIMATE_TYRANNO); }, maybe(pick(VORSE)),
      (m) => { if (m.type !== M.SELECT_BATTLECMD) return; afterOne = { toM2: m.to_m2, toEp: m.to_ep }; return "stop"; }], 2);
    d.destroy();
    return { firstMenu, afterOne };
  });
  assert.deepEqual(r.edison, { firstMenu: { toM2: false, toEp: false }, afterOne: { toM2: false, toEp: false } });
  assert.deepEqual(r.current, { firstMenu: { toM2: true, toEp: true }, afterOne: { toM2: true, toEp: true } });
});

test("Ultimate Tyranno: once every opposing monster has been attacked, the Battle Phase can end", () => {
  const d = scenario([{ mzone: [VORSE] }, { mzone: [ULTIMATE_TYRANNO] }]);
  let after = null;
  play(d, [turn(2), toBattle, attack(ULTIMATE_TYRANNO), maybe(pick(VORSE)), (m) => { if (m.type !== M.SELECT_BATTLECMD) return; after = { toM2: m.to_m2, toEp: m.to_ep }; return "stop"; }], 2);
  d.destroy();
  assert.deepEqual(after, { toM2: true, toEp: true });
});
