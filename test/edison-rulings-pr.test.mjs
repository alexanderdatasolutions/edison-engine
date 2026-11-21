// Cards P to R checked against edisonformat.com, Individual Card Rulings [P-R]: each test states the ruling (or the 2010
// text where the page leaves it open) and runs it under the Edison scripts and, where they differ, the upstream ones.
import test from "node:test";
import assert from "node:assert/strict";
import { scenario, run, act, edison, M, R, L, P, I } from "./scenario.js";

const current = { ...edison, scriptDirs: edison.scriptDirs.filter((d) => !d.startsWith("./")) };

// The helpers of test/edison-errata.test.mjs.
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
  }, 1500);
  return { done, seen };
}
const maybe = (step) => Object.assign((m, d) => step(m, d), { optional: true });
const both = (fn) => ({ edison: fn(edison), current: fn(current) });
const idle = (m) => m.type === M.SELECT_IDLECMD;
const offers = (m, code) => idle(m) && m.activates.some((c) => c.code === code);
const zone = (d, team, name) => d.view(team).players[team][name].filter(Boolean).map((c) => c.code);
const summoned = (seen, code) => seen.filter((e) => e.type === M.SPSUMMONING && e.code === code).length;
const chained = (seen, code) => seen.filter((e) => e.type === M.CHAINING && e.code === code).length;
const activate = (code) => (m) => act.activate(m, code);
const summon = (code) => (m) => act.summon(m, code);
const pick = (...codes) => (m) => act.pick(m, ...codes);
const chain = (code) => (m) => act.chain(m, code);
const peek = (fn) => (m, d) => (idle(m) ? (fn(m, d), null) : undefined);
const turn = (n) => (m, d) => (d.turn >= n && idle(m) ? null : undefined);
const look = (fn) => (m, d) => (idle(m) ? (fn(m, d), "stop") : undefined);
const late = (n, step) => (m, d) => (d.turn >= n ? step(m, d) : undefined);

const FILLER = 15025844, WARWOLF = 69247929, KREBONS = 59575539, CAPTAIN = 2460565;
const PYRO_CLOCK = 1082946, SWORDS = 72302403;
const PUPPET_KING = 3167573, REINCARNATION = 74848038, REINFORCEMENT = 32807846;

// Pyro Clock of Destiny, 2010 text: "Move the turn count forward by 1 turn." The rulings page: "You can use "Pyro Clock of
// Destiny" to advance the turn count by 1 for these cards: "Deck Devastation Virus", "Swords of Revealing Light", ...".
// The 2010 text names no card to choose: every turn count moves (upstream: the OCG's "one effect that counts turns").
test("Pyro Clock of Destiny: moves forward the turn count of every card that counts turns, both players'", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [SWORDS] }, { hand: [SWORDS], szone: [PYRO_CLOCK] }], format);
    const out = {};
    const swords = () => [zone(d, 0, "szone").includes(SWORDS), zone(d, 1, "szone").includes(SWORDS)];
    // Turn 1: player 0's Swords (ends after the opponent's 3rd turn: turn 6). Turn 2: player 1's Swords (turn 7), then Pyro Clock.
    play(d, [activate(SWORDS), turn(2), activate(SWORDS), activate(PYRO_CLOCK), maybe(pick(SWORDS)), turn(5), peek(() => (out.turn5 = swords())), turn(6), peek(() => (out.turn6 = swords()))], 6);
    d.destroy();
    return out;
  });
  // Without Pyro Clock: player 0's Swords goes in the End Phase of turn 6, player 1's in that of turn 7.
  assert.deepEqual(r.edison, { turn5: [false, true], turn6: [false, false] });
  assert.equal(r.current.turn6.filter(Boolean).length, 1, "upstream moves one chosen card's count");
});

// Puppet King, 2010 text: "When your opponent adds a Monster Card(s) to their hand, except by drawing, you can Special
// Summon this card from your hand." Upstream (OCG): "from the Deck" only. Rulings page: "Both effects of "Puppet King" are
// Trigger Effects. You can Special Summon it by its effect during either player's turn."
test("Puppet King: Special Summons when the opponent adds a monster from their Graveyard to their hand", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [PUPPET_KING] }, { hand: [REINCARNATION, FILLER], grave: [KREBONS] }], format);
    const { seen } = play(d, [turn(2), activate(REINCARNATION), pick(KREBONS), turn(3)], 3);
    const out = { added: zone(d, 1, "hand").includes(KREBONS), king: summoned(seen, PUPPET_KING), summoned: zone(d, 0, "mzone").includes(PUPPET_KING) };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { added: true, king: 1, summoned: true });
  assert.deepEqual(r.current, { added: true, king: 0, summoned: false });
});

test("Puppet King: still Special Summons when the opponent searches their Deck, and is destroyed in its controller's next End Phase", () => {
  const r = both((format) => {
    const d = scenario([{ hand: [PUPPET_KING] }, { hand: [REINFORCEMENT], deck: [FILLER, CAPTAIN] }], format);
    const out = {};
    const { seen } = play(d, [turn(2), activate(REINFORCEMENT), maybe(pick(CAPTAIN)), turn(3), peek(() => (out.turn3 = zone(d, 0, "mzone").includes(PUPPET_KING))), turn(4)], 4);
    Object.assign(out, { king: summoned(seen, PUPPET_KING), turn4: zone(d, 0, "mzone").includes(PUPPET_KING) });
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { turn3: true, king: 1, turn4: false });
  assert.deepEqual(r.current, r.edison);
});

// Prohibition, 2010 text: "Cards on the field before this card was activated are not affected (including face-down cards)."
// Rulings page, "cannot be used" means the declared card "can't activate its effects in the Graveyard, unless it was on the
// field before "Prohibition"": "Example 1: "Necro Gardna" is declared while it is in the Graveyard. Its effect cannot
// activate." "Example 2: "Necro Gardna" is declared while it is on the field. Once it is sent to the Graveyard, it can
// activate its effect, even if "Prohibition" is still active." Upstream (today's ruling) affects every copy off the field.
const PROHIBITION = 43711255, NECRO_GARDNA = 4906301, BLUE_EYES = 89631139, SPELL_CANCELLER = 84636823;
const declare = (code) => (m) => (m.type === M.ANNOUNCE_CARD ? { type: R.ANNOUNCE_CARD, card: code } : undefined);
const attack = (code) => (m) => act.attack(m, code);
const toBattle = (m) => act.toBattle(m);
// Turn 2: the opponent's two Blue-Eyes attack; the first destroys an Attack Position Necro Gardna. Is Gardna offered against the second?
const gardnaOffered = (format, sides, named = NECRO_GARDNA) => {
  const d = scenario(sides, format);
  let offered = false;
  const watch = (m, dd) => { if (dd.turn === 2 && m.type === M.SELECT_CHAIN && m.selects.some((c) => c.code === NECRO_GARDNA)) offered = true; return undefined; };
  const steps = [activate(PROHIBITION), declare(named), turn(2), toBattle, attack(BLUE_EYES), maybe(pick(NECRO_GARDNA)), attack(BLUE_EYES), turn(3)];
  const { done } = play(d, steps.map((s) => (m, dd) => (watch(m, dd), s(m, dd))), 3);
  d.destroy();
  return { done, offered };
};
test("Prohibition: a declared monster that was on the field when it was activated can use its effect in the Graveyard", () => {
  const r = both((format) => ({
    wasOnField: gardnaOffered(format, [{ hand: [PROHIBITION], mzone: [NECRO_GARDNA] }, { mzone: [BLUE_EYES, BLUE_EYES] }]).offered,
    wasInGrave: gardnaOffered(format, [{ hand: [PROHIBITION], grave: [NECRO_GARDNA] }, { mzone: [BLUE_EYES, BLUE_EYES, BLUE_EYES] }]).offered,
    otherName: gardnaOffered(format, [{ hand: [PROHIBITION], grave: [NECRO_GARDNA] }, { mzone: [BLUE_EYES, BLUE_EYES, BLUE_EYES] }], FILLER).offered,
  }));
  assert.deepEqual(r.edison, { wasOnField: true, wasInGrave: false, otherName: true });
  assert.deepEqual(r.current, { wasOnField: false, wasInGrave: false, otherName: true });
});

test("Prohibition: a monster Summoned after it was Set but before it was activated is not affected; another copy cannot be Summoned (upstream already does this)", () => {
  const setSpell = (code) => (m) => act.setSpell(m, code);
  const r = both((format) => {
    const d = scenario([{ hand: [PROHIBITION, WARWOLF], deck: [FILLER, FILLER, WARWOLF] }, {}], format);
    const out = {};
    const battle = (m) => (m.type === M.SELECT_BATTLECMD ? ((out.canAttack = m.attacks.some((c) => c.code === WARWOLF)), null) : undefined);
    play(d, [setSpell(PROHIBITION), summon(WARWOLF), turn(3), activate(PROHIBITION), declare(WARWOLF), peek((m) => (out.summonAnother = m.summons.some((c) => c.code === WARWOLF))), toBattle, battle], 3);
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { summonAnother: false, canAttack: true });
  assert.deepEqual(r.current, r.edison);
});

// Recycle, rulings page: "If you meet the condition enough times, you can activate "Recycle" as many times as you want in
// the same Standby Phase." Upstream: once per Standby Phase.
test("Recycle: can be used again and again in the same Standby Phase", () => {
  const RECYCLE = 96316857, MST = 5318639;
  const r = both((format) => {
    const d = scenario([{ szone: [{ code: RECYCLE, position: P.FACEUP }], grave: [MST, MST, MST] }, {}], format);
    const { seen } = play(d, [look(() => {})]);
    const out = { uses: chained(seen, RECYCLE), lp: d.lp[0], left: zone(d, 0, "grave").length };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { uses: 3, lp: 8000 - 900, left: 0 });
  assert.deepEqual(r.current, { uses: 1, lp: 8000 - 300, left: 2 });
});

// Royal Oppression, rulings page: "This effect can be used when "Royal Oppression" is activated (flipped face-up)." "This
// effect can activate in response to the activation of a Card / Effect that would perform a Special Summon (ex: "Debris
// Dragon", "Miracle Fusion", "Call of the Haunted")." The core offers the effect as the card is activated (upstream already does this).
test("Royal Oppression: can be activated in response to Call of the Haunted and negate it at once (upstream already does this)", () => {
  const ROYAL_OPPRESSION = 93016201, CALL = 97077563;
  const lastOf = (code) => (m) => { if (m.type !== M.SELECT_CHAIN) return; const i = m.selects.findLastIndex((c) => c.code === code); return i < 0 ? undefined : { type: R.SELECT_CHAIN, index: i }; };
  const r = both((format) => {
    const d = scenario([{ szone: [ROYAL_OPPRESSION] }, { szone: [CALL], grave: [WARWOLF] }], format);
    const { done } = play(d, [turn(2), activate(CALL), maybe(pick(WARWOLF)), lastOf(ROYAL_OPPRESSION), look(() => {})], 2);
    const out = { done, revived: zone(d, 1, "mzone").includes(WARWOLF), call: zone(d, 1, "grave").includes(CALL), lp: d.lp[0] };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { done: 5, revived: false, call: true, lp: 7200 });
  assert.deepEqual(r.current, r.edison);
});

// Phantom of Chaos, 2010 text: "you can remove from play 1 Effect Monster in your Graveyard"; rulings page: "This effect
// targets 1 Effect Monster in your Graveyard. You cannot target a non-effect monster, nor can you target a Gemini monster."
// (A Gemini monster in the Graveyard is a Normal Monster there; a monster on the field is offered only under Spirit Elimination.)
test("Phantom of Chaos: copies only an Effect Monster in the Graveyard, never a monster on the field or a Gemini monster (upstream already does this)", () => {
  const PHANTOM = 30312361, KNOSPE = 62107981, GEMINI = 69488544; // Phoenix Gearfried: Gemini
  const r = both((format) => {
    const choices = (sides) => {
      const d = scenario(sides, format);
      let offered = null, choices = null;
      play(d, [look((m) => (offered = offers(m, PHANTOM))), ], 1);
      d.destroy();
      if (!offered) return null;
      const d2 = scenario(sides, format);
      play(d2, [activate(PHANTOM), (m) => (m.type === M.SELECT_CARD ? ((choices = m.selects.map((c) => c.code).sort()), "stop") : undefined)], 1);
      d2.destroy();
      return choices;
    };
    return { gemini: choices([{ mzone: [PHANTOM, KNOSPE], grave: [GEMINI] }, {}]), both: choices([{ mzone: [PHANTOM, KNOSPE], grave: [GEMINI, KNOSPE] }, {}]) };
  });
  assert.deepEqual(r.edison, { gemini: null, both: [KNOSPE] });
  assert.deepEqual(r.current, r.edison);
});

// Rivalry of Warlords, rulings page: "While this effect applies: You can Tribute Summon a monster of any Type by Tributing
// your only face-up monster(s). Konami's reversal of this ruling was delivered months after SJC Edison." While you control
// a face-up monster you still cannot Normal Summon a monster of another Type without Tributing it.
test("Rivalry of Warlords: a monster of another Type can be Tribute Summoned by Tributing the only face-up monster", () => {
  const RIVALRY = 90846359, LUSTER2 = 17658803, LUSTER = 11091375; // Luster Dragons: Dragon; Gene-Warped Warwolf: Beast-Warrior
  const r = both((format) => {
    const can = (mzone, hand) => {
      const d = scenario([{ mzone, hand, szone: [{ code: RIVALRY, position: P.FACEUP }] }, {}], format);
      let out = null;
      play(d, [look((m) => (out = m.summons.map((c) => c.code)))]);
      d.destroy();
      return out;
    };
    return { tribute: can([WARWOLF], [LUSTER2]).includes(LUSTER2), plain: can([WARWOLF], [LUSTER]).includes(LUSTER), keepsOne: can([WARWOLF, WARWOLF], [LUSTER2]).includes(LUSTER2) };
  });
  assert.deepEqual(r.edison, { tribute: true, plain: false, keepsOne: false });
  assert.deepEqual(r.current, { tribute: false, plain: false, keepsOne: false });
  const d = scenario([{ mzone: [WARWOLF], hand: [LUSTER2], szone: [{ code: RIVALRY, position: P.FACEUP }] }, {}]);
  play(d, [summon(LUSTER2), look(() => {})]);
  assert.deepEqual([zone(d, 0, "mzone"), zone(d, 0, "grave")], [[LUSTER2], [WARWOLF]]);
  d.destroy();
});

// Raging Flame Sprite, rulings page: "The effect of "Raging Flame Sprite" is a Continuous Effect that cannot be chained to."
test("Raging Flame Sprite: gains 1000 ATK after a direct attack without starting a Chain", () => {
  const SPRITE = 90810762;
  const r = both((format) => {
    const d = scenario([{ mzone: [SPRITE] }, { mzone: [WARWOLF] }], format);
    const { seen } = play(d, [turn(3), toBattle, attack(SPRITE), maybe(pick()), turn(4)], 4);
    const out = { chains: chained(seen, SPRITE), atk: d.view(0).players[0].mzone.find((c) => c?.code === SPRITE).attack, lp: d.lp[1] };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { chains: 0, atk: 1100, lp: 7900 });
  assert.deepEqual(r.current, { chains: 1, atk: 1100, lp: 7900 });
});

// Penumbral Soldier Lady, rulings page: ""Penumbral Soldier Lady"'s ATK increases during the Damage Step and this effect can
// be chained to." "The increase to "Penumbral Soldier Lady's" ATK from her effect only lasts until the end of the Damage Step."
test("Penumbral Soldier Lady: the ATK gain against a LIGHT monster starts a Chain in the Damage Step", () => {
  const LADY = 64751286, SHINING_ANGEL = 95956346; // Shining Angel: LIGHT, 1400 ATK
  const r = both((format) => {
    const d = scenario([{ mzone: [LADY] }, { mzone: [SHINING_ANGEL] }], format);
    const { seen } = play(d, [turn(3), toBattle, attack(LADY), maybe(pick(SHINING_ANGEL)), turn(4)], 4);
    const out = { chains: chained(seen, LADY), lp: d.lp[1], atkAfter: d.view(0).players[0].mzone.find((c) => c?.code === LADY).attack };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { chains: 1, lp: 8000 - (3100 - 1400), atkAfter: 2100 });
  assert.deepEqual(r.current, { chains: 0, lp: 8000 - (3100 - 1400), atkAfter: 2100 });
});
