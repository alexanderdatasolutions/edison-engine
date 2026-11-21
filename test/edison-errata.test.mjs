// One test per card on the Edison functional-errata list: the card plays its 2010 way, and (where it can be shown)
// the current-text script does not. Source: https://www.edisonformat.com/functional-errata.html
import test from "node:test";
import assert from "node:assert/strict";
import { scenario, run, act, edison, M, R, L, P, I } from "./scenario.js";

// The same ruleset running the upstream current-text scripts, to show what each Edison script changes.
const current = { ...edison, scriptDirs: edison.scriptDirs.filter((d) => !d.startsWith("./")) };

/**
 * Walks a duel through `steps` in order. Each step is asked at every prompt until it returns an answer; prompts it
 * leaves alone get scenario.js's quiet default (pass, end the phase, say yes, first legal pick). A step may return
 * "stop", or null to hand the same prompt to the next step; a `maybe(step)` is skipped when the step after it answers first. Stops when the steps run out or the turn
 * passes `lastTurn`. Returns {done: steps completed, seen: messages}.
 */
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
const takeOne = (code) => (m) => { if (m.type !== M.SELECT_UNSELECT_CARD) return; const i = code === undefined ? 0 : m.select_cards.findIndex((c) => c.code === code); return i < 0 || !m.select_cards.length ? undefined : { type: R.SELECT_UNSELECT_CARD, index: i }; };
const finish = (m) => (m.type === M.SELECT_UNSELECT_CARD && m.can_finish ? { type: R.SELECT_UNSELECT_CARD, index: null } : undefined);
const specialSummon = (code) => (m) => { if (!idle(m)) return; const index = m.special_summons.findIndex((c) => c.code === code); return index < 0 ? undefined : { type: R.SELECT_IDLECMD, action: I.SELECT_SPECIAL_SUMMON, index }; };
const peek = (fn) => (m, d) => (idle(m) ? (fn(m, d), null) : undefined); // inspect the next Main Phase prompt and carry on
const turn = (n) => (m, d) => (d.turn >= n && idle(m) ? null : undefined); // wait for the Main Phase of turn n
const flip = (code) => (m) => { if (!idle(m)) return; const index = m.pos_changes.findIndex((c) => c.code === code); return index < 0 ? undefined : { type: R.SELECT_IDLECMD, action: I.SELECT_POS_CHANGE, index }; };
const chained = (seen, code) => seen.filter((e) => e.type === M.CHAINING && e.code === code).length;
const monster = (d, team, code) => d.view(team).players[team].mzone.find((c) => c?.code === code);
const toBattle = (m) => act.toBattle(m);
const attack = (code) => (m) => act.attack(m, code);
const fieldSpell = (code) => [, , , , , { code, position: P.FACEUP }];
const look = (fn) => (m, d) => (idle(m) ? (fn(m, d), "stop") : undefined); // inspect the next Main Phase prompt, then stop

const FILLER = 15025844, DARK_HOLE = 53129443, MST = 5318639, WARWOLF = 69247929, VORSE = 14898066;
const LADD = 47297616, TREEBORN = 12538374, LUMINA = 95503687, SUSA = 40473581, SKILL_DRAIN = 82732705, RYKO = 21502796, NECROVALLEY = 47355498;
const FUTURE_FUSION = 77565204, FIVE_HEADED = 99267150, LUSTER = 11091375, BRAIN_CONTROL = 87910978, QUICKDRAW = 20932152, REDMD = 88264978;
const GEARFRAME = 42940404, FORTRESS = 5556499;
const HORUS6 = 11224103, COLOSSAL = 23693634, SHALLOW_GRAVE = 43434803, COMPULSORY = 94192409, PETEN = 52624755, BLUE_EYES = 89631139, SKULL = 70781052;
const POLYMERIZATION = 24094653, PLASMA = 83965310, DOGMA = 17132130, DRAGOON = 76263644, TORRENTIAL = 53582587, DIVINE_WRATH = 49010598, MACRO_COSMOS = 30241314, ROSE_TOKEN = 71645243;
const CATAPULT = 95727991, CYBER_PHOENIX = 3370104, JADE_KNIGHT = 44364207, SURVIVOR = 48092532, DARK_END = 88643579, LIGHT_END = 25132288;
const DARKNESS_APPROACHES = 80168720, BLACK_GARDEN = 71645242, ARMORY_ARM = 29071332, ANCIENT_FAIRY = 25862681;
const PRISMA = 89312388, FLAME_WINGMAN = 35809262, AVIAN = 21844576, BOOK_OF_MOON = 14087893, FORTUNE_LIGHT = 34471458, MARK_OF_THE_ROSE = 45247637, LONEFIRE = 48686504;
const MY_BODY = 69279219, BLAZE_ACCELERATOR = 69537999, VOLCANIC_SHELL = 33365932, MAN_EATER_BUG = 54652250, SOUL_EXCHANGE = 68005187, STRIKE_NINJA = 41006930, SWAP_FROG = 9126351;
const MAUSOLEUM = 80921533, ULTIMATE_OFFERING = 80604091, URGENT_TUNING = 94634433, SOLEMN = 41420027, BLACK_HORN = 50323155;
const SANGAN = 26202165, RESCUE_CAT = 14878871, MILUS = 7489323, BRIONAC = 50321796, GOYO = 7391448, KREBONS = 59575539;

test("Sangan: each copy searches in the same turn, and the searched monster's effect can be activated that turn", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [SANGAN, SANGAN], hand: [DARK_HOLE], deck: [FILLER, RESCUE_CAT, RESCUE_CAT, MILUS, MILUS] }, {}], format);
    let catUsable = null;
    const { seen } = play(d, [activate(DARK_HOLE), pick(RESCUE_CAT), maybe(pick(RESCUE_CAT)), summon(RESCUE_CAT), look((m) => (catUsable = offers(m, RESCUE_CAT)))]);
    d.destroy();
    return { searches: moved(seen, RESCUE_CAT, L.HAND, L.DECK), catUsable };
  });
  assert.deepEqual(r.edison, { searches: 2, catUsable: true });
  assert.deepEqual(r.current, { searches: 1, catUsable: false });
});

test("Rescue Cat: a second Cat can be used the same turn, and the Summoned monsters keep their effects", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [RESCUE_CAT, RESCUE_CAT], deck: [FILLER, MILUS, MILUS, MILUS, MILUS] }, {}], format);
    let milusAtk = null, secondCat = null;
    // Milus Radiant (300 ATK) gives every EARTH monster +500, so two un-negated copies show 1300 each.
    play(d, [activate(RESCUE_CAT), look((m) => { milusAtk = d.view(0).players[0].mzone.filter((c) => c?.code === MILUS).map((c) => c.attack); secondCat = offers(m, RESCUE_CAT); })]);
    d.destroy();
    return { milusAtk, secondCat };
  });
  assert.deepEqual(r.edison, { milusAtk: [1300, 1300], secondCat: true });
  assert.deepEqual(r.current, { milusAtk: [300, 300], secondCat: false });
});

test("Brionac: can return its controller's own cards, and can be used again the same turn", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [BRIONAC], szone: [MST], hand: [FILLER, FILLER, FILLER] }, { mzone: [WARWOLF] }], format);
    let ownTargets = null, again = null;
    const pickOwn = (m) => { if (m.type !== M.SELECT_CARD) return; ownTargets = m.selects.filter((c) => c.controller === 0).length; return act.pick(m, ownTargets ? MST : WARWOLF); };
    play(d, [activate(BRIONAC), takeOne(), maybe(finish), pickOwn, look((m) => (again = offers(m, BRIONAC)))]);
    const back = { mst: count(zone(d, 0, "hand"), MST), warwolfLeft: zone(d, 1, "mzone").length === 0 };
    d.destroy();
    return { ownTargets: ownTargets > 0, again, ...back };
  });
  assert.deepEqual(r.edison, { ownTargets: true, again: true, mst: 1, warwolfLeft: false });
  assert.deepEqual(r.current, { ownTargets: false, again: false, mst: 0, warwolfLeft: true });
});

test("Brionac: discards any number of cards to return that many", () => {
  const d = scenario([{ mzone: [BRIONAC], hand: [FILLER, FILLER, FILLER] }, { mzone: [WARWOLF, VORSE] }]);
  const { done } = play(d, [activate(BRIONAC), takeOne(), takeOne(), finish, pick(WARWOLF, VORSE), look(() => {})]);
  assert.equal(done, 6);
  assert.deepEqual([zone(d, 0, "hand").length /* 3 + the draw - 2 */, zone(d, 1, "mzone").length, zone(d, 1, "hand").sort()], [2, 0, [WARWOLF, VORSE].sort()]);
  d.destroy();
});

test("Goyo Guardian: a non-EARTH Tuner can be used for its Synchro Summon", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [KREBONS, VORSE, VORSE], extra: [GOYO] }, {}], format); // Krebons: DARK Level 2 Tuner
    play(d, [specialSummon(GOYO), look(() => {})]);
    const onField = zone(d, 0, "mzone").includes(GOYO);
    d.destroy();
    return onField;
  });
  assert.deepEqual(r, { edison: true, current: false });
});

// Light and Darkness Dragon (2800/2400) must negate every activation and loses 500/500 each time, so it stops after 4.
test("Treeborn Frog: activates again in the same Standby Phase after its activation is negated", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [LADD], grave: [TREEBORN] }, {}], format);
    const { seen } = play(d, [look(() => {})]);
    const out = { activations: chained(seen, TREEBORN), summoned: zone(d, 0, "mzone").includes(TREEBORN), laddAtk: monster(d, 0, LADD).attack };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { activations: 5, summoned: true, laddAtk: 800 });
  assert.deepEqual(r.current, { activations: 1, summoned: false, laddAtk: 2300 });
});

test("Treeborn Frog: does not activate while a monster equipped as a Spell is in its controller's Spell & Trap Zone (current script already does this)", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [FORTRESS, GEARFRAME], grave: [TREEBORN] }, {}], format);
    const decline = (m) => (m.type === M.SELECT_EFFECTYN ? { type: R.SELECT_EFFECTYN, yes: false } : undefined); // turn 1: leave the Frog in the Graveyard
    const { seen, done } = play(d, [decline, activate(GEARFRAME), pick(FORTRESS), turn(3)], 3);
    const out = { done, equipped: count(zone(d, 0, "szone"), GEARFRAME), activations: chained(seen, TREEBORN), inGrave: zone(d, 0, "grave").includes(TREEBORN) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { done: 4, equipped: 1, activations: 0, inGrave: true });
  assert.deepEqual(r.current, r.edison);
});

test("Lightsworn: the End Phase effect activates again after its activation is negated, until it resolves", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [LUMINA] }, { mzone: [LADD] }], format);
    const { seen } = play(d, [turn(2)], 2);
    const out = { activations: chained(seen, LUMINA), sent: zone(d, 0, "grave").length, laddAtk: monster(d, 1, LADD).attack };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { activations: 5, sent: 3, laddAtk: 800 });
  assert.deepEqual(r.current, { activations: 1, sent: 0, laddAtk: 2300 });
});

test("Lightsworn: an End Phase effect that resolves negated by Skill Drain does not activate again", () => {
  const d = scenario([{ mzone: [LUMINA] }, { szone: [{ code: SKILL_DRAIN, position: P.FACEUP }] }]);
  const { seen } = play(d, [turn(2)], 2);
  assert.deepEqual([chained(seen, LUMINA), zone(d, 0, "grave").length], [1, 0]);
  d.destroy();
});

test("Spirit monsters: the return to the hand activates again after its activation is negated, until it resolves", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [SUSA] }, { mzone: [LADD] }], format);
    const { seen } = play(d, [summon(SUSA), turn(2)], 2);
    const out = { activations: chained(seen, SUSA), returned: zone(d, 0, "hand").includes(SUSA), laddAtk: monster(d, 1, LADD).attack };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { activations: 5, returned: true, laddAtk: 800 });
  assert.deepEqual(r.current, { activations: 1, returned: false, laddAtk: 2300 });
});

test("Ryko: the card to destroy is targeted when the effect activates; then 3 cards are sent", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [{ code: RYKO, position: P.FACEDOWN_DEFENSE }] }, { mzone: [WARWOLF] }], format);
    const { seen } = play(d, [flip(RYKO), pick(WARWOLF), look(() => {})]);
    const targetAt = seen.findIndex((e) => e.type === M.BECOME_TARGET), solvingAt = seen.findIndex((e) => e.type === M.CHAIN_SOLVING);
    const out = { targeted: targetAt >= 0 && targetAt < solvingAt, destroyed: zone(d, 1, "grave").includes(WARWOLF), sent: zone(d, 0, "grave").length };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { targeted: true, destroyed: true, sent: 3 });
  assert.deepEqual(r.current, { targeted: false, destroyed: true, sent: 3 });
});

test("Necrovalley: Treeborn Frog (does not target) revives; Lumina (targets a card in the Graveyard) is negated", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [LUMINA], hand: [FILLER], grave: [TREEBORN, RYKO] }, { szone: [, , , , , { code: NECROVALLEY, position: P.FACEUP }] }], format);
    const { seen, done } = play(d, [activate(LUMINA), pick(RYKO), look(() => {})]);
    const out = { frog: zone(d, 0, "mzone").includes(TREEBORN), luminaUsed: done === 3, luminaNegated: seen.some((e) => e.type === M.CHAIN_DISABLED), ryko: zone(d, 0, "mzone").includes(RYKO) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { frog: true, luminaUsed: true, luminaNegated: true, ryko: false });
  assert.equal(r.current.frog, false);
  assert.equal(r.current.ryko, false);
});

test("Future Fusion: sends the materials when it resolves and Fusion Summons in its controller's 2nd Standby Phase after that", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [FUTURE_FUSION], deck: [FILLER, LUSTER, LUSTER, LUSTER, LUSTER, LUSTER], extra: [FIVE_HEADED] }, {}], format);
    const out = {};
    play(d, [activate(FUTURE_FUSION), peek(() => (out.sentOnActivation = count(zone(d, 0, "grave"), LUSTER))), turn(3), peek(() => (out.summonedTurn3 = zone(d, 0, "mzone").includes(FIVE_HEADED))), turn(5), peek(() => (out.summonedTurn5 = zone(d, 0, "mzone").includes(FIVE_HEADED)))], 5);
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { sentOnActivation: 5, summonedTurn3: false, summonedTurn5: true });
  assert.equal(r.current.sentOnActivation, 0);
});

test("Brain Control: takes a monster that cannot be Normal Summoned, and gives it back in the End Phase", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [BRAIN_CONTROL] }, { mzone: [GOYO] }], format);
    const out = {};
    play(d, [activate(BRAIN_CONTROL), peek(() => (out.taken = zone(d, 0, "mzone").includes(GOYO))), turn(2), peek(() => (out.returned = zone(d, 1, "mzone").includes(GOYO)))], 2);
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { taken: true, returned: true });
  assert.deepEqual(r.current, {}); // not activatable: its only target is a Synchro Monster
});

test("Quickdraw Synchron: its Special Summon is an Ignition Effect that starts a Chain and sends the monster by effect", () => {
  const REASON_EFFECT = 0x40, REASON_COST = 0x80;
  const r = both((format) => {
    const d = scenario([{ hand: [QUICKDRAW, WARWOLF] }, {}], format);
    let how = null;
    const use = (m) => { const a = act.activate(m, QUICKDRAW); if (a) { how = "effect"; return a; } const s = specialSummon(QUICKDRAW)(m); if (s) how = "procedure"; return s; };
    const { seen } = play(d, [use, look(() => {})]);
    const sent = seen.find((e) => e.type === M.MOVE && e.card === WARWOLF && e.to.location === L.GRAVE);
    const out = { how, chain: chained(seen, QUICKDRAW), sentBy: sent.reason & REASON_COST ? "cost" : sent.reason & REASON_EFFECT ? "effect" : "?", onField: zone(d, 0, "mzone").includes(QUICKDRAW) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { how: "effect", chain: 1, sentBy: "effect", onField: true });
  assert.deepEqual(r.current, { how: "procedure", chain: 0, sentBy: "cost", onField: true });
});

test("Red-Eyes Darkness Metal Dragon: two copies can Special Summon themselves and each use the effect in one turn", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [REDMD, REDMD, LUSTER, LUSTER], mzone: [LUSTER, LUSTER] }, {}], format);
    const out = { secondSummon: false, secondEffect: false };
    play(d, [specialSummon(REDMD), takeOne(LUSTER), peek((m) => (out.secondSummon = m.special_summons.some((c) => c.code === REDMD))), specialSummon(REDMD), takeOne(LUSTER), activate(REDMD), look((m) => (out.secondEffect = offers(m, REDMD)))]);
    out.dragons = zone(d, 0, "mzone").length;
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { secondSummon: true, secondEffect: true, dragons: 3 }); // 2 Red-Eyes (each removed a Luster Dragon) and the Luster Dragon the first one Summoned
  assert.equal(r.current.secondSummon, false);
});

test("Union monsters: a monster can only be equipped with 1 Union monster at a time", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [FORTRESS, GEARFRAME, GEARFRAME] }, {}], format);
    let second = null;
    play(d, [activate(GEARFRAME), pick(FORTRESS), look((m) => (second = offers(m, GEARFRAME)))]);
    const equipped = count(zone(d, 0, "szone"), GEARFRAME);
    d.destroy();
    return { equipped, second };
  });
  assert.deepEqual(r.edison, { equipped: 1, second: false });
  assert.deepEqual(r.current, { equipped: 1, second: true });
});

test("Union monsters: Y-Dragon Head protects the equipped monster from destruction by battle only", () => {
  const X_HEAD = 62651957, Y_DRAGON = 65622692, SMASHING_GROUND = 97169186;
  const r = both((format) => {
    const d = scenario([{ mzone: [X_HEAD, Y_DRAGON] }, { hand: [SMASHING_GROUND] }], format);
    const { done } = play(d, [activate(Y_DRAGON), pick(X_HEAD), turn(2), activate(SMASHING_GROUND), turn(3)], 3);
    const out = { done, xHead: zone(d, 0, "mzone").includes(X_HEAD), yDragon: zone(d, 0, "szone").includes(Y_DRAGON) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { done: 5, xHead: false, yDragon: false }); // X-Head Cannon is destroyed by the effect, and Y-Dragon Head with it
  assert.deepEqual(r.current, { done: 5, xHead: true, yDragon: false });
});

test("Black Garden: a Rose Token is still Summoned when the Summoned monster is unaffected by Spells", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [FILLER], hand: [HORUS6], szone: fieldSpell(BLACK_GARDEN) }, {}], format);
    const { seen } = play(d, [summon(HORUS6), look(() => {})]);
    const out = { activated: chained(seen, BLACK_GARDEN), horusAtk: monster(d, 0, HORUS6).attack, token: zone(d, 1, "mzone").includes(ROSE_TOKEN) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { activated: 1, horusAtk: 2300, token: true });
  assert.deepEqual(r.current, { activated: 1, horusAtk: 2300, token: false });
});

test("Black Garden: activates when monsters are Special Summoned face-down", () => {
  const d = scenario([{ hand: [SHALLOW_GRAVE], grave: [WARWOLF], szone: fieldSpell(BLACK_GARDEN) }, { grave: [VORSE] }]);
  const { seen } = play(d, [activate(SHALLOW_GRAVE), look(() => {})]);
  assert.deepEqual([chained(seen, BLACK_GARDEN), d.view(0).players[0].mzone.find(Boolean).position], [1, P.FACEDOWN_DEFENSE]);
  d.destroy();
});

test("Armory Arm: Colossal Fighter loop: the damage is still inflicted after the destroyed monster leaves the Graveyard", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [COLOSSAL, ARMORY_ARM] }, { mzone: [SKULL] }], format);
    // Equip Armory Arm to the opponent's Summoned Skull (3500), then crash Colossal Fighter (2800) into it and revive it in the same Chain.
    const { done } = play(d, [activate(ARMORY_ARM), pick(SKULL), turn(3), toBattle, attack(COLOSSAL), chain(COLOSSAL), pick(COLOSSAL), turn(4)], 4);
    const out = { done, lp: [...d.lp], revived: zone(d, 0, "mzone").includes(COLOSSAL) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { done: 8, lp: [7300, 5200], revived: true });
  assert.deepEqual(r.current, { done: 8, lp: [7300, 8000], revived: true });
});

test("Armory Arm: the damage is the ATK the destroyed monster had on the field", () => {
  const r = both((format) => {
    // Milus Radiant gives the opponent's Gene-Warped Warwolf 2500 ATK on the field; Summoned Skull with Armory Arm (3500) destroys it.
    const d = scenario([{ mzone: [SKULL, ARMORY_ARM] }, { mzone: [WARWOLF, { code: MILUS, position: P.FACEUP_DEFENSE }] }], format);
    const attackWarwolf = (m) => act.attack(m, SKULL);
    play(d, [activate(ARMORY_ARM), pick(SKULL), turn(3), toBattle, attackWarwolf, pick(WARWOLF), turn(4)], 4);
    const lp = d.lp[1];
    d.destroy();
    return lp;
  });
  assert.deepEqual(r, { edison: 8000 - 1000 - 2500, current: 8000 - 1000 - 2000 });
});

test("Ancient Fairy Dragon: can add a Field Spell with the destroyed card's name, and each copy has its own once per turn", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [ANCIENT_FAIRY], deck: [MST, NECROVALLEY] }, { szone: fieldSpell(NECROVALLEY) }], format);
    play(d, [activate(ANCIENT_FAIRY), maybe(pick(NECROVALLEY)), look(() => {})]);
    const out = { lp: d.lp[0], added: zone(d, 0, "hand").includes(NECROVALLEY) };
    d.destroy();
    const d2 = scenario([{ mzone: [ANCIENT_FAIRY, ANCIENT_FAIRY], hand: [FILLER, FILLER] }, {}], format);
    play(d2, [activate(ANCIENT_FAIRY), look((m) => (out.secondCopy = offers(m, ANCIENT_FAIRY)))]);
    d2.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { lp: 9000, added: true, secondCopy: true });
  assert.deepEqual(r.current, { lp: 9000, added: false, secondCopy: false });
});

test("Catapult Turtle: can be used more than once per turn", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [CATAPULT, WARWOLF, VORSE] }, {}], format);
    const { done } = play(d, [activate(CATAPULT), takeOne(WARWOLF), activate(CATAPULT), takeOne(VORSE), look(() => {})]);
    const lp = d.lp[1];
    d.destroy();
    return lp;
  });
  assert.deepEqual(r, { edison: 8000 - 1000 - 950, current: 8000 - 1000 });
});

// An opponent's Blue-Eyes attacks `code` on turn 2; returns what the attacked card's controller ends up with.
const attacked = (format, code, position, sides = [{}, {}]) => {
  const d = scenario([{ ...sides[0], mzone: [{ code, position }] }, { ...sides[1], mzone: [BLUE_EYES] }], format);
  const { seen } = play(d, [turn(2), toBattle, attack(BLUE_EYES), maybe(chain(code)), turn(3)], 3);
  const out = { triggered: chained(seen, code), hand: zone(d, 0, "hand"), mzone: zone(d, 0, "mzone") };
  d.destroy();
  return out;
};

test("Cyber Phoenix: draws when destroyed after being attacked face-up, not when it was attacked face-down", () => {
  const r = both((format) => [attacked(format, CYBER_PHOENIX, P.FACEUP_ATTACK).triggered, attacked(format, CYBER_PHOENIX, P.FACEDOWN_DEFENSE).triggered]);
  assert.deepEqual(r, { edison: [1, 0], current: [1, 1] });
});

test("Jade Knight: searches when destroyed after being attacked face-up, not when it was attacked face-down", () => {
  const sides = [{ deck: [FILLER, JADE_KNIGHT] }, {}];
  const r = both((format) => [attacked(format, JADE_KNIGHT, P.FACEUP_ATTACK, sides).triggered, attacked(format, JADE_KNIGHT, P.FACEDOWN_DEFENSE, sides).triggered]);
  assert.deepEqual(r, { edison: [1, 0], current: [1, 1] });
});

test("D.D. Survivor: returns after being removed face-up, not when it was attacked face-down, destroyed and removed", () => {
  const sides = [{ szone: [{ code: MACRO_COSMOS, position: P.FACEUP }] }, {}];
  const back = (format, position) => attacked(format, SURVIVOR, position, sides).mzone.includes(SURVIVOR);
  const r = both((format) => [back(format, P.FACEUP_ATTACK), back(format, P.FACEDOWN_DEFENSE)]);
  assert.deepEqual(r, { edison: [true, false], current: [true, true] });
});

test("Dark End Dragon: still loses 500 ATK and DEF when its target has left the field (current script already does this)", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [DARK_END] }, { mzone: [WARWOLF], szone: [COMPULSORY] }], format);
    const { done } = play(d, [activate(DARK_END), pick(WARWOLF), chain(COMPULSORY), pick(WARWOLF), look(() => {})]);
    const out = { done, atk: monster(d, 0, DARK_END).attack, target: zone(d, 1, "hand").includes(WARWOLF) ? "hand" : "elsewhere" };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { done: 5, atk: 2100, target: "hand" });
  assert.deepEqual(r.current, r.edison);
});

test("Light End Dragon: still loses 500 ATK and DEF when the monster it battles has left the field (current script already does this)", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [LIGHT_END] }, { mzone: [WARWOLF], szone: [COMPULSORY] }], format);
    const late = (step) => (m, dd) => (dd.turn >= 3 ? step(m, dd) : undefined);
    const { done, seen } = play(d, [turn(3), toBattle, attack(LIGHT_END), maybe(chain(LIGHT_END)), late(chain(COMPULSORY)), pick(WARWOLF), turn(4)], 4);
    const out = { done, activated: chained(seen, LIGHT_END), atk: monster(d, 0, LIGHT_END).attack, target: zone(d, 1, "hand").includes(WARWOLF) ? "hand" : "elsewhere" };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { done: 7, activated: 1, atk: 2100, target: "hand" });
  assert.deepEqual(r.current, r.edison);
});

test("Darkness Approaches: an Attack Position monster becomes face-down Attack Position; it cannot attack and can be Flip Summoned", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [DARKNESS_APPROACHES, FILLER, FILLER], mzone: [WARWOLF] }, {}], format);
    const out = {};
    const battle = (m) => (m.type === M.SELECT_BATTLECMD ? ((out.canAttack = m.attacks.length > 0), null) : undefined);
    play(d, [activate(DARKNESS_APPROACHES), pick(WARWOLF), peek(() => (out.position = d.view(0).players[0].mzone[0].position)), turn(3), peek((m) => (out.canFlip = m.pos_changes.some((c) => c.code === WARWOLF))), toBattle, battle, turn(4), peek(() => (out.stillFaceDown = d.view(0).players[0].mzone[0].position === P.FACEDOWN_ATTACK)), flip(WARWOLF), look(() => (out.flippedTo = d.view(0).players[0].mzone[0].position))], 5);
    d.destroy();
    return out;
  });
  assert.equal(r.current.position, P.FACEDOWN_DEFENSE);
  assert.deepEqual(r.edison, { position: P.FACEDOWN_ATTACK, canFlip: true, canAttack: false, stillFaceDown: true, flippedTo: P.FACEUP_ATTACK });
});

test("Destiny End Dragoon: activates again in the same Standby Phase after its activation is negated", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [POLYMERIZATION, PLASMA, DOGMA, DARK_HOLE], extra: [DRAGOON] }, { szone: [DIVINE_WRATH] }], format);
    // Turn 1: Fusion Summon it and send it to the Graveyard. Turn 3 Standby Phase: the opponent's Divine Wrath negates its activation.
    const wrath = (m, dd) => (dd.turn >= 3 ? act.chain(m, DIVINE_WRATH) : undefined);
    const { done, seen } = play(d, [activate(POLYMERIZATION), activate(DARK_HOLE), wrath, turn(3)], 3);
    const out = { done, activations: chained(seen, DRAGOON), onField: zone(d, 0, "mzone").includes(DRAGOON) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { done: 4, activations: 2, onField: true });
  assert.deepEqual(r.current, { done: 4, activations: 1, onField: false });
});

test("Light and Darkness Dragon: destroys its controller's cards first, then Special Summons (current script already does this)", () => {
  const r = both((format) => {
    // Peten the Dark Clown ("When this card is sent to the Graveyard, you can...") misses its timing because the Special Summon comes after.
    const d = scenario([{ mzone: [LADD, PETEN], grave: [WARWOLF], deck: [FILLER, PETEN] }, { mzone: [BLUE_EYES] }], format);
    const { seen } = play(d, [turn(2), toBattle, attack(BLUE_EYES), pick(LADD), turn(3)], 3);
    const destroyedAt = seen.findIndex((e) => e.type === M.MOVE && e.card === PETEN && e.to.location === L.GRAVE), summonedAt = seen.findIndex((e) => e.type === M.SPSUMMONING && e.code === WARWOLF);
    const out = { order: destroyedAt >= 0 && destroyedAt < summonedAt, peten: chained(seen, PETEN), summoned: zone(d, 0, "mzone").includes(WARWOLF) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { order: true, peten: 0, summoned: true });
  assert.deepEqual(r.current, r.edison);
});

test("Elemental HERO Prisma: the material is sent by the effect when it resolves, and not at all if Prisma was flipped face-down", () => {
  const REASON_EFFECT = 0x40, REASON_COST = 0x80;
  const r = both((format) => {
    const sides = () => [{ mzone: [PRISMA], deck: [FILLER, AVIAN], extra: [FLAME_WINGMAN] }, { szone: [BOOK_OF_MOON] }];
    const d = scenario(sides(), format);
    const { seen } = play(d, [activate(PRISMA), look(() => {})]);
    const sent = seen.find((e) => e.type === M.MOVE && e.card === AVIAN && e.to.location === L.GRAVE);
    const out = { sentBy: sent.reason & REASON_COST ? "cost" : sent.reason & REASON_EFFECT ? "effect" : "?" };
    d.destroy();
    const d2 = scenario(sides(), format);
    play(d2, [activate(PRISMA), chain(BOOK_OF_MOON), pick(PRISMA), look(() => {})]);
    out.sentWhenFlipped = zone(d2, 0, "grave").includes(AVIAN);
    d2.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { sentBy: "effect", sentWhenFlipped: false });
  assert.deepEqual(r.current, { sentBy: "cost", sentWhenFlipped: true });
});

test("Fortune Lady Light: Special Summons from the Deck when it leaves the field face-down by a card effect", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [{ code: FORTUNE_LIGHT, position: P.FACEDOWN_DEFENSE }], hand: [DARK_HOLE], deck: [FILLER, FORTUNE_LIGHT] }, {}], format);
    play(d, [activate(DARK_HOLE), maybe(chain(FORTUNE_LIGHT)), look(() => {})]);
    const out = zone(d, 0, "mzone").includes(FORTUNE_LIGHT);
    d.destroy();
    return out;
  });
  assert.deepEqual(r, { edison: true, current: false });
});

test("Mark of the Rose: taking control again in the Standby Phase is a Trigger Effect that starts a Chain", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [MARK_OF_THE_ROSE], grave: [LONEFIRE] }, { mzone: [WARWOLF] }], format);
    const out = {}, has = (team) => zone(d, team, "mzone").includes(WARWOLF);
    const { seen } = play(d, [activate(MARK_OF_THE_ROSE), pick(WARWOLF), peek(() => (out.turn1 = has(0))), turn(2), peek(() => (out.turn2 = has(1))), turn(3), peek(() => (out.turn3 = has(0)))], 3);
    out.chains = chained(seen, MARK_OF_THE_ROSE); // the activation, the End Phase of turn 1, and (Edison) the Standby Phase of turn 3
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { turn1: true, turn2: true, turn3: true, chains: 3 });
  assert.deepEqual(r.current, { turn1: true, turn2: true, turn3: true, chains: 2 });
});

test("My Body as a Shield: can be chained to the effect of a face-up Spell that destroys a monster", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [WARWOLF], szone: [MY_BODY] }, { hand: [VOLCANIC_SHELL], szone: [{ code: BLAZE_ACCELERATOR, position: P.FACEUP }] }], format);
    const { done } = play(d, [turn(2), activate(BLAZE_ACCELERATOR), pick(WARWOLF), chain(MY_BODY), turn(3)], 3);
    const out = { chained: done === 5, warwolf: zone(d, 0, "mzone").includes(WARWOLF), accelerator: zone(d, 1, "szone").includes(BLAZE_ACCELERATOR), lp: d.lp[0] };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { chained: true, warwolf: true, accelerator: false, lp: 6500 });
  assert.deepEqual(r.current, { chained: false, warwolf: false, accelerator: true, lp: 8000 });
});

test("My Body as a Shield: cannot be activated in the Damage Step", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [WARWOLF], szone: [MY_BODY] }, { mzone: [{ code: MAN_EATER_BUG, position: P.FACEDOWN_DEFENSE }] }], format);
    const { done } = play(d, [turn(3), toBattle, attack(WARWOLF), pick(WARWOLF), chain(MY_BODY), turn(4)], 4);
    const out = { chained: done === 6, warwolf: zone(d, 0, "mzone").includes(WARWOLF) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { chained: false, warwolf: false });
  assert.deepEqual(r.current, { chained: true, warwolf: true });
});

test("Soul Exchange: Tributing the selected monster is optional", () => {
  const r = both((format) => {
    const tributeWith = (code) => {
      const d = scenario([{ hand: [SOUL_EXCHANGE, SKULL], mzone: [FILLER] }, { mzone: [WARWOLF] }], format);
      let offered = null;
      const tribute = (m) => { if (m.type !== M.SELECT_UNSELECT_CARD) return; offered = m.select_cards.map((c) => c.code).sort(); const i = m.select_cards.findIndex((c) => c.code === code); return { type: R.SELECT_UNSELECT_CARD, index: i < 0 ? 0 : i }; };
      play(d, [activate(SOUL_EXCHANGE), pick(WARWOLF), summon(SKULL), maybe(tribute), look(() => {})]);
      const out = { offered, summoned: zone(d, 0, "mzone").includes(SKULL), theirs: zone(d, 1, "mzone").includes(WARWOLF), mine: zone(d, 0, "mzone").includes(FILLER) };
      d.destroy();
      return out;
    };
    return [tributeWith(FILLER), tributeWith(WARWOLF)];
  });
  assert.deepEqual(r.edison[0], { offered: [FILLER, WARWOLF].sort(), summoned: true, theirs: true, mine: false });
  assert.deepEqual(r.edison[1], { offered: [FILLER, WARWOLF].sort(), summoned: true, theirs: false, mine: true });
  assert.equal(r.current[0].theirs, false); // current text: the selected monster must be the Tribute
});

test("Strike Ninja: each copy can use its effect in the same turn", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [STRIKE_NINJA, STRIKE_NINJA], grave: [VORSE, VORSE, VORSE, VORSE] }, {}], format);
    let second = null;
    play(d, [activate(STRIKE_NINJA), look((m) => (second = offers(m, STRIKE_NINJA)))]);
    d.destroy();
    return second;
  });
  assert.deepEqual(r, { edison: true, current: false });
});

test("Swap Frog: each copy can use its effect in the same turn, but only 1 extra Normal Summon is gained", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [SWAP_FROG, SWAP_FROG, FILLER], hand: [TREEBORN, TREEBORN, TREEBORN] }, {}], format);
    const out = {};
    const { done } = play(d, [activate(SWAP_FROG), pick(FILLER), peek((m) => (out.secondCopy = offers(m, SWAP_FROG))), activate(SWAP_FROG), summon(TREEBORN), summon(TREEBORN), look((m) => (out.thirdSummon = m.summons.some((c) => c.code === TREEBORN)))]);
    out.frogsSummoned = count(zone(d, 0, "mzone"), TREEBORN);
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { secondCopy: true, thirdSummon: false, frogsSummoned: 2 });
  assert.equal(r.current.secondCopy, false);
});

// Engine rule, not scriptable: the core defers a Summon made by a resolving effect (Duel.Summon, Duel.MSet, Duel.SynchroSummon)
// until the Chain has ended and then opens the usual "negate the Summon" window. In Edison the Summon happens while the
// effect resolves, so Solemn Judgment / Black Horn of Heaven get no chance at it. Each test lets the opponent use its negation
// at the first chance; under the Edison rule that chance never comes.
const ENGINE = "core defers a Summon made by a resolving effect until after the Chain and lets it be negated (needs an engine patch)";
const summonByEffect = (sides, steps, lastTurn, summoned) => {
  const d = scenario(sides);
  const { seen } = play(d, steps, lastTurn);
  const at = (type) => seen.findIndex((e) => e.type === type && (type === M.CHAIN_END || e.code === summoned));
  const out = { duringResolution: at(M.SUMMONING) >= 0 ? at(M.SUMMONING) < at(M.CHAIN_END) : at(M.SPSUMMONING) >= 0 && at(M.SPSUMMONING) < at(M.CHAIN_END), onField: zone(d, 0, "mzone").includes(summoned), opponentLp: d.lp[1] };
  d.destroy();
  return out;
};

// ---- Cards found by comparing each card's 2010 text (formats/edison-text.json) with what its current script does.
const MIND_MASTER = 96782886, GIGASTONE = 79080761, ANTEATER = 13250922, POISON_DRAW_FROG = 56840658, POISON_CLOUD = 83982270, FOX_FIRE = 88753985;

test("Mind Master: no once per turn, and it cannot Tribute itself", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [MIND_MASTER, KREBONS], deck: [KREBONS, KREBONS, KREBONS] }, {}], format);
    let alone = null;
    play(d, [activate(MIND_MASTER), takeOne(KREBONS), pick(KREBONS), activate(MIND_MASTER), takeOne(KREBONS), pick(KREBONS), look(() => {})]);
    const out = { lp: d.lp[0], masterLeft: zone(d, 0, "mzone").includes(MIND_MASTER) };
    d.destroy();
    const e = scenario([{ mzone: [MIND_MASTER], deck: [FILLER, KREBONS] }, {}], format);
    play(e, [look((m) => { alone = m.activates.some((c) => c.code === MIND_MASTER); })]);
    e.destroy();
    return { ...out, alone };
  });
  assert.deepEqual(r.edison, { lp: 8000 - 1600, masterLeft: true, alone: false }, "used twice; with no other Psychic monster it cannot be activated");
  assert.equal(r.current.lp, 8000 - 800, "the current text is once per turn");
  assert.equal(r.current.alone, true, "and lets it Tribute itself");
});

test("Gigastone Omega: two copies can be Special Summoned in one turn", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [GIGASTONE, GIGASTONE], grave: [WARWOLF, WARWOLF, WARWOLF, WARWOLF] }, {}], format);
    play(d, [specialSummon(GIGASTONE), maybe(takeOne()), maybe(takeOne()), specialSummon(GIGASTONE), maybe(takeOne()), maybe(takeOne()), look(() => {})]);
    const n = count(zone(d, 0, "mzone"), GIGASTONE);
    d.destroy();
    return n;
  });
  assert.deepEqual(r, { edison: 2, current: 1 });
});

// Its 2010 print has no "once per turn", but the ruling does: "You can only activate this card's effect once per turn" (edisonformat.com, Individual Card Rulings A-C).
test("Anteatereatingant: destroys one Spell or Trap a turn, as ruled, though its 2010 text does not say so", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [ANTEATER] }, { szone: [MST, MST] }], format);
    play(d, [activate(ANTEATER), pick(MST), activate(ANTEATER), pick(MST), look(() => {})]);
    const left = zone(d, 1, "szone").length;
    d.destroy();
    return left;
  });
  assert.deepEqual(r, { edison: 1, current: 1 });
});

test("Poison Draw Frog, Cloudian - Poison Cloud, Fox Fire: nothing happens when they were attacked face-down", () => {
  const r = both((format) => ({
    frog: [attacked(format, POISON_DRAW_FROG, P.FACEUP_ATTACK).triggered, attacked(format, POISON_DRAW_FROG, P.FACEDOWN_DEFENSE).triggered],
    cloud: [attacked(format, POISON_CLOUD, P.FACEUP_ATTACK).triggered, attacked(format, POISON_CLOUD, P.FACEDOWN_DEFENSE).triggered],
    fox: [attacked(format, FOX_FIRE, P.FACEUP_ATTACK).mzone.includes(FOX_FIRE), attacked(format, FOX_FIRE, P.FACEDOWN_DEFENSE).mzone.includes(FOX_FIRE)],
  }));
  assert.deepEqual(r.edison, { frog: [1, 0], cloud: [1, 0], fox: [true, false] });
  assert.deepEqual(r.current, { frog: [1, 1], cloud: [1, 1], fox: [true, true] });
});


test("Mausoleum of the Emperor: the Normal Summon happens while the effect resolves; Solemn Judgment cannot negate it", { todo: ENGINE }, () => {
  const out = summonByEffect([{ hand: [SKULL], szone: fieldSpell(MAUSOLEUM) }, { szone: [SOLEMN] }], [activate(MAUSOLEUM), chain(SOLEMN), look(() => {})], 1, SKULL);
  assert.deepEqual(out, { duringResolution: true, onField: true, opponentLp: 8000 });
});

test("Ultimate Offering: the Normal Summon happens while the effect resolves; Solemn Judgment cannot negate it", { todo: ENGINE }, () => {
  const out = summonByEffect([{ hand: [WARWOLF], szone: [{ code: ULTIMATE_OFFERING, position: P.FACEUP }] }, { szone: [SOLEMN] }], [activate(ULTIMATE_OFFERING), chain(SOLEMN), look(() => {})], 1, WARWOLF);
  assert.deepEqual(out, { duringResolution: true, onField: true, opponentLp: 8000 });
});

test("Urgent Tuning: the Synchro Summon happens while the effect resolves; it cannot be negated", { todo: ENGINE }, () => {
  const horn = (m, d) => (d.turn >= 3 ? act.chain(m, BLACK_HORN) : undefined);
  const out = summonByEffect([{ mzone: [KREBONS, VORSE], szone: [URGENT_TUNING], extra: [GOYO] }, { szone: [BLACK_HORN] }], [turn(3), toBattle, activate(URGENT_TUNING), horn, turn(4)], 4, GOYO);
  assert.deepEqual(out, { duringResolution: true, onField: true, opponentLp: 8000 });
});
