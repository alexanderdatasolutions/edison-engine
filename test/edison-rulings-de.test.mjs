// Cards D to E against https://www.edisonformat.com/rulings ("Individual Card Rulings [D-E]" and "Relevant Errata").
// Each test quotes the ruling it pins. Where the current-text script plays differently, `both` shows the two.
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
const offered = (m, code) => (idle(m) ? m.activates.filter((c) => c.code === code).length : 0);
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
const specialSummon = (code) => (m) => act.special(m, code);
const toBattle = (m) => act.toBattle(m);
const attack = (code) => (m) => act.attack(m, code);
const turn = (n) => (m, d) => (d.turn >= n && idle(m) ? null : undefined); // wait for the Main Phase of turn n
const look = (fn) => (m, d) => (idle(m) ? (fn(m, d), "stop") : undefined); // inspect the next Main Phase prompt, then stop
const yes = (m) => (m.type === M.SELECT_EFFECTYN || m.type === M.SELECT_YESNO ? { type: m.type === M.SELECT_EFFECTYN ? R.SELECT_EFFECTYN : R.SELECT_YESNO, yes: true } : undefined);
const no = (m) => (m.type === M.SELECT_EFFECTYN || m.type === M.SELECT_YESNO ? { type: m.type === M.SELECT_EFFECTYN ? R.SELECT_EFFECTYN : R.SELECT_YESNO, yes: false } : undefined);
const faceUp = (code) => ({ code, position: P.FACEUP });
const set = (code) => ({ code, position: P.FACEDOWN_DEFENSE });

const FILLER = 15025844, WARWOLF = 69247929, VORSE = 14898066, BLUE_EYES = 89631139, DARK_HOLE = 53129443, MST = 5318639, BOOK_OF_MOON = 14087893;
const RAIGEKI_BREAK = 4178474, DD_CROW = 24508238, CAIUS = 9748752, CALL_OF_THE_HAUNTED = 97077563, RYKO = 21502796, NECROVALLEY = 47355498;
const DANDYLION = 15341821, FLUFF_TOKEN = 15341822, DUPE_FROG = 46239604, SWAP_FROG = 9126351, TREEBORN = 12538374, EHREN = 44178886, STRATOS = 40044918, SPARKMAN = 20721928;
const DRILL_WARRIOR = 3429238, DIVINE_WRATH = 49010598, DDWL = 7572887, DARK_GAIA = 58332301, PLASMA = 83965310, DOOMCALIBER = 78700060, DARK_HORUS = 66214679;
const DIMENSIONAL_PRISON = 70342110, ABSOLUTE_ZERO = 40854197, DAD = 65192027, MALICIOUS = 9411399, DEBRIS = 14943837;

const DUST_TORNADO = 60082869, TOMATO = 83011277, PRODIGY = 50304345, DASHER = 81866673, MACRO_COSMOS = 30241314, SOUL_RELEASE = 5758500, MONSTER_REBORN = 83764718, LONEFIRE = 48686504;
const hand = (d, team) => zone(d, team, "hand").length;

// ---- Mismatches fixed by an Edison script ----

// "Evil Hero Dark Gaia": "The (2) mandatory Trigger Effect activates in at the Start of the Battle Step - Attack Declaration."
test("Evil Hero Dark Gaia: changing the opponent's Defense Position monsters to Attack Position when it attacks is mandatory", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [set(FILLER)] }, { mzone: [DARK_GAIA] }], format);
    let asked = 0;
    const { seen } = play(d, [turn(2), toBattle, attack(DARK_GAIA), maybe((m) => { const a = no(m); if (a) asked++; return a; }), turn(3)], 3);
    const out = { asked, activated: chained(seen, DARK_GAIA), position: d.view(0).players[0].mzone.filter(Boolean)[0]?.position };
    d.destroy();
    return out;
  });
  assert.deepEqual(r.edison, { asked: 0, activated: 1, position: P.FACEUP_ATTACK });
  assert.equal(r.current.asked, 1, "today's text says \"you can\"");
});

// "Drill Warrior": "(1) Once per turn, during your Main Phase, you can halve this card's ATK (permanently)." The 2010 text says Main Phase, not Main Phase 1.
test("Drill Warrior: halving its ATK to attack directly can be activated in Main Phase 2", () => {
  const r = both((format) => {
    const d = scenario([{ mzone: [DRILL_WARRIOR], hand: [FILLER] }, {}], format);
    let mp1 = null, mp2 = null;
    play(d, [turn(3), (m) => (idle(m) ? ((mp1 = offered(m, DRILL_WARRIOR)), null) : undefined), toBattle, look((m) => (mp2 = offered(m, DRILL_WARRIOR)))], 3);
    d.destroy();
    return { mp1, mp2 };
  });
  assert.deepEqual(r.edison, { mp1: 2, mp2: 2 });
  assert.deepEqual(r.current, { mp1: 2, mp2: 1 });
});

// "Dark Horus": "The (1) optional Trigger Effect activates AFTER a Spell Card's activation resolved (starting a new chain).
// This effect CAN miss the timing if Chain Link 1 was NOT the activation of a Spell Card."
test("Dark Horus: activates after the Spell Card resolves, and misses its timing when Chain Link 1 was a Trap Card", () => {
  const r = both((format) => ["spell", "trapFirst"].map((kind) => {
    const d = scenario([{ mzone: [DARK_HORUS], szone: [DARK_HOLE, DARK_HOLE], grave: [TOMATO] }, { szone: [DUST_TORNADO, MST] }], format);
    const steps = kind === "spell" ? [turn(2), activate(MST), pick(DARK_HOLE), turn(3)] : [turn(2), activate(DUST_TORNADO), pick(DARK_HOLE), chain(MST), pick(DARK_HOLE), turn(3)];
    const { seen } = play(d, steps, 3);
    const horusAt = seen.findIndex((e) => e.type === M.CHAINING && e.code === DARK_HORUS);
    const spellAt = seen.findIndex((e) => e.type === M.CHAINING && e.code === MST);
    const out = { activated: chained(seen, DARK_HORUS), afterResolution: horusAt >= 0 && seen.slice(spellAt, horusAt).some((e) => e.type === M.CHAIN_END) };
    d.destroy();
    return out;
  }));
  assert.deepEqual(r.edison, [{ activated: 1, afterResolution: true }, { activated: 0, afterResolution: false }]);
  assert.deepEqual(r.current.map((x) => x.activated), [1, 1]);
});

// "Evil Hero Infernal Prodigy": "This effect WILL STILL activate if Prodigy is removed from play when Tributed (by "Macro Cosmos") or after it was Tributed (by "Soul Release")."
// "The (1) effect will NOT trigger if: after being Tributed, Prodigy is Special Summoned to the field prior to the End Phase."
test("Evil Hero Infernal Prodigy: still draws in the End Phase when it was removed from play, not when it came back to the field", () => {
  const draws = (format, extra) => {
    const d = scenario([{ mzone: [PRODIGY], hand: [DASHER, ...(extra.hand ?? [])], szone: extra.szone ?? [], deck: [FILLER, FILLER] }, {}], format);
    const steps = [summon(DASHER), maybe(pick(PRODIGY)), ...(extra.steps ?? []), turn(2)];
    play(d, steps, 2);
    const out = hand(d, 0) - 1; // less the turn's normal draw; the cards in `extra.hand` have been used
    d.destroy();
    return out;
  };
  const cases = (format) => ({
    grave: draws(format, {}),
    macro: draws(format, { szone: [faceUp(MACRO_COSMOS)] }),
    soulRelease: draws(format, { hand: [SOUL_RELEASE], steps: [activate(SOUL_RELEASE), pick(PRODIGY)] }),
    reborn: draws(format, { hand: [MONSTER_REBORN], steps: [activate(MONSTER_REBORN), maybe(pick(PRODIGY))] }),
  });
  const r = both(cases);
  assert.deepEqual(r.edison, { grave: 1, macro: 1, soulRelease: 1, reborn: 0 });
  assert.deepEqual(r.current, { grave: 1, macro: 0, soulRelease: 0, reborn: 0 });
});

// ---- Rulings the engine already plays as ruled (Edison and today's scripts alike) ----
const same = (r) => { assert.deepEqual(r.current, r.edison); return r.edison; };

// "Dandylion": "This effect activates even if "Dandylion" is moved from the Graveyard during the chain. Example 1: "Dandylion" is discarded as cost for "Raigeki Break" (Chain Link 1) and is removed from play by "D.D.Crow" (Chain Link 2)."
test("Dandylion: still Summons both Fluff Tokens when D.D. Crow removes it in a chain", () => {
  const r = same(both((format) => {
    const d = scenario([{ szone: [RAIGEKI_BREAK], hand: [DANDYLION] }, { mzone: [WARWOLF], hand: [DD_CROW] }], format);
    const { seen } = play(d, [activate(RAIGEKI_BREAK), maybe(pick(DANDYLION)), pick(WARWOLF), chain(DD_CROW), maybe(pick(DANDYLION)), look(() => {})]);
    const out = { crow: chained(seen, DD_CROW), dandylion: chained(seen, DANDYLION), tokens: zone(d, 0, "mzone").filter((c) => c === FLUFF_TOKEN || c === FLUFF_TOKEN + 1).length };
    d.destroy();
    return out;
  }));
  assert.deepEqual(r, { crow: 1, dandylion: 1, tokens: 2 });
});

// "Dupe Frog": "This effect will NOT activate if "Dupe Frog" was Tributed for a cost or a Tribute Summon." / "This effect WILL activate if "Dupe Frog" is sent to the Graveyard as the last part of Chain Link 1."
test("Dupe Frog: no search when Tributed for a Tribute Summon; a search when Dark Hole destroys it", () => {
  const r = same(both((format) => [CAIUS, DARK_HOLE].map((code) => {
    const d = scenario([{ mzone: [DUPE_FROG], hand: [code], deck: [FILLER, SWAP_FROG] }, { mzone: [WARWOLF] }], format);
    const { seen } = play(d, [code === CAIUS ? summon(CAIUS) : activate(DARK_HOLE), look(() => {})]);
    const out = chained(seen, DUPE_FROG);
    d.destroy();
    return out;
  })));
  assert.deepEqual(r, [0, 1]);
});

// "Elemental Hero Stratos": "The (1) optional "When... you can..." Trigger Effect (both (A) and (B)) can miss the timing."
test("Elemental Hero Stratos: misses its timing when Special Summoned as Chain Link 2", () => {
  const r = same(both((format) => [false, true].map((midChain) => {
    const d = scenario([{ szone: [MST, CALL_OF_THE_HAUNTED], grave: [STRATOS], deck: [FILLER, SPARKMAN] }, { szone: [DARK_HOLE] }], format);
    const steps = midChain ? [activate(MST), pick(DARK_HOLE), chain(CALL_OF_THE_HAUNTED), pick(STRATOS), look(() => {})] : [activate(CALL_OF_THE_HAUNTED), pick(STRATOS), look(() => {})];
    const { seen } = play(d, steps);
    const out = chained(seen, STRATOS);
    d.destroy();
    return out;
  })));
  assert.deepEqual(r, [1, 0]);
});

// "Divine Wrath": "Negate the activation of an Effect Monster's effect, and destroy that Effect Monster. This card can be activated any time during the turn, including the Damage Step"
// "D.D. Warrior Lady": "This effect activates in Substep 6 - Resolve Effects of the Damage Step."
test("D.D. Warrior Lady: its Damage Step effect can be negated by Divine Wrath, and nothing is removed", () => {
  const r = same(both((format) => {
    const d = scenario([{ mzone: [WARWOLF], szone: [DIVINE_WRATH], hand: [FILLER] }, { mzone: [DDWL] }], format);
    const { seen } = play(d, [turn(2), toBattle, attack(DDWL), maybe(chain(DDWL)), chain(DIVINE_WRATH), turn(3)], 3);
    const out = { lady: chained(seen, DDWL), wrath: chained(seen, DIVINE_WRATH), mine: zone(d, 0, "mzone"), ladyTo: zone(d, 1, "grave") };
    d.destroy();
    return out;
  }));
  assert.deepEqual(r, { lady: 1, wrath: 1, mine: [WARWOLF], ladyTo: [DDWL] });
});

// "Destiny Hero - Plasma": "If Plasma is flipped face-down / leaves the field (ex: "Book of Moon" / "Karma Cut") before this effect resolves, this effect still applies and sends the target to the Graveyard"
test("Destiny Hero - Plasma: Book of Moon on Plasma in a chain still sends the target to the Graveyard", () => {
  const r = same(both((format) => {
    const d = scenario([{ mzone: [PLASMA] }, { mzone: [WARWOLF], szone: [BOOK_OF_MOON] }], format);
    play(d, [activate(PLASMA), pick(WARWOLF), chain(BOOK_OF_MOON), pick(PLASMA), look(() => {})]);
    const out = { theirs: zone(d, 1, "mzone"), equipped: zone(d, 0, "szone"), sent: zone(d, 1, "grave").includes(WARWOLF) };
    d.destroy();
    return out;
  }));
  assert.deepEqual(r, { theirs: [], equipped: [], sent: true });
});

// "Doomcaliber Knight": "The (1) mandatory Quick Effect MUST activate whenever its activation requirement is met."
test("Doomcaliber Knight: activates by itself against Stratos's effect and negates it", () => {
  const r = same(both((format) => {
    const d = scenario([{ mzone: [DOOMCALIBER], hand: [STRATOS], deck: [FILLER, SPARKMAN] }, {}], format);
    const { seen } = play(d, [summon(STRATOS), look(() => {})]);
    const out = { doomcaliber: chained(seen, DOOMCALIBER), field: zone(d, 0, "mzone"), searched: zone(d, 0, "hand").includes(SPARKMAN) };
    d.destroy();
    return out;
  }));
  assert.deepEqual(r, { doomcaliber: 1, field: [], searched: false });
});

// "Dimensional Prison": "if "Book of Moon" is Chained to an effect like "Dimensional Prison" ... the attacking monster is not destroyed (or removed from play, and so on)."
test("Dimensional Prison: Book of Moon on the attacker in a chain stops the removal", () => {
  const r = same(both((format) => {
    const d = scenario([{ szone: [DIMENSIONAL_PRISON, BOOK_OF_MOON] }, { mzone: [WARWOLF] }], format);
    play(d, [turn(2), toBattle, attack(WARWOLF), chain(DIMENSIONAL_PRISON), chain(BOOK_OF_MOON), pick(WARWOLF), turn(3)], 3);
    const out = { field: zone(d, 1, "mzone"), removed: zone(d, 1, "removed") };
    d.destroy();
    return out;
  }));
  assert.deepEqual(r, { field: [WARWOLF], removed: [] });
});

// "Elemental Hero Absolute Zero": "ACTIVATES IF: this face-up card leaves the field" / "DOES NOT ACTIVATE IF: this face-down card leaves the field"
test("Elemental Hero Absolute Zero: destroys the opponent's monsters when it leaves face-up, not face-down", () => {
  const r = same(both((format) => [P.FACEUP_ATTACK, P.FACEDOWN_DEFENSE].map((position) => {
    const d = scenario([{ mzone: [{ code: ABSOLUTE_ZERO, position }], szone: [RAIGEKI_BREAK], hand: [FILLER] }, { mzone: [WARWOLF] }], format);
    const { seen } = play(d, [activate(RAIGEKI_BREAK), maybe(pick(FILLER)), pick(ABSOLUTE_ZERO), look(() => {})]);
    const out = { activated: chained(seen, ABSOLUTE_ZERO), theirs: zone(d, 1, "mzone").length };
    d.destroy();
    return out;
  })));
  assert.deepEqual(r, [{ activated: 1, theirs: 0 }, { activated: 0, theirs: 1 }]);
});

// "Dark Armed Dragon": "This card cannot be Special Summoned except by having exactly 3 DARK monsters in your Graveyard." / "The (1) Ignition Effect can be activated multiple times in a single turn."
test("Dark Armed Dragon: needs exactly 3 DARK monsters; its effect can be used again the same turn", () => {
  const r = same(both((format) => [3, 4].map((n) => {
    const d = scenario([{ hand: [DAD], grave: Array(n).fill(CAIUS) }, { mzone: [WARWOLF, VORSE, WARWOLF] }], format);
    let can = null, again = null;
    play(d, [(m) => (idle(m) ? ((can = m.special_summons.some((c) => c.code === DAD)), null) : undefined), specialSummon(DAD), activate(DAD), maybe(pick(CAIUS)), pick(WARWOLF), look((m) => (again = offers(m, DAD)))]);
    d.destroy();
    return { can, again };
  })));
  assert.deepEqual(r, [{ can: true, again: true }, { can: false, again: null }]);
});

// "Destiny Hero - Malicious": "Banishing this card is a cost. This effect cannot activate while "Necrovalley" is in play."
test("Destiny Hero - Malicious: cannot be activated while Necrovalley is face-up", () => {
  const r = same(both((format) => [false, true].map((valley) => {
    const d = scenario([{ grave: [MALICIOUS], deck: [FILLER, MALICIOUS] }, { szone: valley ? [, , , , , faceUp(NECROVALLEY)] : [] }], format);
    let can = null;
    play(d, [look((m) => (can = offers(m, MALICIOUS)))]);
    d.destroy();
    return can;
  })));
  assert.deepEqual(r, [true, false]);
});

// "Ehren, Lightsworn Monk": "This effect activates after Set monsters are Flipped face-up (in Substep 2). A Set Flip Monster's Flip Effect will activate and resolve normally"
test("Ehren, Lightsworn Monk: a Set Ryko it attacks still flips and activates", () => {
  const r = same(both((format) => {
    const d = scenario([{ mzone: [set(RYKO)] }, { mzone: [EHREN] }], format);
    const { seen } = play(d, [turn(2), toBattle, attack(EHREN), turn(3)], 3);
    const out = { ehren: chained(seen, EHREN), ryko: chained(seen, RYKO) };
    d.destroy();
    return out;
  }));
  assert.deepEqual(r, { ehren: 1, ryko: 1 });
});

// "Decoy Dragon": ""Decoy Dragon" must be face-up at the time it is declared as the target of your opponent's attacking monster or its effect will not activate."
// "Dreamsprite": "The effect of "Dreamsprite" is not optional ... This is also true if "Dreamsprite" is attacked when face-down."
test("Decoy Dragon does not activate when attacked face-down; Dreamsprite does", () => {
  const DECOY = 2732323, DREAMSPRITE = 8687195;
  const r = same(both((format) => [DECOY, DREAMSPRITE].flatMap((code) => [P.FACEUP_ATTACK, P.FACEDOWN_DEFENSE].map((position) => {
    const d = scenario([{ mzone: [{ code, position }, FILLER], grave: [BLUE_EYES] }, { mzone: [WARWOLF] }], format);
    const { seen } = play(d, [turn(2), toBattle, attack(WARWOLF), turn(3)], 3);
    const out = chained(seen, code);
    d.destroy();
    return out;
  }))));
  assert.deepEqual(r, [1, 0, 1, 1]);
});

// "Debris Dragon": "The Summoned monster can still activate its effect(s) to pay costs (ex: "Lonefire Blossom"), but it will resolve without effect."
test("Debris Dragon: the Lonefire Blossom it Summons can Tribute itself, and Summons nothing", () => {
  const r = same(both((format) => {
    const d = scenario([{ hand: [DEBRIS], grave: [LONEFIRE], deck: [FILLER, DANDYLION] }, {}], format);
    let offeredLonefire = false;
    const { seen } = play(d, [summon(DEBRIS), maybe(pick(LONEFIRE)), (m) => { if (offers(m, LONEFIRE)) offeredLonefire = true; return activate(LONEFIRE)(m); }, maybe(pick(DANDYLION)), look(() => {})]);
    const out = { offeredLonefire, lonefire: chained(seen, LONEFIRE), field: zone(d, 0, "mzone") };
    d.destroy();
    return out;
  }));
  assert.deepEqual(r, { offeredLonefire: true, lonefire: 1, field: [DEBRIS] });
});

// "Evil Hero Infernal Prodigy": "The (1) effect will NOT trigger if: ... Prodigy is Tributed to Set a HERO monster. / the Tribute Summon of a HERO monster was negated (by "Solemn Judgment")."
test("Evil Hero Infernal Prodigy: no draw when Tributed to Set, or when the Tribute Summon is negated", () => {
  const SOLEMN = 41420027;
  const mset = (code) => (m) => { if (!idle(m)) return undefined; const index = m.monster_sets.findIndex((c) => c.code === code); return index < 0 ? undefined : { type: R.SELECT_IDLECMD, action: I.SELECT_MONSTER_SET, index }; };
  const r = same(both((format) => ["set", "solemn"].map((kind) => {
    const d = scenario([{ mzone: [PRODIGY], hand: [DASHER], deck: [FILLER, FILLER] }, kind === "solemn" ? { szone: [SOLEMN] } : {}], format);
    play(d, [kind === "set" ? mset(DASHER) : summon(DASHER), maybe(pick(PRODIGY)), ...(kind === "solemn" ? [chain(SOLEMN)] : []), turn(2)], 2);
    const out = hand(d, 0) - 1; // less the turn's normal draw
    d.destroy();
    return out;
  })));
  assert.deepEqual(r, [0, 0]);
});

// "Drill Warrior": "If this effect resolves while your Monster Card Zones are all occupied, the banished "Drill Warrior" is sent to the Graveyard, and you do not add a monster from the Graveyard to your hand"
test("Drill Warrior: sent to the Graveyard when it would return to a full field (the core does this under both rulesets)", () => {
  const r = same(both((format) => {
    const d = scenario([{ mzone: [DRILL_WARRIOR, FILLER, FILLER, FILLER, FILLER], hand: [VORSE, WARWOLF], grave: [CAIUS] }, {}], format);
    const second = (m) => { if (!idle(m)) return undefined; const index = m.activates.findLastIndex((c) => c.code === DRILL_WARRIOR); return { type: R.SELECT_IDLECMD, action: I.SELECT_ACTIVATE, index }; }; // its remove-from-play effect
    play(d, [second, maybe(pick(VORSE)), summon(WARWOLF), turn(3)], 3);
    const out = { grave: zone(d, 0, "grave").includes(DRILL_WARRIOR), removed: zone(d, 0, "removed").includes(DRILL_WARRIOR), caius: zone(d, 0, "hand").includes(CAIUS) };
    d.destroy();
    return out;
  }));
  assert.deepEqual(r, { grave: true, removed: false, caius: false });
});
