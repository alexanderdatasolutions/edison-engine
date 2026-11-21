// Cards S to T against https://www.edisonformat.com/rulings ("Individual Card Rulings [S-T]") and their 2010 texts.
// Each test quotes the ruling (or the 2010 text where the rulings page is silent) it holds the engine to.
import test from "node:test";
import assert from "node:assert/strict";
import { scenario, run, act, edison, M, R, L, P, I } from "./scenario.js";

// The same ruleset running the upstream current-text scripts, to show what each Edison script changes.
const current = { ...edison, scriptDirs: edison.scriptDirs.filter((d) => !d.startsWith("./")) };

/** Walks a duel through `steps` in order (see test/edison-errata.test.mjs, the same helper). */
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
const moved = (seen, code, to, from) => seen.filter((e) => e.type === M.MOVE && e.card === code && e.to.location === to && (from === undefined || e.from.location === from)).length;
const chained = (seen, code) => seen.filter((e) => e.type === M.CHAINING && e.code === code).length;
const monster = (d, team, code) => d.view(team).players[team].mzone.find((c) => c?.code === code);
// steps
const activate = (code) => (m) => act.activate(m, code);
const summon = (code) => (m) => act.summon(m, code);
const set = (code) => (m) => { if (!idle(m)) return; const index = m.monster_sets.findIndex((c) => c.code === code); return index < 0 ? undefined : { type: R.SELECT_IDLECMD, action: I.SELECT_MONSTER_SET, index }; };
const pick = (...codes) => (m) => act.pick(m, ...codes);
const chain = (code) => (m) => act.chain(m, code);
const specialSummon = (code) => (m) => { if (!idle(m)) return; const index = m.special_summons.findIndex((c) => c.code === code); return index < 0 ? undefined : { type: R.SELECT_IDLECMD, action: I.SELECT_SPECIAL_SUMMON, index }; };
const peek = (fn) => (m, d) => (idle(m) ? (fn(m, d), null) : undefined); // inspect the next Main Phase prompt and carry on
const turn = (n) => (m, d) => (d.turn >= n && idle(m) ? null : undefined); // wait for the Main Phase of turn n
const flip = (code) => (m) => { if (!idle(m)) return; const index = m.pos_changes.findIndex((c) => c.code === code); return index < 0 ? undefined : { type: R.SELECT_IDLECMD, action: I.SELECT_POS_CHANGE, index }; };
const toBattle = (m) => act.toBattle(m);
const attack = (code) => (m) => act.attack(m, code);
const look = (fn) => (m, d) => (idle(m) ? (fn(m, d), "stop") : undefined); // inspect the next Main Phase prompt, then stop
const no = (m) => (m.type === M.SELECT_EFFECTYN ? { type: R.SELECT_EFFECTYN, yes: false } : undefined);
/** Answers the card choice that offers `code` by picking it, and notes who was asked and which cards were offered. */
const choose = (code, note) => (m) => { if (m.type !== M.SELECT_CARD || !m.selects.some((c) => c.code === code)) return; note.player = m.player; note.offered = m.selects.map((c) => ({ code: c.code, controller: c.controller })); return act.pick(m, code); };

const FILLER = 15025844 /* Mystical Elf, 800/2000 */, DARK_HOLE = 53129443, WARWOLF = 69247929, VORSE = 14898066;
const SIMORGH = 86489182, BIRDMAN_JOE = 81896370, TOON_GEMINI_ELF = 42386471, SPIRITS_INVITATION = 92394653, SUSA = 40473581;
const STEALTH_UNION = 3897065, TONGUE_TWISTER = 91250514;

test("Simorgh, Bird of Ancestry: the opponent's WIND monsters also need 1 Tribute less (current script already does this)", () => {
  // 2010 text: "Both players Tribute Summon WIND monsters with 1 less Tribute than required."
  // S-T, Simorgh: "Level 5-6 WIND monsters are Normal Summoned without Tributing while "Simorgh, Bird of Ancestry" is face-up."
  const r = both((format) => {
    const d = scenario([{ mzone: [SIMORGH] }, { hand: [BIRDMAN_JOE] }], format); // Swift Birdman Joe: WIND, Level 6
    let offered = null;
    play(d, [turn(2), look((m) => (offered = m.summons.some((c) => c.code === BIRDMAN_JOE)))], 2);
    d.destroy();
    return offered;
  });
  assert.deepEqual(r, { edison: true, current: true });
});

test("Toon Gemini Elf: the discard is not optional", () => {
  // 2010 text (DB2-EN119): "When this card inflicts Battle Damage to your opponent's Life Points, your opponent discards
  // 1 random card from their hand." The rulings page has nothing on it; every English print makes it mandatory.
  const r = both((format) => {
    const d = scenario([{ mzone: [TOON_GEMINI_ELF] }, { mzone: [FILLER], hand: [WARWOLF] }], format);
    let asked = false;
    const decline = (m) => { const a = no(m); if (a) asked = true; return a; };
    const { seen } = play(d, [turn(3), toBattle, attack(TOON_GEMINI_ELF), maybe(decline), turn(4)], 4);
    // the opponent's hand by then is Warwolf and their turn-2 draw; the discard is random, so count any card leaving it
    const out = { asked, discarded: seen.filter((e) => e.type === M.MOVE && e.from.location === L.HAND && e.to.location === L.GRAVE).length === 1 };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { asked: false, discarded: true });
  assert.deepEqual(r.current, { asked: true, discarded: false });
});

test("Spirit's Invitation: its controller selects the opponent's monster that returns", () => {
  // 2010 text (all three English prints, LOD-095 to DB2-EN204): "Each time your Spirit monster returns to your hand,
  // select 1 monster on your opponent's side of the field and return it to its owner's hand." The rulings page does not say who selects.
  const r = both((format) => {
    const d = scenario([{ hand: [SUSA], szone: [{ code: SPIRITS_INVITATION, position: P.FACEUP }] }, { mzone: [WARWOLF, VORSE] }], format);
    const note = {};
    play(d, [summon(SUSA), choose(VORSE, note), turn(2)], 2);
    const out = { selects: note.player, returned: zone(d, 1, "hand").includes(VORSE), kept: zone(d, 1, "mzone").includes(WARWOLF) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { selects: 0, returned: true, kept: true });
  assert.deepEqual(r.current, { selects: 1, returned: true, kept: true });
});

test("Super Vehicroid - Stealth Union: equips only a non-Machine monster its controller controls", () => {
  // 2010 text (GLAS-EN041): "Once per turn, you can select 1 monster you control, except a Machine-Type monster, and equip it
  // to this card." ("1 face-up monster on the field" is the 2011 reprint.) S-T, Stealth Union: "You cannot select a face-down monster".
  const r = both((format) => {
    const d = scenario([{ mzone: [STEALTH_UNION, WARWOLF, { code: VORSE, position: P.FACEDOWN_DEFENSE }] }, { mzone: [VORSE] }], format);
    const note = {};
    play(d, [activate(STEALTH_UNION), choose(WARWOLF, note), look(() => {})]);
    const out = { offered: note.offered.map((c) => `${c.controller}:${c.code}`).sort(), equipped: zone(d, 0, "szone").includes(WARWOLF) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { offered: [`0:${WARWOLF}`], equipped: true });
  assert.deepEqual(r.current, { offered: [`0:${WARWOLF}`, `1:${VORSE}`], equipped: true });
});

test("Tongue Twister: draws when it was Tribute Summoned, not when it was Tribute Set", () => {
  // S-T, Tongue Twister: "The effect of "Tongue Twister" will only activate if it was Tribute Summoned. It will not activate if it was Tribute Set [REF]."
  const r = both((format) => {
    const go = (normal) => {
      const d = scenario([{ mzone: [FILLER], hand: [TONGUE_TWISTER], deck: [FILLER, DARK_HOLE] }, {}], format);
      const { seen } = play(d, normal ? [summon(TONGUE_TWISTER), turn(3), activate(DARK_HOLE), look(() => {})] : [set(TONGUE_TWISTER), turn(3), flip(TONGUE_TWISTER), activate(DARK_HOLE), look(() => {})], 3);
      const out = { activated: chained(seen, TONGUE_TWISTER), removed: zone(d, 0, "removed").includes(TONGUE_TWISTER) };
      d.destroy();
      return out;
    };
    return { summoned: go(true), set: go(false) };
  });
  assert.deepEqual(r.edison, { summoned: { activated: 1, removed: true }, set: { activated: 0, removed: false } });
  assert.deepEqual(r.current, { summoned: { activated: 1, removed: true }, set: { activated: 1, removed: true } });
});

const EXILED_FORCE = 74131780, RED_GADGET = 86445415, YELLOW_GADGET = 13839120, STUMBLING = 34646691;

test("Simorgh, Bird of Ancestry: two face-up copies still take only 1 Tribute off", () => {
  // S-T, Simorgh: "If you control 2 or more face-up "Simorgh, Bird of Ancestry", the number of Tributes required to
  // Tribute Summon WIND monsters is still only reduced by 1." (Simorgh itself is a Level 7 WIND monster: 2 Tributes, 1 with a Simorgh out.)
  const r = both((format) => {
    const d = scenario([{ mzone: [SIMORGH, SIMORGH, FILLER], hand: [SIMORGH] }, {}], format);
    let min = null;
    play(d, [summon(SIMORGH), (m) => (m.type === M.SELECT_TRIBUTE ? ((min = m.min), "stop") : undefined)]);
    d.destroy();
    return min;
  });
  assert.deepEqual(r, { edison: 1, current: 1 });
});

test("Stumbling: its mandatory effect is Chain Link 1 before the summoner can use an Ignition Effect or an optional trigger", () => {
  // S-T, Stumbling: "The mandatory Trigger-like Effect always starts a Chain in the Summon response timing ... before optional
  // Trigger Effects ("Red Gadget") or chained Spell / Trap Cards (Trap Hole). This supersedes Ignition Effect Priority."
  const r = both((format) => {
    const go = (code) => {
      const d = scenario([{ hand: [code], deck: [FILLER, YELLOW_GADGET] }, { szone: [{ code: STUMBLING, position: P.FACEUP }] }], format);
      const { seen } = play(d, [summon(code), maybe(chain(RED_GADGET)), look(() => {})]);
      const order = seen.filter((e) => e.type === M.CHAINING).map((e) => e.code);
      const pos = monster(d, 0, code)?.position;
      d.destroy();
      return { order, defense: pos === P.FACEUP_DEFENSE };
    };
    return { exiledForce: go(EXILED_FORCE), redGadget: go(RED_GADGET) };
  });
  const want = { exiledForce: { order: [STUMBLING], defense: true }, redGadget: { order: [STUMBLING, RED_GADGET], defense: true } };
  assert.deepEqual(r, { edison: want, current: want });
});

const AIRKNIGHT = 18036057, TETHYS = 87148330, SHINING_ANGEL = 95956346, COELACANTH = 88307361, GREAT_WHITE = 13429800, SHRINK = 55713623;
const TOTEM_DRAGON = 564541, LADD = 47297616, BEHEMOTH = 43586926, SPEAR_CRETIN = 58551308, TRAP_JAMMER = 19252988, SKILL_SUCCESSOR = 73729209;
/** Marks `d.damageStep` while the duel is in the Damage Step. */
function watchDamageStep(d) {
  const advance = d.advance.bind(d);
  d.advance = () => { const out = advance(); for (const e of out) { if (e.type === M.DAMAGE_STEP_START) d.damageStep = true; if (e.type === M.DAMAGE_STEP_END) d.damageStep = false; } return out; };
  return d;
}
/** Answers "no" to an optional effect of `code`, whether it is asked as a yes/no or offered in a chain; notes that it was asked. */
const declineOptional = (code, note) => (m) => {
  if (m.type === M.SELECT_EFFECTYN && m.code === code) { note.asked = true; return { type: R.SELECT_EFFECTYN, yes: false }; }
  if (m.type === M.SELECT_CHAIN && !m.forced && m.selects.some((c) => c.code === code)) { note.asked = true; return { type: R.SELECT_CHAIN, index: null }; }
};

test("Tethys, Goddess of Light: can draw again for a Fairy drawn in the Damage Step", () => {
  // S-T, Tethys: "This effect can be activated during the Damage Step." (Today's text: "except during the Damage Step".)
  const r = both((format) => {
    const d = scenario([{ mzone: [AIRKNIGHT, TETHYS], deck: [FILLER, FILLER, SHINING_ANGEL] }, {}], format); // Airknight Parshath draws when it inflicts battle damage
    const { seen } = play(d, [turn(3), toBattle, attack(AIRKNIGHT), maybe(chain(TETHYS)), turn(4)], 4);
    const out = { tethys: chained(seen, TETHYS), drewAngel: seen.some((e) => e.type === M.DRAW && e.drawn.some((c) => c.code === SHINING_ANGEL)) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { tethys: 1, drewAngel: true });
  assert.deepEqual(r.current, { tethys: 0, drewAngel: true });
});

test("Superancient Deepsea King Coelacanth: its negation can be activated in the Damage Step", () => {
  // S-T, Coelacanth: "This effect can be activated multiple times during the same turn, and even in the Damage Step."
  const r = both((format) => {
    const d = watchDamageStep(scenario([{ mzone: [COELACANTH, GREAT_WHITE] }, { mzone: [AIRKNIGHT], hand: [SHRINK] }], format));
    let offered = null;
    const shrinkInDamageStep = (m, dd) => (dd.damageStep && m.type === M.SELECT_CHAIN && m.player === 1 ? act.chain(m, SHRINK) : undefined);
    const answer = (m, dd) => (dd.damageStep && m.type === M.SELECT_CHAIN && m.player === 0 ? ((offered = m.selects.some((c) => c.code === COELACANTH)), "stop") : undefined);
    const { seen } = play(d, [turn(2), toBattle, attack(AIRKNIGHT), pick(COELACANTH), shrinkInDamageStep, pick(COELACANTH), answer], 2);
    d.destroy();
    return { shrink: chained(seen, SHRINK), offered };
  });
  assert.deepEqual(r, { edison: { shrink: 1, offered: true }, current: { shrink: 1, offered: false } });
});

test("Totem Dragon: activates again in the same Standby Phase after its activation is negated", () => {
  // S-T, Totem Dragon: "This effect can be used more than once per turn (if initially negated by "Royal Oppression")."
  const r = both((format) => {
    const d = scenario([{ grave: [TOTEM_DRAGON] }, { mzone: [LADD] }], format); // Light and Darkness Dragon negates every activation while it has ATK left
    const { seen } = play(d, [look(() => {})]);
    const out = { activations: chained(seen, TOTEM_DRAGON) > 1, summoned: zone(d, 0, "mzone").includes(TOTEM_DRAGON) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { activations: true, summoned: true });
  assert.deepEqual(r.current, { activations: false, summoned: false });
});

test("Twin-Headed Behemoth: it is Special Summoned in the End Phase whether you want it or not", () => {
  // 2010 text: "If this card is destroyed and sent from the field to the Graveyard, Special Summon it during the End Phase of this turn
  // with 1000 ATK and 1000 DEF." S-T: "If "Twin-Headed Behemoth" would be Special Summoned by its own effect, but your Monster Card Zones
  // are full ... it still considered that its effect was activated".
  const r = both((format) => {
    const d = scenario([{ mzone: [BEHEMOTH], hand: [DARK_HOLE] }, {}], format);
    const note = { asked: false };
    play(d, [activate(DARK_HOLE), maybe(declineOptional(BEHEMOTH, note)), turn(2)], 2);
    const out = { asked: note.asked, summoned: zone(d, 0, "mzone").includes(BEHEMOTH) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { asked: false, summoned: true });
  assert.deepEqual(r.current, { asked: true, summoned: false });
});

test("Spear Cretin: each player may choose not to Special Summon", () => {
  // S-T, Spear Cretin: "Special Summoning a monster is optional."
  const r = both((format) => {
    const d = scenario([{ mzone: [{ code: SPEAR_CRETIN, position: P.FACEDOWN_DEFENSE }], grave: [WARWOLF], hand: [DARK_HOLE] }, { grave: [VORSE] }], format);
    const mins = [];
    const seeMin = (m) => { if (m.type === M.SELECT_CARD && m.selects.some((c) => c.code === WARWOLF || c.code === VORSE)) mins.push([m.player, m.min]); };
    run(d, (m) => { seeMin(m); if (d.turn > 1) return "stop"; if (idle(m) && m.pos_changes.some((c) => c.code === SPEAR_CRETIN)) return flip(SPEAR_CRETIN)(m); if (idle(m) && m.activates.some((c) => c.code === DARK_HOLE)) return activate(DARK_HOLE)(m); }, 300);
    d.destroy();
    return mins;
  });
  assert.deepEqual(r.edison, [[0, 0], [1, 0]]);
  assert.deepEqual(r.current, [[0, 1], [1, 1]]);
});

test("Trap Jammer: can negate a Trap Card activated in the Damage Step (current script already does this)", () => {
  // S-T, Trap Jammer: "You can activate "Trap Jammer" during the Damage Step."
  const r = both((format) => {
    const d = watchDamageStep(scenario([{ mzone: [VORSE], szone: [SKILL_SUCCESSOR] }, { mzone: [WARWOLF], szone: [TRAP_JAMMER] }], format));
    let offered = null;
    const successor = (m, dd) => (dd.damageStep && m.type === M.SELECT_CHAIN && m.player === 0 ? act.chain(m, SKILL_SUCCESSOR) : undefined);
    const answer = (m, dd) => (m.type === M.SELECT_CHAIN && m.player === 1 && dd.chain?.length ? ((offered = m.selects.some((c) => c.code === TRAP_JAMMER)), "stop") : undefined);
    play(d, [turn(2), toBattle, attack(WARWOLF), successor, pick(VORSE), answer], 2);
    d.destroy();
    return offered;
  });
  assert.deepEqual(r, { edison: true, current: true });
});

const SNIPE_HUNTER = 84290642, STARDUST = 44508094, RAIOH = 71564252, SANGAN = 26202165, TORRENTIAL = 53582587;

test("Snipe Hunter: Stardust Dragon cannot be activated in response, as the destruction is not certain (current script already does this)", () => {
  // S-T, Snipe Hunter: "It is unknown whether a card will be destroyed, therefore cards whose activation requirement specify 'when your
  // opponent activates a card or effect that would destroy a card(s) on the field' cannot be activated in response to this effect (such as
  // "Stardust Dragon", "Destruction Jammer", and "My Body as a Shield")."
  const r = both((format) => {
    const d = scenario([{ mzone: [SNIPE_HUNTER], hand: [FILLER] }, { mzone: [STARDUST] }], format);
    let offered = null;
    const { seen } = play(d, [activate(SNIPE_HUNTER), pick(FILLER), pick(STARDUST), (m) => (m.type === M.SELECT_CHAIN && m.player === 1 ? ((offered = m.selects.some((c) => c.code === STARDUST)), "stop") : undefined)]);
    d.destroy();
    return { snipe: chained(seen, SNIPE_HUNTER), offered };
  });
  assert.deepEqual(r, { edison: { snipe: 1, offered: false }, current: { snipe: 1, offered: false } });
});

test("Thunder King Rai-Oh: Sangan's mandatory effect still activates, but adds nothing (current script already does this)", () => {
  // S-T, Thunder King Rai-Oh: "Cards / Effects that add a card(s) from Deck to hand (ex: "Terraforming", "Elemental Hero Stratos") cannot
  // activate. Mandatory effects (like "Sangan" still activate, starting a chain)."
  const r = both((format) => {
    const d = scenario([{ mzone: [SANGAN], deck: [FILLER, FILLER] }, { mzone: [RAIOH] }], format);
    const { seen } = play(d, [turn(2), toBattle, attack(RAIOH), turn(3)], 3);
    const out = { sangan: chained(seen, SANGAN), searched: seen.filter((e) => e.type === M.MOVE && e.from.location === L.DECK && e.to.location === L.HAND).length };
    d.destroy();
    return out;
  });
  assert.deepEqual(r, { edison: { sangan: 1, searched: 0 }, current: { sangan: 1, searched: 0 } });
});

test("Shining Angel: Torrential Tribute cannot be activated against its Special Summon in the Damage Step (current script already does this)", () => {
  // S-T, Shining Angel: "Since the Special Summoning occurs during the Damage Step, "Torrential Tribute", etc. cannot be used."
  const r = both((format) => {
    const d = scenario([{ mzone: [SHINING_ANGEL], deck: [FILLER, SHINING_ANGEL] }, { mzone: [WARWOLF], szone: [TORRENTIAL] }], format);
    let offered = false;
    const watch = (m) => { if (m.type === M.SELECT_CHAIN && m.player === 1 && m.selects.some((c) => c.code === TORRENTIAL)) offered = true; };
    const { seen } = play(d, [turn(2), toBattle, attack(WARWOLF), maybe(chain(SHINING_ANGEL)), Object.assign((m) => { watch(m); return idle(m) ? "stop" : undefined; })], 2);
    const out = { summoned: zone(d, 0, "mzone").includes(SHINING_ANGEL), offered, torrential: chained(seen, TORRENTIAL) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r, { edison: { summoned: true, offered: false, torrential: 0 }, current: { summoned: true, offered: false, torrential: 0 } });
});
