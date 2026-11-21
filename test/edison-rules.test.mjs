// One test per Edison ruling that differs from modern play, each run on the real core.
// Sources: edisonformat.com/edison-rule-differences.html ("rule N" below), /battle-phase.html, /priority.html.
// Where modern rules differ the same board is also played under MR5, and where one flag is the cause
// it is also played with only that flag changed, so the test shows what the flag buys.
// A test marked `todo` is a ruling the core does NOT produce under any flag set tried; its assertions are the Edison ruling.
import test from "node:test";
import assert from "node:assert/strict";
import { scenario, run, act, edison, M, R, L, P, I } from "./scenario.js";

const modern = { ...edison, duelFlags: ["MODE_MR5"] };
const has = (f) => assert.ok(edison.duelFlags.includes(f), `edison runs ${f}`);
const without = (...off) => { off.forEach(has); return { ...edison, duelFlags: edison.duelFlags.filter((f) => !off.includes(f)) }; };
const withFlag = (f) => { assert.ok(!edison.duelFlags.includes(f), `edison does not run ${f}`); return { ...edison, duelFlags: [...edison.duelFlags, f] }; };

const ELF = 15025844; // Mystical Elf, LIGHT 800/2000, also the deck filler
const OJAMA_GREEN = 12482652; // 0 ATK normal monster
const GEMINI_ELF = 69140098; // 1900 ATK normal monster
const SHINING_ANGEL = 95956346; // LIGHT 1400 ATK
const CYBER_DRAGON = 70095154, CALL_OF_THE_HAUNTED = 97077563, TRAGOEDIA = 98777036;
const HAND = "hand", MZONE = "mzone", GRAVE = "grave";

/**
 * Plays a board until turn `until` starts. `decide(m, d, t)` answers prompts; `t.hint` is the core's last timing
 * announcement (40 start of Damage Step, 41 before damage calculation, 42 during it, 45 after it (6-step only),
 * 43 after-damage-calculation effects, 44 end of Damage Step), `t.damageStep` whether a Damage Step is in progress and
 * `t.damageDealt` whether damage has been dealt.
 * Returns the messages, the chains as lists of passcodes in the order they were activated, LP and where cards ended up.
 */
function play(sides, format, decide = () => {}, until = 3) {
  const d = scenario(sides, format);
  const t = { hint: 0, damageStep: false, damageDealt: false }, chains = [[]];
  const advance = d.advance.bind(d);
  d.advance = () => {
    const out = advance();
    for (const e of out) {
      if (e.type === M.HINT && e.hint_type === 1) t.hint = Number(e.hint);
      if (e.type === M.DAMAGE_STEP_START) t.damageStep = true;
      if (e.type === M.DAMAGE_STEP_END) t.damageStep = false;
      if (e.type === M.DAMAGE) t.damageDealt = true;
      if (e.type === M.CHAINING) chains.at(-1).push(e.code);
      if (e.type === M.CHAIN_END) chains.push([]);
    }
    return out;
  };
  const seen = run(d, (m) => (d.turn >= until ? "stop" : decide(m, d, t)));
  assert.deepEqual(d.errors, [], "no script errors");
  const view = d.view(0), lp = [...d.lp];
  d.destroy();
  const codes = (team, pile) => view.players[team][pile].filter(Boolean).map((c) => c.code);
  return { seen, lp, codes, chains: chains.filter((c) => c.length) };
}

/** Team 1 enters its Battle Phase on turn 2 and attacks with `code`. `attack(m, d)` returns the answer while that is still to do. */
function attackOnTurn2(code) {
  const attack = (m, d) => {
    if (attack.declared || d.turn !== 2) return;
    const r = act.toBattle(m) ?? act.attack(m, code);
    if (r && m.type === M.SELECT_BATTLECMD) attack.declared = true;
    return r;
  };
  attack.declared = false;
  return attack;
}
const offers = (m, code) => m.type === M.SELECT_CHAIN && m.selects.some((c) => c.code === code);

test("rule 13: two 0 ATK monsters in Attack Position destroy each other", () => {
  const battle = (format) => {
    const attack = attackOnTurn2(OJAMA_GREEN);
    const r = play([{ mzone: [OJAMA_GREEN] }, { mzone: [OJAMA_GREEN] }], format, attack);
    assert.ok(attack.declared, "the attack was declared");
    return r.seen.filter((e) => e.type === M.MOVE && e.card === OJAMA_GREEN && e.to.location === L.GRAVE).length;
  };
  assert.equal(battle(edison), 2);
  assert.equal(battle(modern), 0);
});

// ---- SINGLE_CHAIN_IN_DAMAGE_SUBSTEP ----

// Shining Angel (turn player, 1400) attacks Mystical Elf (800, Attack Position); each player holds Honest.
// The turn player uses theirs first (in the window announced as `at`, when given). `opponent` says what the other player
// does with theirs: "chain" it to the turn player's, or wait for that to "resolve" and then start a new chain.
function honestVsHonest(format, opponent, at) {
  const HONEST = 37742478, attack = attackOnTurn2(SHINING_ANGEL);
  const used = [false, false];
  let offeredNewChain = false;
  const r = play([{ hand: [HONEST], mzone: [ELF] }, { hand: [HONEST], mzone: [SHINING_ANGEL] }], format, (m, d, t) => {
    const a = attack(m, d);
    if (a || !attack.declared || !offers(m, HONEST) || used[m.player]) return a;
    const resolved = used[1] && d.chain.length === 0;
    if (m.player === 0 && resolved) offeredNewChain = true;
    if (m.player === 1 ? !at || t.hint === at : opponent === "chain" ? d.chain.length === 1 : resolved) { used[m.player] = true; return act.chain(m, HONEST); }
  });
  assert.ok(used[1], "the turn player used Honest");
  return { chains: r.chains.filter((c) => c.includes(HONEST)).map((c) => c.length), offeredNewChain, lp: r.lp };
}

// Honest's Edison ruling (Individual Card Rulings F-H): "This effect can activate in Substep 1 - Start of the Damage Step,
// Substep 3 - Before Damage Calculation, or Substep 4 - Damage Calculation"; battle-phase.html: "Multiple chains may be formed
// during Substeps 1-3. One 'manual' chain is built during each of Substeps 4-7", and Substep 4 lists Honest. So an Honest used
// before damage calculation can be answered by a new chain; one used during damage calculation only by chaining to it.
// (Before this audit the core ended the chains at a chain started by Honest; no page says so.)
test("Damage Step, Honest vs Honest: before damage calculation the opponent may chain theirs or wait and start a new chain; during damage calculation only chain it", () => {
  // Chained: the opponent's resolves first (Elf 800+1400 = 2200), then the turn player's (Angel 1400+2200 = 3600).
  assert.deepEqual(honestVsHonest(edison, "chain"), { chains: [2], offeredNewChain: false, lp: [8000 - 1400, 8000] });
  // Waiting, before damage calculation: Angel becomes 2200, then the Elf 800+2200 = 3000 in a new chain.
  for (const format of [edison, without("SINGLE_CHAIN_IN_DAMAGE_SUBSTEP"), modern])
    assert.deepEqual(honestVsHonest(format, "resolve"), { chains: [1, 1], offeredNewChain: true, lp: [8000, 8000 - 800] });
  // The turn player's Honest during damage calculation (window 42): no new chain after it, so the Elf loses by 1400.
  assert.deepEqual(honestVsHonest(edison, "resolve", 42), { chains: [1], offeredNewChain: false, lp: [8000 - 1400, 8000] });
});

// Gemini Elf attacks Gemini Elf. The turn player activates Rush Recklessly (+700) before damage calculation and it resolves;
// the opponent then wants to activate Shrink on the attacker in a new chain: (1900/2)+700 = 1650 against 1900.
function secondChainBeforeDamageCalculation(format) {
  const RUSH_RECKLESSLY = 70046172, SHRINK = 55713623, attack = attackOnTurn2(GEMINI_ELF);
  let rushed = false, shrunk = false;
  const r = play([{ mzone: [GEMINI_ELF], szone: [SHRINK] }, { mzone: [GEMINI_ELF], szone: [RUSH_RECKLESSLY] }], format, (m, d, t) => {
    const a = attack(m, d);
    if (a || !t.damageStep || t.damageDealt) return a;
    if (!rushed && m.player === 1 && offers(m, RUSH_RECKLESSLY)) { rushed = true; return act.chain(m, RUSH_RECKLESSLY); }
    if (rushed && !shrunk && m.player === 0 && d.chain.length === 0 && offers(m, SHRINK)) { shrunk = true; return act.chain(m, SHRINK); }
  });
  assert.ok(rushed, "Rush Recklessly was activated in the Damage Step");
  return { shrunk, lp: r.lp };
}

// Upstream's core with SINGLE_CHAIN_IN_DAMAGE_SUBSTEP + SIX_STEP gives one chain here; EDISON_DAMAGE_STEP_CHAINS (our core patch) allows more.
test("Damage Step, before damage calculation: more than one chain can be built (battle-phase page, substeps 1-3)", () => {
  assert.deepEqual(secondChainBeforeDamageCalculation(edison), { shrunk: true, lp: [8000, 8000 - 250] });
  assert.deepEqual(secondChainBeforeDamageCalculation(without("EDISON_DAMAGE_STEP_CHAINS")), { shrunk: false, lp: [8000 - 700, 8000] });
});

test("Damage Step: what upstream's flag sets do before damage calculation (none gives both rulings above)", () => {
  const second = { shrunk: true, lp: [8000, 8000 - 250] };
  // No SINGLE_CHAIN: any number of chains, for Spells/Traps and for Honest alike (the Honest test above shows the Honest half).
  assert.deepEqual(secondChainBeforeDamageCalculation(without("SINGLE_CHAIN_IN_DAMAGE_SUBSTEP")), second);
  assert.deepEqual(secondChainBeforeDamageCalculation(modern), second);
  // No SIX_STEP: two windows before damage calculation (40 start of Damage Step, 41 before damage calculation), one chain each.
  // Rush Recklessly in the first can be answered by Shrink in the second; Honest in either can be answered by a new chain (in
  // the second, by EDISON_DAMAGE_STEP_CHAINS; or during damage calculation, by init.lua). Dropping SIX_STEP costs rule 8 (see that test).
  const twoWindows = without("SIX_STEP_BATLLE_STEP");
  assert.deepEqual(secondChainBeforeDamageCalculation(twoWindows), second);
  assert.equal(honestVsHonest(twoWindows, "resolve", 40).offeredNewChain, true);
  assert.equal(honestVsHonest(twoWindows, "resolve", 41).offeredNewChain, true);
  // Edison flags: the only window before damage calculation is 41 (more chains there by EDISON_DAMAGE_STEP_CHAINS), then one
  // chain during damage calculation (42), where init.lua lets a monster's ATK-changing Quick Effect be used.
  assert.throws(() => honestVsHonest(edison, "resolve", 40), /the turn player used Honest/);
  assert.equal(honestVsHonest(edison, "resolve", 41).offeredNewChain, true);
  assert.equal(honestVsHonest(edison, "resolve", 42).offeredNewChain, false);
});

// ---- TRIGGER_WHEN_PRIVATE_KNOWLEDGE ----

test("rule 9: Dandylion discarded for Monster Reincarnation and returned to the hand by it still makes its tokens", () => {
  const DANDYLION = 15341821, MONSTER_REINCARNATION = 74848038, FLUFF_TOKENS = [15341822, 15341823];
  const tokens = (format) => {
    // The script wants a monster in the Graveyard before the cost is paid, hence the Mystical Elf there.
    const r = play([{ hand: [MONSTER_REINCARNATION, DANDYLION], grave: [ELF] }, {}], format, (m) => act.activate(m, MONSTER_REINCARNATION) ?? act.pick(m, DANDYLION), 2);
    assert.ok(r.codes(0, HAND).includes(DANDYLION), "Dandylion went to the Graveyard and came back to the hand");
    assert.deepEqual(r.chains[0], [MONSTER_REINCARNATION]);
    return r.codes(0, MZONE).filter((c) => FLUFF_TOKENS.includes(c)).length;
  };
  assert.equal(tokens(edison), 2);
  assert.equal(tokens(without("TRIGGER_WHEN_PRIVATE_KNOWLEDGE")), 0);
  assert.equal(tokens(modern), 0);
});

// ---- TCG_SEGOC_FIRSTTRIGGER ----

test("rule 7: Sangan tributed for Caius is Chain Link 1 and Caius is Chain Link 2, with no choice", () => {
  const SANGAN = 26202165, CAIUS = 9748752;
  const order = (format) => {
    let choice = false;
    const r = play([{ hand: [CAIUS], mzone: [SANGAN] }, { mzone: [ELF] }], format, (m) => {
      if (offers(m, CAIUS) && offers(m, SANGAN)) choice = true;
      return act.summon(m, CAIUS) ?? act.chain(m, CAIUS) ?? act.pick(m, ELF); // always tries to put Caius on the chain first
    }, 2);
    assert.deepEqual(r.codes(1, "removed"), [ELF], "Caius removed the opponent's monster");
    assert.equal(r.codes(0, HAND).filter((c) => c === ELF).length, 2, "Sangan searched (one Elf drawn, one searched)");
    return { chain: r.chains[0], choice };
  };
  assert.deepEqual(order(edison), { chain: [SANGAN, CAIUS], choice: false });
  assert.deepEqual(order(without("TCG_SEGOC_FIRSTTRIGGER")).chain, [CAIUS, SANGAN]);
  const m = play([{ hand: [CAIUS], mzone: [SANGAN] }, { mzone: [ELF] }], modern, (p) => act.summon(p, CAIUS) ?? act.chain(p, CAIUS) ?? act.pick(p, ELF), 2);
  assert.deepEqual(m.chains[0], [CAIUS, SANGAN], "modern rules let the player order them");
});

// ---- USE_TRAPS_IN_NEW_CHAIN is off ----

test("Royal Oppression can negate in the chain it is flipped in", () => {
  const ROYAL_OPPRESSION = 93016201, MONSTER_REBORN = 83764718;
  // A: the opponent Special Summons Cyber Dragon from the hand (no chain); Oppression is flipped at the summon and negates it.
  const inherent = (format) => {
    let flipped = false;
    const r = play([{ hand: [CYBER_DRAGON] }, { mzone: [ELF], szone: [ROYAL_OPPRESSION] }], format, (m) => {
      const negate = m.type === M.SELECT_CHAIN && m.selects.findIndex((c) => c.code === ROYAL_OPPRESSION && c.description);
      if (negate !== false && negate >= 0) { flipped = true; return { type: R.SELECT_CHAIN, index: negate }; }
      return act.special(m, CYBER_DRAGON);
    }, 2);
    return { flipped, cyberDragon: r.codes(0, MZONE).includes(CYBER_DRAGON) ? MZONE : r.codes(0, GRAVE).includes(CYBER_DRAGON) ? GRAVE : "?", lp: r.lp[1] };
  };
  // B: the opponent activates Monster Reborn; Oppression is flipped as Chain Link 2 and the player is asked at once whether to use its effect.
  const chained = (format) => {
    let asked = false;
    const r = play([{ hand: [MONSTER_REBORN], grave: [CYBER_DRAGON] }, { szone: [ROYAL_OPPRESSION] }], format, (m, d) => {
      if (m.type === M.SELECT_EFFECTYN && m.code === ROYAL_OPPRESSION) asked = true; // answered yes by default
      return act.activate(m, MONSTER_REBORN) ?? (d.chain.length === 1 && d.chain[0].code === MONSTER_REBORN ? act.chain(m, ROYAL_OPPRESSION) : undefined);
    }, 2);
    assert.deepEqual(r.chains[0], [MONSTER_REBORN, ROYAL_OPPRESSION]);
    return { asked, cyberDragon: r.codes(0, MZONE).includes(CYBER_DRAGON) ? MZONE : GRAVE, lp: r.lp[1] };
  };
  for (const format of [edison, modern]) { // modern rules agree; only the Goat-era flag differs
    assert.deepEqual(inherent(format), { flipped: true, cyberDragon: GRAVE, lp: 8000 - 800 });
    assert.deepEqual(chained(format), { asked: true, cyberDragon: GRAVE, lp: 8000 - 800 });
  }
  const goat = withFlag("USE_TRAPS_IN_NEW_CHAIN");
  assert.deepEqual(inherent(goat), { flipped: false, cyberDragon: MZONE, lp: 8000 });
  assert.deepEqual(chained(goat), { asked: false, cyberDragon: MZONE, lp: 8000 });
});

// ---- STORE_ATTACK_REPLAYS is off ----

test("replay: an attacker that chooses not to attack again cannot attack or change position later that turn", () => {
  // Gemini Elf attacks Mystical Elf; the defender flips Call of the Haunted, a second monster appears, replay.
  const replay = (format) => {
    const attack = attackOnTurn2(GEMINI_ELF);
    let called = false, asked = false; const later = [];
    play([{ mzone: [ELF], szone: [CALL_OF_THE_HAUNTED], grave: [SHINING_ANGEL] }, { mzone: [GEMINI_ELF] }], format, (m, d) => {
      const a = attack(m, d);
      if (a || !attack.declared) return a;
      if (!called) { const r = act.chain(m, CALL_OF_THE_HAUNTED); if (r) called = true; return r; }
      if (m.type === M.SELECT_YESNO) { asked = true; assert.equal(m.description, 30n, "asked whether to continue the attack"); return { type: R.SELECT_YESNO, yes: false }; }
      if (m.type === M.SELECT_BATTLECMD) later.push(m.attacks.some((c) => c.code === GEMINI_ELF) ? "can attack" : "cannot attack");
      if (m.type === M.SELECT_IDLECMD) later.push(m.pos_changes.some((c) => c.code === GEMINI_ELF) ? "can change position" : "cannot change position");
    });
    assert.ok(called, "Call of the Haunted was flipped at the attack declaration");
    return { asked, later };
  };
  for (const format of [edison, modern]) assert.deepEqual(replay(format), { asked: true, later: ["cannot attack", "cannot change position"] });
  const goat = replay(withFlag("STORE_ATTACK_REPLAYS"));
  assert.equal(goat.asked, false);
  assert.equal(goat.later[0], "can attack");
});

// ---- CAN_REPOS_IF_NON_SUMPLAYER ----

test("a monster Special Summoned this turn by Call of the Haunted and taken with Mind Control or Brain Control can change position", () => {
  const MIND_CONTROL = 37520316, BRAIN_CONTROL = 87910978;
  const canChange = (format, take) => {
    let called = false, took = false, offered = null;
    const r = play([{ hand: [take] }, { szone: [CALL_OF_THE_HAUNTED], grave: [GEMINI_ELF] }], format, (m) => {
      if (!called) { const c = act.chain(m, CALL_OF_THE_HAUNTED); if (c) called = true; return c; } // in the turn player's Draw Phase
      if (m.type !== M.SELECT_IDLECMD) return;
      if (!took) { took = true; return act.activate(m, take); }
      if (offered !== null) return;
      offered = m.pos_changes.some((c) => c.code === GEMINI_ELF);
      if (offered) return { type: R.SELECT_IDLECMD, action: I.SELECT_POS_CHANGE, index: m.pos_changes.findIndex((c) => c.code === GEMINI_ELF) };
    }, 2);
    const moved = r.seen.some((e) => e.type === M.POS_CHANGE && e.code === GEMINI_ELF && e.controller === 0 && e.position === P.FACEUP_DEFENSE);
    assert.equal(moved, offered, "the change of position happens when it is offered");
    return offered;
  };
  for (const take of [MIND_CONTROL, BRAIN_CONTROL]) {
    assert.equal(canChange(edison, take), true);
    assert.equal(canChange(without("CAN_REPOS_IF_NON_SUMPLAYER"), take), false);
    assert.equal(canChange(modern, take), false);
  }
});

// ---- SIX_STEP_BATLLE_STEP ----

test("rule 8: a battle-damage trigger resolves in its own step before the flip effect from the same battle", () => {
  // Ojama Green attacks a face-down Man-Eater Bug (DEF 600) and its controller takes 600. Tragoedia ("when you take battle
  // damage") is then Special Summoned from the hand. In Edison that is "after damage calculation", a step before flip effects,
  // so Man-Eater Bug's effect activates with Tragoedia already on the field and can target it. Under modern rules both go on
  // one chain with Man-Eater Bug as Chain Link 1, which picks its target before Tragoedia arrives.
  // (Gorz cannot share a battle with a flip effect: its owner must control no cards, so they own neither battling monster.)
  const MAN_EATER_BUG = 54652250;
  const battle = (format) => {
    const attack = attackOnTurn2(OJAMA_GREEN);
    let targets = null, steps = {};
    const r = play([{ mzone: [{ code: MAN_EATER_BUG, position: P.FACEDOWN_DEFENSE }] }, { mzone: [OJAMA_GREEN], hand: [TRAGOEDIA] }], format, (m, d, t) => {
      if (m.type === M.SELECT_CARD && d.chain.at(-1)?.code === MAN_EATER_BUG && m.player === 0) {
        targets = m.selects.filter((c) => c.controller === 1).map((c) => c.code);
        steps.manEaterBug = t.hint;
        return act.pick(m, TRAGOEDIA);
      }
      if ((m.type === M.SELECT_EFFECTYN && m.code === TRAGOEDIA) || offers(m, TRAGOEDIA)) steps.tragoedia = t.hint;
      return attack(m, d) ?? act.chain(m, TRAGOEDIA);
    });
    assert.equal(r.lp[1], 8000 - 600);
    return { chains: r.chains, targets, steps, tragoedia: r.codes(1, GRAVE).includes(TRAGOEDIA) ? "destroyed by Man-Eater Bug" : r.codes(1, MZONE).includes(TRAGOEDIA) ? "on the field" : "?" };
  };
  assert.deepEqual(battle(edison), { chains: [[TRAGOEDIA], [MAN_EATER_BUG]], targets: [OJAMA_GREEN, TRAGOEDIA], steps: { tragoedia: 45, manEaterBug: 43 }, tragoedia: "destroyed by Man-Eater Bug" });
  for (const format of [without("SIX_STEP_BATLLE_STEP"), modern])
    assert.deepEqual(battle(format), { chains: [[MAN_EATER_BUG, TRAGOEDIA]], targets: [OJAMA_GREEN], steps: { tragoedia: 43, manEaterBug: 43 }, tragoedia: "on the field" });
});

// ---- Master Rule 1 basics ----

test("rule 1: the first player draws on turn 1", () => {
  const drew = (format) => play([{}, {}], format, undefined, 2).seen.some((e) => e.type === M.DRAW && e.player === 0);
  assert.equal(drew(edison), true);
  assert.equal(drew(modern), false);
});

test("rule 2: activating a Field Spell destroys the opponent's face-up Field Spell", () => {
  const UMI = 22702055, YAMI = 59197169;
  const yami = (format) => {
    const r = play([{ hand: [UMI] }, { szone: [, , , , , { code: YAMI, position: P.FACEUP }] }], format, (m) => act.activate(m, UMI), 2);
    assert.ok(r.codes(0, "szone").includes(UMI), "Umi is active");
    return r.codes(1, GRAVE).includes(YAMI) ? GRAVE : r.codes(1, "szone").includes(YAMI) ? "field" : "?";
  };
  assert.equal(yami(edison), GRAVE);
  assert.equal(yami(modern), "field");
});

test("rule 5: a Trap Monster occupies a Monster Zone and a Spell/Trap Zone", () => {
  const APOPHIS = 28649820, MST = 5318639;
  // All five Spell/Trap Zones are full. Once Embodiment of Apophis is a monster, is its old zone free for the Spell in hand?
  const zoneFreed = (format) => {
    let summoned = false, canSet = null;
    const r = play([{ hand: [MST], szone: [APOPHIS, MST, MST, MST, MST] }, {}], format, (m) => {
      if (m.type !== M.SELECT_IDLECMD) return;
      if (!summoned) { summoned = true; assert.equal(m.spell_sets.length, 0, "no free zone before"); return act.activate(m, APOPHIS); }
      canSet = m.spell_sets.some((c) => c.code === MST);
    }, 2);
    assert.ok(r.codes(0, MZONE).includes(APOPHIS), "Apophis is in a Monster Zone");
    return canSet;
  };
  assert.equal(zoneFreed(edison), false);
  assert.equal(zoneFreed(modern), true);
});

test("rule 9: Elemental HERO Absolute Zero returned to the Extra Deck still destroys the opponent's monsters", () => {
  const ABSOLUTE_ZERO = 40854197, COMPULSORY = 94192409;
  const left = (format) => {
    const r = play([{ mzone: [ABSOLUTE_ZERO] }, { mzone: [GEMINI_ELF, ELF], szone: [COMPULSORY] }], format,
      (m, d) => (d.phase === 4 ? act.chain(m, COMPULSORY) ?? act.pick(m, ABSOLUTE_ZERO) : undefined), 2);
    assert.deepEqual(r.codes(0, "extra"), [ABSOLUTE_ZERO], "Absolute Zero is back in the Extra Deck");
    return r.codes(1, MZONE).length;
  };
  assert.equal(left(edison), 0);
  assert.equal(left(modern), 2);
});

// ---- TCG_SEGOC_NONPUBLIC ----

test("rule 7: the turn player's optional trigger in the hand is ordered before the opponent's optional trigger (TCG_SEGOC_NONPUBLIC is redundant here)", () => {
  // Ojama Green attacks Don Zaloog and its controller takes 1400: Tragoedia (turn player, optional, in the hand) and
  // Don Zaloog (opponent, optional, on the field) trigger together. Edison order: turn player's optional, then the opponent's.
  const DON_ZALOOG = 76922029;
  const order = (format) => {
    const attack = attackOnTurn2(OJAMA_GREEN);
    const r = play([{ mzone: [DON_ZALOOG] }, { mzone: [OJAMA_GREEN], hand: [TRAGOEDIA] }], format, (m, d) =>
      attack(m, d) ?? act.chain(m, TRAGOEDIA) ?? act.chain(m, DON_ZALOOG) ?? (m.type === M.SELECT_OPTION ? { type: R.SELECT_OPTION, index: 1 } : undefined));
    return r.chains.find((c) => c.includes(TRAGOEDIA));
  };
  assert.deepEqual(order(edison), [TRAGOEDIA, DON_ZALOOG]);
  // With TRIGGER_WHEN_PRIVATE_KNOWLEDGE on, the flag changes nothing: the core skips the check it gates (processor.cpp:711).
  assert.deepEqual(order(without("TCG_SEGOC_NONPUBLIC")), [TRAGOEDIA, DON_ZALOOG]);
  // It only shows once that flag is off: then, without it, the hand trigger is held back behind the opponent's.
  assert.deepEqual(order(without("TRIGGER_WHEN_PRIVATE_KNOWLEDGE")), [TRAGOEDIA, DON_ZALOOG]);
  assert.deepEqual(order(without("TRIGGER_WHEN_PRIVATE_KNOWLEDGE", "TCG_SEGOC_NONPUBLIC")), [DON_ZALOOG, TRAGOEDIA]);
  assert.deepEqual(order(modern), [DON_ZALOOG, TRAGOEDIA]);
});

test("a set Normal Spell can be activated the turn it was set; a set Quick-Play Spell or Trap cannot", () => {
  const MST = 5318639, DARK_HOLE = 53129443, CALL_OF_THE_HAUNTED = 97077563, ELF = 15025844, HEAVY_STORM = 19613556;
  const offered = (code) => {
    const d = scenario([{ hand: [code], mzone: [ELF], grave: [ELF] }, { mzone: [ELF], szone: [HEAVY_STORM] }]);
    let set = false, sameTurn = null, nextTurn = null;
    run(d, (m) => {
      if (m.type !== M.SELECT_IDLECMD || m.player !== 0) return;
      if (!set) { const r = act.setSpell(m, code); if (r) { set = true; return r; } }
      else if (d.turn === 1 && sameTurn === null) sameTurn = m.activates.some((c) => c.code === code);
      else if (d.turn === 3) { nextTurn = m.activates.some((c) => c.code === code); return "stop"; }
    });
    d.destroy();
    return { sameTurn, nextTurn };
  };
  assert.deepEqual(offered(DARK_HOLE), { sameTurn: true, nextTurn: true });
  assert.deepEqual(offered(MST), { sameTurn: false, nextTurn: true });
  assert.deepEqual(offered(CALL_OF_THE_HAUNTED), { sameTurn: false, nextTurn: true });
});
