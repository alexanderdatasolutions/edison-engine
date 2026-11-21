// General game mechanics of Edison format, statement by statement, on the real core under the Edison flags.
// Sources (quoted in each test's name or comment):
//   P  https://www.edisonformat.com/priority.html
//   S  https://www.edisonformat.com/summons.html
//   MT https://www.edisonformat.com/missing-the-timing.html
//   BP https://www.edisonformat.com/battle-phase.html
//   RD https://www.edisonformat.com/edison-rule-differences.html ("rule N")
//   MC the "Mid-chain triggers" rules update (5/9/2021) the rule differences page links for rule 9
//   RB the rulebook the rules page links (Official Rulebook Version 7.0, 5D's era), cited by printed page
// Single-card rulings live in test/edison-errata.test.mjs; this file is about what holds for every card.
// A test marked `todo` is a statement the engine does NOT play as written; its assertions are the source's.
import test from "node:test";
import assert from "node:assert/strict";
import { OcgPhase as PH } from "ocgcore-wasm";
import { Duel, JUDGE } from "../lib/duel.js";
import { run, act, edison, M, R, L, P, I, B } from "./scenario.js";

const modern = { ...edison, duelFlags: ["MODE_MR5"] };

// ---- cards (all in the Edison pool unless said)
const ELF = 15025844, GEMINI = 69140098, BLUE_EYES = 89631139, SKULL = 70781052, OJAMA_GREEN = 12482652, LABYRINTH_WALL = 67284908;
const EXILED_FORCE = 74131780, MALICIOUS = 9411399, CROW = 24508238, FOOLISH = 81439173, ARMAGEDDON_KNIGHT = 28985331, SPIRIT_REAPER = 23205979;
const TORRENTIAL = 53582587, BOTTOMLESS = 29401950, SOLEMN = 41420027, DUST_TORNADO = 60082869, MST = 5318639, MIRROR_FORCE = 44095762;
const BOOK_OF_MOON = 14087893, THREATENING_ROAR = 36361633, DIVINE_WRATH = 49010598, SHRINK = 55713623, RUSH = 70046172, HONEST = 37742478;
const DARK_ARMED = 65192027, BLACK_GARDEN = 71645242, ROSE_TOKEN = 71645243, SANGAN = 26202165, BRIONAC = 50321796, JUNK_SYNCHRON = 63977008, GOYO = 7391448, KREBONS = 59575539;
const CHAOS_SORCERER = 9596126, WANGHU = 83986578, MONSTER_REBORN = 83764718, CALL_OF_THE_HAUNTED = 97077563, ROYAL_OPPRESSION = 93016201;
const CYBER_DRAGON = 70095154, LEVEL_EATER = 57421866, STRATOS = 40044918;

// ---- the table
const ZONES = { hand: L.HAND, mzone: L.MZONE, szone: L.SZONE, grave: L.GRAVE, removed: L.REMOVED };
/**
 * A duel with no opening hands and the given cards in place, as scenario.js's `scenario`, with a chosen deck filler
 * (`filler`, Mystical Elf by default) so a test can say what the rest of the Deck holds. Team 0 takes turn 1.
 */
function table(sides, { format = edison, filler = ELF, lp } = {}) {
  const place = [];
  const decks = sides.map((side, team) => {
    for (const [zone, location] of Object.entries(ZONES)) {
      (side[zone] ?? []).forEach((c, sequence) => {
        const card = typeof c === "number" ? { code: c } : c;
        place.push({ team, code: card.code, location, sequence, position: card.position ?? (zone === "szone" ? P.FACEDOWN : P.FACEUP_ATTACK) });
      });
    }
    return { main: [...(side.deck ?? []), ...Array(12).fill(filler)], extra: side.extra ?? [] };
  });
  return new Duel({ format: { ...format, startingHand: 0, ...(lp ? { startingLP: lp } : {}) }, decks, shuffle: false, place });
}

/**
 * Plays `steps` in order (as edison-errata.test.mjs's `play`: a step is asked at every prompt until it answers; undefined
 * leaves the prompt to the quiet default: pass, end the phase, say yes, first legal pick; null hands the prompt to the next
 * step; `maybe(step)` is skipped when the step after it answers first). Stops when the steps run out or after `lastTurn`.
 * Records every prompt as a window: {n, turn, phase, player, type, chain: codes on the chain, hint: the core's last timing
 * announcement, ends: chains ended so far, offered: what it lists (chain: activations; idle: activations; battle: chain
 * activations), attacks, summons}. Returns the table as it ended, from each team's own side.
 */
function game(sides, steps, { lastTurn = 1, ...opts } = {}) {
  const d = table(sides, opts);
  const log = { hint: 0, ends: 0 };
  const windows = [];
  const advance = d.advance.bind(d);
  d.advance = () => {
    const out = advance();
    for (const e of out) {
      if (e.type === M.HINT && e.hint_type === 1) log.hint = Number(e.hint);
      if (e.type === M.CHAIN_END) log.ends++;
    }
    return out;
  };
  let done = 0;
  const seen = run(d, (m) => {
    const offered = m.type === M.SELECT_CHAIN ? m.selects : m.type === M.SELECT_IDLECMD ? m.activates : m.type === M.SELECT_BATTLECMD ? m.chains : [];
    windows.push({ n: windows.length, turn: d.turn, phase: d.phase, player: m.player, type: m.type, chain: d.chain.map((c) => c.code), hint: log.hint, ends: log.ends,
      offered: (offered ?? []).map((c) => c.code), attacks: (m.attacks ?? []).map((c) => c.code), summons: (m.summons ?? []).map((c) => c.code), m });
    for (;;) {
      if (done >= steps.length || d.turn > lastTurn) return "stop";
      let r = steps[done](m, d);
      if (r === undefined && steps[done].optional && done + 1 < steps.length && (r = steps[done + 1](m, d)) !== undefined) done++;
      if (r !== undefined) done++;
      if (r !== null) return r;
    }
  }, 2000);
  const view = d.view(JUDGE);
  const out = { done, seen, windows, lp: [...d.lp], errors: d.errors, turn: d.turn, phase: d.phase, winner: d.winner, players: view.players };
  d.destroy();
  if (process.env.DEBUG_WINDOWS) {
    for (const w of windows) console.log(JSON.stringify({ ...w, m: undefined, type: Object.keys(M).find((k) => M[k] === w.type) }));
    for (const e of seen) if ([M.CHAINING, M.CHAIN_END, M.SUMMONING, M.SPSUMMONING, M.MOVE, M.ATTACK, M.DAMAGE, M.NEW_PHASE].includes(e.type)) console.log("  ", Object.keys(M).find((k) => M[k] === e.type), e.code ?? e.card ?? e.phase ?? "", e.to ? `${e.from.location}->${e.to.location}` : "");
  }
  return out;
}
const maybe = (step) => Object.assign((m, d) => step(m, d), { optional: true });
// what is where at the end: codes in a pile of a team (face-down cards included; the JUDGE view)
const pile = (r, team, name) => r.players[team][name].filter(Boolean).map((c) => c.code);
const has = (r, team, name, code) => pile(r, team, name).includes(code);
const chained = (r, code) => r.seen.filter((e) => e.type === M.CHAINING && e.code === code).length;
const chains = (r) => { const out = [[]]; for (const e of r.seen) { if (e.type === M.CHAINING) out.at(-1).push(e.code); if (e.type === M.CHAIN_END) out.push([]); } return out.filter((c) => c.length); };
const offers = (w, code) => w.offered.includes(code);
const chainWindows = (r) => r.windows.filter((w) => w.type === M.SELECT_CHAIN && w.offered.length);
const index = (r, type, code) => r.seen.findIndex((e) => e.type === type && (code === undefined || e.code === code || e.card === code));

// steps
const idle = (m) => m.type === M.SELECT_IDLECMD;
const summon = (code) => (m) => act.summon(m, code);
const activate = (code) => (m) => act.activate(m, code);
const chain = (code) => (m) => act.chain(m, code);
const pick = (...codes) => (m) => act.pick(m, ...codes);
const special = (code) => (m) => act.special(m, code);
const set = (code) => (m) => { if (!idle(m)) return; const index = m.monster_sets.findIndex((c) => c.code === code); return index < 0 ? undefined : { type: R.SELECT_IDLECMD, action: I.SELECT_MONSTER_SET, index }; };
const flipSummon = (code) => (m) => { if (!idle(m)) return; const index = m.pos_changes.findIndex((c) => c.code === code); return index < 0 ? undefined : { type: R.SELECT_IDLECMD, action: I.SELECT_POS_CHANGE, index }; };
const toBattle = (m) => act.toBattle(m);
const attack = (code) => (m) => act.attack(m, code);
const by = (player, step) => (m, d) => (m.player === player ? step(m, d) : undefined);
const onTurn = (n, step) => (m, d) => (d.turn === n ? step(m, d) : undefined);
const turn = (n) => (m, d) => (d.turn >= n && idle(m) ? null : undefined); // wait for the Main Phase of turn n
const decline = (m) => (m.type === M.SELECT_EFFECTYN ? { type: R.SELECT_EFFECTYN, yes: false } : undefined);
const yes = (m) => (m.type === M.SELECT_EFFECTYN || m.type === M.SELECT_YESNO ? { type: m.type === M.SELECT_EFFECTYN ? R.SELECT_EFFECTYN : R.SELECT_YESNO, yes: true } : undefined);
const no = (m) => (m.type === M.SELECT_YESNO ? { type: R.SELECT_YESNO, yes: false } : undefined);
const takeOne = (code) => (m) => { if (m.type !== M.SELECT_UNSELECT_CARD) return; const i = code === undefined ? 0 : m.select_cards.findIndex((c) => c.code === code); return i < 0 || !m.select_cards.length ? undefined : { type: R.SELECT_UNSELECT_CARD, index: i }; };
const finish = (m) => (m.type === M.SELECT_UNSELECT_CARD && m.can_finish ? { type: R.SELECT_UNSELECT_CARD, index: null } : undefined);
const toEnd = (m) => (idle(m) && m.to_ep ? { type: R.SELECT_IDLECMD, action: I.TO_EP, index: null } : m.type === M.SELECT_BATTLECMD && m.to_ep ? { type: R.SELECT_BATTLECMD, action: B.TO_EP, index: null } : undefined);
const stop = () => "stop";
const until = (fn) => (m, d) => (fn(m, d) ? "stop" : undefined); // quiet defaults until fn holds, then stop
const battleOver = (m, d) => d.phase === PH.MAIN2 || d.phase === PH.END || d.turn > 2;
const look = (m) => (idle(m) ? "stop" : undefined); // the next open Main Phase, then stop

// =====================================================================================================================
// Priority (P), Rule 6 (RD)
// =====================================================================================================================

test("P: after a Summon that starts no chain, the turn player may first activate a fast effect (a Set Dust Tornado), and the opponent's Torrential Tribute can then be Chain Link 2", () => {
  const sides = [{ hand: [GEMINI], szone: [DUST_TORNADO] }, { mzone: [ELF], szone: [TORRENTIAL, MST] }];
  const passed = game(sides, [summon(GEMINI), look]);
  const after = chainWindows(passed).filter((w) => w.phase === PH.MAIN1 && w.chain.length === 0);
  assert.deepEqual(after.map((w) => [w.player, offers(w, DUST_TORNADO), offers(w, TORRENTIAL)]).slice(0, 2), [[0, true, false], [1, false, true]], "turn player first, then the opponent");
  const used = game(sides, [summon(GEMINI), chain(DUST_TORNADO), pick(MST), look]);
  const cl2 = used.windows.find((w) => w.player === 1 && w.chain.length === 1 && w.chain[0] === DUST_TORNADO);
  assert.ok(cl2 && offers(cl2, TORRENTIAL), "Torrential Tribute can be chained to the turn player's Dust Tornado, still in response to the Summon");
});

test("P: when a chain has finished resolving, the turn player may activate a fast effect first, but no Ignition Effect; then the opponent", () => {
  const r = game([{ hand: [FOOLISH], mzone: [EXILED_FORCE], szone: [DUST_TORNADO], deck: [ELF, MALICIOUS] }, { mzone: [ELF], szone: [MST] }],
    [activate(FOOLISH), pick(MALICIOUS), look]);
  const after = chainWindows(r).filter((w) => w.ends === 1 && w.chain.length === 0);
  assert.deepEqual(after.map((w) => ({ player: w.player, dust: offers(w, DUST_TORNADO), exiled: offers(w, EXILED_FORCE), malicious: offers(w, MALICIOUS), mst: offers(w, MST) })),
    [{ player: 0, dust: true, exiled: false, malicious: false, mst: false }, { player: 1, dust: false, exiled: false, malicious: false, mst: true }]);
});

test("P: entering a phase, the turn player acts first: in Main Phase 1 Malicious's Ignition Effect is offered before the opponent's D.D. Crow can be used", () => {
  const r = game([{ grave: [MALICIOUS], deck: [ELF, MALICIOUS] }, { hand: [CROW] }], [(m, d) => (d.phase === PH.MAIN1 ? (idle(m) && m.player === 0 ? "stop" : (assert.fail(`first Main Phase prompt went to team ${m.player}`))) : undefined)]);
  const main = r.windows.filter((w) => w.phase === PH.MAIN1);
  assert.equal(main[0].player, 0);
  assert.equal(main[0].type, M.SELECT_IDLECMD);
  assert.ok(offers(main[0], MALICIOUS));
});

test("P / RB p.41: in the Draw Phase and the Standby Phase the turn player is asked first, then the opponent", () => {
  const r = game([{ szone: [DUST_TORNADO] }, { szone: [MST, MST] }], [look]);
  for (const phase of [PH.DRAW, PH.STANDBY]) {
    const ws = chainWindows(r).filter((w) => w.phase === phase && w.turn === 1);
    assert.ok(ws.length >= 2 && ws.length % 2 === 0, `phase ${phase}: windows come in pairs`);
    ws.forEach((w, i) => assert.equal(w.player, i % 2, `phase ${phase}: turn player, then opponent, each time`));
  }
});

test("P / BP Start Step: the turn player has priority at the start of the Battle Phase and in response to an attack declaration", () => {
  // Turn 2: team 1 attacks. Each side has a free-chain card Set.
  const r = game([{ mzone: [ELF], szone: [MST, MIRROR_FORCE] }, { mzone: [GEMINI], szone: [DUST_TORNADO] }],
    [turn(2), toBattle, attack(GEMINI), until(battleOver)], { lastTurn: 2 });
  const declared = r.windows.findIndex((w) => w.turn === 2 && w.type === M.SELECT_BATTLECMD && w.attacks.includes(GEMINI));
  const start = chainWindows(r).filter((w) => w.turn === 2 && w.phase === PH.BATTLE_START && w.n < declared);
  assert.deepEqual(start.map((w) => w.player), [1, 0], "Start Step: turn player first");
  const response = chainWindows(r).filter((w) => w.n > declared && w.chain.length === 0);
  assert.equal(response[0].player, 1, "the attacker's controller is asked first after the declaration");
  assert.ok(offers(response[0], DUST_TORNADO));
  assert.ok(response.some((w) => w.player === 0 && offers(w, MIRROR_FORCE)), "then the defender, with Mirror Force");
});

test("BP Start Step: Threatening Roar activated in the Start Step stops attack declarations; entering the Battle Phase does not oblige an attack", () => {
  const r = game([{ mzone: [ELF], szone: [THREATENING_ROAR] }, { mzone: [GEMINI] }],
    [turn(2), toBattle, by(0, (m, d) => (d.phase === PH.BATTLE_START ? act.chain(m, THREATENING_ROAR) : undefined)), (m) => (m.type === M.SELECT_BATTLECMD ? null : undefined), stop], { lastTurn: 2 });
  const battle = r.windows.filter((w) => w.turn === 2 && w.type === M.SELECT_BATTLECMD);
  assert.ok(battle.length > 0, "the Battle Step was reached");
  assert.deepEqual(battle.at(-1).attacks, [], "Gemini Elf cannot attack");
  assert.ok(battle.at(-1).m.to_m2 || battle.at(-1).m.to_ep, "the turn player may end the Battle Phase without attacking");
});

test("RD rule 6 / P: Special Summoning Dark Armed Dragon while the opponent's Black Garden is face-up: Black Garden's trigger is Chain Link 1, then the turn player may chain a fast effect but not Dark Armed Dragon's Ignition Effect", () => {
  const r = game([{ hand: [DARK_ARMED], grave: [SPIRIT_REAPER, SPIRIT_REAPER, SPIRIT_REAPER], szone: [DUST_TORNADO] }, { szone: [, , , , , { code: BLACK_GARDEN, position: P.FACEUP }] }],
    [special(DARK_ARMED), look]);
  assert.deepEqual(chains(r)[0]?.[0], BLACK_GARDEN, "Black Garden's effect starts the chain");
  const ws = chainWindows(r).filter((w) => w.turn === 1 && w.phase === PH.MAIN1);
  assert.ok(ws.length > 0);
  assert.deepEqual({ player: ws[0].player, chain: ws[0].chain, dust: offers(ws[0], DUST_TORNADO), dad: offers(ws[0], DARK_ARMED) }, { player: 0, chain: [BLACK_GARDEN], dust: true, dad: false });
  assert.ok(ws.every((w) => !offers(w, DARK_ARMED)), "no window offers Dark Armed Dragon's Ignition Effect in that response timing");
});

test("RD rule 6, example 2 (not priority): Brionac Synchro Summoned with Sangan as material: Sangan's trigger starts the chain and Brionac's Ignition Effect is not offered", () => {
  const r = game([{ mzone: [JUNK_SYNCHRON, SANGAN], hand: [ELF], extra: [BRIONAC] }, { szone: [TORRENTIAL] }], [special(BRIONAC), look]);
  assert.ok(has(r, 0, "mzone", BRIONAC), "Brionac was Synchro Summoned");
  assert.equal(chains(r)[0]?.[0], SANGAN, "Sangan is Chain Link 1");
  const before = r.windows.filter((w) => w.ends === 0 && w.type === M.SELECT_CHAIN);
  assert.ok(before.every((w) => !offers(w, BRIONAC)), "Brionac is never offered before the chain resolves");
});

test("RD rule 6, example 2 (priority): Chaos Sorcerer Special Summoned by its own procedure: its Ignition Effect is offered before Bottomless Trap Hole, and Bottomless can still be Chain Link 2 (S, example 2)", () => {
  const r = game([{ hand: [CHAOS_SORCERER], grave: [ELF, SPIRIT_REAPER] }, { mzone: [GEMINI], szone: [BOTTOMLESS] }],
    [special(CHAOS_SORCERER), chain(CHAOS_SORCERER), pick(GEMINI), by(1, chain(BOTTOMLESS)), look]);
  const first = chainWindows(r).find((w) => w.chain.length === 0 && w.ends === 0);
  assert.deepEqual({ player: first.player, cs: offers(first, CHAOS_SORCERER) }, { player: 0, cs: true });
  assert.deepEqual(chains(r)[0], [CHAOS_SORCERER, BOTTOMLESS]);
  assert.ok(has(r, 0, "removed", CHAOS_SORCERER), "Bottomless Trap Hole destroyed and removed Chaos Sorcerer");
});

test("P: Exiled Force Normal Summoned while the opponent's King Tiger Wanghu is face-up: Wanghu's effect cannot be postponed by Exiled Force's Ignition Effect", () => {
  const r = game([{ hand: [EXILED_FORCE] }, { mzone: [WANGHU] }], [summon(EXILED_FORCE), look]);
  assert.equal(chains(r)[0]?.[0], WANGHU);
  assert.ok(r.windows.every((w) => !offers(w, EXILED_FORCE) || w.type === M.SELECT_IDLECMD && w.ends > 0));
  assert.ok(has(r, 0, "grave", EXILED_FORCE), "Exiled Force was destroyed");
});

test("P example 3 / S example 1: Elemental HERO Stratos Normal Summoned: the turn player may only use its trigger, and the opponent may chain Torrential Tribute to it", () => {
  const r = game([{ hand: [STRATOS], szone: [DUST_TORNADO], deck: [ELF, STRATOS] }, { mzone: [ELF], szone: [TORRENTIAL, MST] }],
    [summon(STRATOS), (m) => (m.type === M.SELECT_EFFECTYN && m.code === STRATOS ? { type: R.SELECT_EFFECTYN, yes: true } : act.chain(m, STRATOS)), look]);
  assert.equal(chains(r)[0]?.[0], STRATOS);
  const beforeTrigger = r.windows.filter((w) => w.phase === PH.MAIN1 && w.ends === 0 && w.chain.length === 0 && w.type === M.SELECT_CHAIN);
  assert.ok(beforeTrigger.every((w) => !offers(w, DUST_TORNADO)), "no fast effect before the trigger");
  assert.ok(r.windows.some((w) => w.player === 1 && w.chain.length === 1 && w.chain[0] === STRATOS && offers(w, TORRENTIAL)), "Torrential Tribute is offered as Chain Link 2");
});

// =====================================================================================================================
// Summons (S): the Summon negation window and the Summon response window
// =====================================================================================================================
const RAI_OH = 71564252;

test("S: the Summon negation window offers only cards that negate Summons, the turn player first; Dust Tornado waits for the response window", () => {
  const r = game([{ hand: [GEMINI], szone: [SOLEMN] }, { szone: [SOLEMN, DUST_TORNADO] }], [summon(GEMINI), look]);
  const ws = chainWindows(r).filter((w) => w.phase === PH.MAIN1 && w.ends === 0);
  assert.deepEqual(ws.slice(0, 2).map((w) => [w.player, w.offered]), [[0, [SOLEMN]], [1, [SOLEMN]]], "negation window: Solemn Judgment only, turn player first");
  assert.ok(ws.slice(2).some((w) => w.player === 1 && offers(w, DUST_TORNADO) && !offers(w, SOLEMN)), "then the response window, where Solemn Judgment no longer applies");
});

test("S: a Flip Summon and a Synchro Summon each have a Summon negation window (Solemn Judgment)", () => {
  const flip = game([{ mzone: [{ code: GEMINI, position: P.FACEDOWN_DEFENSE }] }, { szone: [SOLEMN] }], [flipSummon(GEMINI), by(1, chain(SOLEMN)), look]);
  assert.deepEqual({ grave: has(flip, 0, "grave", GEMINI), lp: flip.lp[1] }, { grave: true, lp: 4000 });
  const synchro = game([{ mzone: [KREBONS, GEMINI], extra: [GOYO] }, { szone: [SOLEMN] }], [special(GOYO), by(1, chain(SOLEMN)), look]);
  assert.deepEqual({ grave: has(synchro, 0, "grave", GOYO), field: has(synchro, 0, "mzone", GOYO), lp: synchro.lp[1] }, { grave: true, field: false, lp: 4000 });
});

test("S example 1: Thunder King Rai-Oh negates the Summon of Chaos Sorcerer by its Summoning Condition; it was never Summoned, so Monster Reborn cannot revive it", () => {
  for (const negate of [RAI_OH, SOLEMN]) {
    const opp = negate === RAI_OH ? { mzone: [RAI_OH] } : { szone: [SOLEMN] };
    let targets = null; // what Monster Reborn may choose (Rai-Oh itself is in the Graveyard by then); null: not activatable
    const r = game([{ hand: [CHAOS_SORCERER, MONSTER_REBORN], grave: [ELF, SPIRIT_REAPER] }, opp],
      [special(CHAOS_SORCERER), by(1, chain(negate)), (m) => (idle(m) ? act.activate(m, MONSTER_REBORN) ?? "stop" : undefined), (m) => (m.type === M.SELECT_CARD ? ((targets = m.selects.map((c) => c.code)), "stop") : undefined)]);
    assert.ok(has(r, 0, "grave", CHAOS_SORCERER), `${negate}: Chaos Sorcerer was sent to the Graveyard`);
    assert.ok(!targets?.includes(CHAOS_SORCERER), `${negate}: Monster Reborn cannot choose Chaos Sorcerer: it was not properly Special Summoned`);
  }
});

test("S: a Summon by a resolving effect (Monster Reborn) has no negation window, but its response window exists after Chain Link 1 resolves", () => {
  const r = game([{ hand: [MONSTER_REBORN], grave: [GEMINI] }, { mzone: [ELF], szone: [SOLEMN, TORRENTIAL] }], [activate(MONSTER_REBORN), pick(GEMINI), look]);
  assert.ok(has(r, 0, "mzone", GEMINI));
  const after = r.windows.filter((w) => w.ends === 1 && w.type === M.SELECT_CHAIN && w.player === 1);
  assert.ok(after.every((w) => !offers(w, SOLEMN)), "Solemn Judgment is never offered against the Summon");
  assert.ok(after.some((w) => offers(w, TORRENTIAL)), "Torrential Tribute is offered in response to it");
});

test("S / MT: a Summon performed by Chain Link 2 is not the last thing to happen: there is no response window for Torrential Tribute or Bottomless Trap Hole", () => {
  // Chain Disappearance (a monster with 1000 or less ATK is Summoned) stands for the cards of that kind: Gemini Elf is swapped
  // for Ojama Green (0 ATK) so it applies.
  const CHAIN_DISAPPEARANCE = 57139487;
  const sides = (hand) => [{ hand, szone: [CALL_OF_THE_HAUNTED], grave: [GEMINI, OJAMA_GREEN] }, { mzone: [ELF], szone: [TORRENTIAL, BOTTOMLESS, CHAIN_DISAPPEARANCE] }];
  const cl2 = game(sides([FOOLISH]), [activate(FOOLISH), by(0, chain(CALL_OF_THE_HAUNTED)), pick(GEMINI), look]);
  assert.deepEqual(chains(cl2)[0], [FOOLISH, CALL_OF_THE_HAUNTED]);
  assert.ok(has(cl2, 0, "mzone", GEMINI), "Gemini Elf was Special Summoned by Chain Link 2");
  const after = cl2.windows.filter((w) => w.ends === 1 && w.player === 1 && w.type === M.SELECT_CHAIN);
  assert.ok(after.every((w) => !offers(w, TORRENTIAL) && !offers(w, BOTTOMLESS)), "no response window");
  const small = game(sides([FOOLISH]), [activate(FOOLISH), by(0, chain(CALL_OF_THE_HAUNTED)), pick(OJAMA_GREEN), look]);
  assert.ok(has(small, 0, "mzone", OJAMA_GREEN));
  assert.ok(small.windows.filter((w) => w.ends === 1 && w.player === 1).every((w) => !offers(w, CHAIN_DISAPPEARANCE) && !offers(w, TORRENTIAL)), "nor for Chain Disappearance");
  // The same Summon as Chain Link 1 opens it.
  const cl1 = game(sides([]), [(m) => act.chain(m, CALL_OF_THE_HAUNTED) ?? act.activate(m, CALL_OF_THE_HAUNTED), pick(GEMINI), look]);
  assert.ok(cl1.windows.some((w) => w.ends >= 1 && w.player === 1 && offers(w, TORRENTIAL) && offers(w, BOTTOMLESS)));
  const cl1small = game(sides([]), [(m) => act.chain(m, CALL_OF_THE_HAUNTED) ?? act.activate(m, CALL_OF_THE_HAUNTED), pick(OJAMA_GREEN), look]);
  assert.ok(cl1small.windows.some((w) => w.ends >= 1 && w.player === 1 && offers(w, CHAIN_DISAPPEARANCE)));
});

test("S example 3: Royal Oppression's negation of a Synchro Summon resolves without effect after Dust Tornado destroys it; the Summon succeeds and the turn player has Ignition Effect priority", () => {
  const r = game([{ mzone: [KREBONS, GEMINI], extra: [GOYO], szone: [DUST_TORNADO], grave: [MALICIOUS], deck: [ELF, MALICIOUS] }, { szone: [{ code: ROYAL_OPPRESSION, position: P.FACEUP }] }],
    [special(GOYO), by(1, chain(ROYAL_OPPRESSION)), by(0, chain(DUST_TORNADO)), pick(ROYAL_OPPRESSION), look]);
  assert.deepEqual(chains(r)[0], [ROYAL_OPPRESSION, DUST_TORNADO]);
  assert.ok(has(r, 1, "grave", ROYAL_OPPRESSION));
  assert.ok(has(r, 0, "mzone", GOYO), "Goyo Guardian was successfully Summoned");
  assert.equal(r.lp[1], 8000 - 800, "Royal Oppression's 800 Life Points were paid and are not refunded");
  const next = r.windows.find((w) => w.ends === 1 && (w.type === M.SELECT_CHAIN || w.type === M.SELECT_IDLECMD));
  assert.deepEqual({ player: next.player, malicious: offers(next, MALICIOUS) }, { player: 0, malicious: true }, "Summon response timing: the turn player may start a chain with an Ignition Effect");
});

test("S, rule example 2: Cyber Dragon's Summon; Level Eater (Ignition, Chain Link 1), Bottomless Trap Hole (2), Book of Moon (3): Bottomless and Level Eater resolve without effect", () => {
  const r = game([{ hand: [CYBER_DRAGON, BOOK_OF_MOON], grave: [LEVEL_EATER] }, { mzone: [ELF], szone: [BOTTOMLESS] }],
    [special(CYBER_DRAGON), chain(LEVEL_EATER), maybe(pick(CYBER_DRAGON)), by(1, chain(BOTTOMLESS)), by(0, chain(BOOK_OF_MOON)), pick(CYBER_DRAGON), look]);
  assert.deepEqual(chains(r)[0], [LEVEL_EATER, BOTTOMLESS, BOOK_OF_MOON]);
  const cd = r.players[0].mzone.find((c) => c?.code === CYBER_DRAGON);
  assert.equal(cd?.position, P.FACEDOWN_DEFENSE, "Cyber Dragon is face-down on the field");
  assert.ok(has(r, 0, "grave", LEVEL_EATER), "Level Eater stays in the Graveyard");
});

// =====================================================================================================================
// Missing the timing (MT), costs
// =====================================================================================================================
const PETEN = 52624755, RETURNER = 9418534, JINZO = 77585513, CHIMERATECH = 79229522, DUPE_FROG = 46239604, MAGICAL_ANDROID = 43385557, TREEBORN = 12538374;
const ARCANE_APPRENTICE = 40048324, ARCANITE = 31924889, BREAKER = 71413901, MAGICIAN_OF_FAITH = 31560081, ASSAULT_MODE = 80280737;
const LIGHTNING_VORTEX = 69162969, RYKO = 21502796, CAIUS = 9748752, PEACEKEEPER = 78349103, Y_DRAGON = 65622692, ULTIMATE_OFFERING = 80604091;

test("MT, 'When... you can' example 1: Peten the Dark Clown Tributed for Summoned Skull misses the timing (the Tribute Summon is the last thing to happen)", () => {
  const r = game([{ mzone: [PETEN], hand: [SKULL], deck: [ELF, PETEN] }, {}], [summon(SKULL), look]);
  assert.ok(has(r, 0, "mzone", SKULL) && has(r, 0, "grave", PETEN));
  assert.equal(chained(r, PETEN), 0);
  assert.ok(r.windows.every((w) => !offers(w, PETEN)), "never offered");
});

test("MT, 'When... you can' example 2: Jinzo - Returner used to Summon Chimeratech Fortress Dragon misses the timing", () => {
  const r = game([{ mzone: [CYBER_DRAGON, RETURNER], grave: [JINZO], extra: [CHIMERATECH] }, { mzone: [ELF] }], [special(CHIMERATECH), look]);
  assert.ok(has(r, 0, "mzone", CHIMERATECH) && has(r, 0, "grave", RETURNER));
  assert.equal(chained(r, RETURNER), 0);
});

test("MT, 'When... you can' example 3: Dupe Frog used as Synchro Material for Magical Android misses the timing", () => {
  const r = game([{ mzone: [JUNK_SYNCHRON, DUPE_FROG], extra: [MAGICAL_ANDROID], deck: [ELF, TREEBORN] }, {}], [special(MAGICAL_ANDROID), look]);
  assert.ok(has(r, 0, "mzone", MAGICAL_ANDROID) && has(r, 0, "grave", DUPE_FROG));
  assert.equal(chained(r, DUPE_FROG), 0);
});

test("MT, 'If... you can': Arcane Apprentice used as Synchro Material for Arcanite Magician activates in the Summon response timing", () => {
  const r = game([{ mzone: [ARCANE_APPRENTICE, BREAKER, { code: MAGICIAN_OF_FAITH, position: P.FACEUP_ATTACK }], extra: [ARCANITE], deck: [ELF, ASSAULT_MODE] }, {}], [special(ARCANITE), chain(ARCANE_APPRENTICE), look]);
  assert.ok(has(r, 0, "mzone", ARCANITE));
  assert.deepEqual(chains(r)[0], [ARCANITE, ARCANE_APPRENTICE], "rule 7: Arcanite Magician's mandatory trigger is Chain Link 1, the optional one Chain Link 2");
  assert.ok(has(r, 0, "hand", ASSAULT_MODE));
});

test("MT, 'When... [do this]' example 2: Sangan used as Synchro Material starts a chain even with nothing in the Deck to search", () => {
  // Every card left in the Deck is Blue-Eyes White Dragon (3000 ATK).
  const r = game([{ mzone: [JUNK_SYNCHRON, SANGAN], extra: [GOYO] }, {}], [special(GOYO), look], { filler: BLUE_EYES });
  assert.ok(has(r, 0, "mzone", GOYO));
  assert.equal(chained(r, SANGAN), 1);
});

test("MT, cost vs effect: Jinzo - Returner discarded to activate Lightning Vortex misses the timing; the cost is not refunded when Solemn Judgment negates the activation", () => {
  const sides = (opp) => [{ hand: [LIGHTNING_VORTEX, RETURNER], grave: [JINZO] }, { mzone: [ELF], ...opp }];
  const resolved = game(sides({}), [activate(LIGHTNING_VORTEX), look]);
  assert.equal(chained(resolved, RETURNER), 0, "Returner's 'when... you can' was met while paying the cost");
  assert.ok(has(resolved, 1, "grave", ELF), "Lightning Vortex resolved");
  const negated = game(sides({ szone: [SOLEMN] }), [activate(LIGHTNING_VORTEX), by(1, chain(SOLEMN)), look]);
  assert.deepEqual({ hand: pile(negated, 0, "hand").filter((c) => c !== ELF), returner: has(negated, 0, "grave", RETURNER), vortex: has(negated, 0, "grave", LIGHTNING_VORTEX), elf: has(negated, 1, "mzone", ELF) },
    { hand: [], returner: true, vortex: true, elf: true }, "Lightning Vortex was negated and the discarded card stays in the Graveyard");
});

test("MT, conjunctions: Ryko destroys Peten, then sends 3 cards: Peten misses the timing, Sangan does not; Peten sent by the last part activates", () => {
  const ryko = (opp, deck = [ELF, ELF, ELF, ELF]) => game([{ mzone: [{ code: RYKO, position: P.FACEDOWN_DEFENSE }], deck }, opp],
    [flipSummon(RYKO), maybe(yes), (m) => (m.type === M.SELECT_CARD && m.player === 0 ? (opp.mzone ? act.pick(m, opp.mzone[0]) : act.pick(m, ELF)) : undefined), look]);
  const peten = ryko({ mzone: [PETEN], deck: [PETEN] });
  assert.ok(has(peten, 1, "grave", PETEN), "Ryko destroyed Peten");
  assert.equal(chained(peten, PETEN), 0, "destroyed by the first part: misses the timing");
  const sangan = ryko({ mzone: [SANGAN] });
  assert.ok(has(sangan, 1, "grave", SANGAN));
  assert.equal(chained(sangan, SANGAN), 1, "mandatory: still activates");
  // Ryko targets the opponent's Mystical Elf and sends Peten from its controller's Deck in the last part.
  const milled = ryko({ mzone: [ELF] }, [ELF, PETEN, ELF, ELF, PETEN]);
  assert.ok(has(milled, 0, "grave", PETEN) || has(milled, 0, "removed", PETEN), "Peten was sent from the Deck");
  assert.equal(chained(milled, PETEN), 1, "sent by the last thing to happen: activates");
});

test("MT, the last thing to happen: Caius targets Machina Peacekeeper, Torrential Tribute is chained; Caius's effect resolves last, so Peacekeeper misses the timing (Sangan does not)", () => {
  const r = game([{ hand: [CAIUS], mzone: [GEMINI] }, { mzone: [PEACEKEEPER, SANGAN], szone: [TORRENTIAL], deck: [Y_DRAGON] }],
    [summon(CAIUS), maybe(pick(GEMINI)), (m) => (m.type === M.SELECT_CARD && m.player === 0 ? act.pick(m, PEACEKEEPER) : undefined), by(1, chain(TORRENTIAL)), look]);
  assert.deepEqual(chains(r)[0], [CAIUS, TORRENTIAL]);
  assert.ok(has(r, 1, "grave", PEACEKEEPER) && has(r, 1, "grave", SANGAN) && has(r, 0, "grave", CAIUS));
  assert.equal(chained(r, PEACEKEEPER), 0);
  assert.equal(chained(r, SANGAN), 1);
});

test("MT: a 'when... you can' effect whose condition was met by Chain Link 1 activates (Peten sent by Foolish Burial)", () => {
  const r = game([{ hand: [FOOLISH], deck: [ELF, PETEN, PETEN] }, {}], [activate(FOOLISH), pick(PETEN), look]);
  assert.equal(chained(r, PETEN), 1);
});

// =====================================================================================================================
// Battle Phase (BP), rule 8 (RD), and the rulebook's battle pages
// =====================================================================================================================
const COMPULSORY = 94192409, JAR_OF_GREED = 83968380, COMMAND_KNIGHT = 10375182, GOZEN_MATCH = 53334471, PENGUIN_SOLDIER = 93920745, SHINING_ANGEL = 95956346;
const MYSTIC_TOMATO = 83011277, VOLTIC = 9327502, GOBLIN_ATTACK_FORCE = 78658564, BESTIARI = 41470137, HOPLOMUS = 4253484, DARIUS = 25924653, LAQUARI = 78868776;
const SPEAR_DRAGON = 31553716, MYSTIC_SWORDSMAN_LV2 = 47507260;

/** Team 1 attacks on turn 2 with `attacker`, at `target` when the core asks (or directly); then `rest` steps, until the Battle Phase is over. */
const attackSteps = (attacker, target, ...rest) => [turn(2), toBattle, attack(attacker), target === undefined ? maybe(() => undefined) : (m) => (m.type === M.SELECT_CARD && m.player === 1 ? act.pick(m, target) : undefined), ...rest, until(battleOver)];
const inDamageStep = (r, w) => w.turn === 2 && w.hint >= 40 && w.hint <= 45;

test("BP / RB p.36 replay: the number of the opponent's monsters changes after the declaration; the new target can be chosen, Mirror Force cannot be activated against it", () => {
  // Gemini Elf attacks Mystical Elf; the defender sends its other monster back to the hand with Compulsory Evacuation Device.
  let asked = false, retargeted = null;
  const r = game([{ mzone: [ELF, OJAMA_GREEN], szone: [COMPULSORY, MIRROR_FORCE] }, { mzone: [GEMINI] }],
    attackSteps(GEMINI, ELF, by(0, chain(COMPULSORY)), pick(OJAMA_GREEN), (m) => (m.type === M.SELECT_YESNO ? ((asked = true), { type: R.SELECT_YESNO, yes: true }) : undefined),
      (m) => (m.type === M.SELECT_CARD && m.player === 1 ? ((retargeted = m.selects.map((c) => c.code)), act.pick(m, ELF)) : undefined)), { lastTurn: 2 });
  assert.ok(has(r, 0, "hand", OJAMA_GREEN));
  assert.ok(asked && retargeted?.includes(ELF), "a replay: the attacker chose its target again");
  const later = r.windows.filter((w) => w.turn === 2 && w.ends >= 1 && w.player === 0 && w.type === M.SELECT_CHAIN);
  assert.ok(later.every((w) => !offers(w, MIRROR_FORCE)), "Mirror Force is not offered after the new target is selected");
  assert.ok(has(r, 0, "grave", ELF) && r.lp[0] === 8000 - 1100, "the attack went on against Mystical Elf");
});

test("BP replay: when the opponent's monsters are reduced to zero, the attacker may attack directly instead", () => {
  const r = game([{ mzone: [ELF], szone: [COMPULSORY] }, { mzone: [GEMINI] }],
    attackSteps(GEMINI, ELF, by(0, chain(COMPULSORY)), pick(ELF), yes), { lastTurn: 2 });
  assert.ok(has(r, 0, "hand", ELF));
  assert.equal(r.lp[0], 8000 - 1900, "a direct attack");
});

test("BP Battle Step, substep 2: in a later chain before the Damage Step the attack can still be stopped (Book of Moon on the attacker)", () => {
  const r = game([{ mzone: [ELF], szone: [JAR_OF_GREED, BOOK_OF_MOON] }, { mzone: [GEMINI] }],
    attackSteps(GEMINI, ELF, by(0, chain(JAR_OF_GREED)), (m, d) => (m.player === 0 && m.type === M.SELECT_CHAIN && d.chain.length === 0 ? act.chain(m, BOOK_OF_MOON) : undefined), pick(GEMINI)), { lastTurn: 2 });
  assert.deepEqual(chains(r).filter((c) => c.includes(JAR_OF_GREED) || c.includes(BOOK_OF_MOON)), [[JAR_OF_GREED], [BOOK_OF_MOON]], "two chains");
  assert.deepEqual({ lp: r.lp, elf: has(r, 0, "mzone", ELF), damageStep: r.seen.some((e) => e.type === M.DAMAGE_STEP_START) }, { lp: [8000, 8000], elf: true, damageStep: false });
});

test("BP Damage Step, substep 2: a face-down Command Knight flipped by the attack does not stop it, though its effect forbids attacking it", () => {
  const r = game([{ mzone: [{ code: COMMAND_KNIGHT, position: P.FACEDOWN_DEFENSE }, ELF] }, { mzone: [SKULL] }], attackSteps(SKULL, COMMAND_KNIGHT), { lastTurn: 2 });
  assert.ok(has(r, 0, "grave", COMMAND_KNIGHT), "Summoned Skull (2500) destroyed Command Knight (DEF 1900)");
});

test("BP Damage Step, substeps 2 and 5: Gozen Match sends a monster only after damage calculation, so the flipped monster still battles", () => {
  // The defender controls a face-up LIGHT Mystical Elf and a face-down EARTH Labyrinth Wall (DEF 3000); Gemini Elf (1900) attacks the Wall.
  const r = game([{ mzone: [ELF, { code: LABYRINTH_WALL, position: P.FACEDOWN_DEFENSE }], szone: [{ code: GOZEN_MATCH, position: P.FACEUP }] }, { mzone: [GEMINI] }],
    attackSteps(GEMINI, LABYRINTH_WALL), { lastTurn: 2 });
  assert.equal(r.lp[1], 8000 - 1100, "damage was calculated against the Wall's DEF");
  assert.equal(pile(r, 0, "mzone").length, 1, "then Gozen Match left the defender one Attribute");
});

test("BP Damage Step, substep 4 'finally' / RB p.38: a monster destroyed by battle cannot be targeted by the flip effect that resolves after damage calculation (Penguin Soldier)", () => {
  let targets = null;
  const r = game([{ mzone: [{ code: PENGUIN_SOLDIER, position: P.FACEDOWN_DEFENSE }] }, { mzone: [GEMINI] }],
    attackSteps(GEMINI, PENGUIN_SOLDIER, maybe(yes), (m) => (m.type === M.SELECT_CARD && m.player === 0 ? ((targets = m.selects.map((c) => c.code)), act.pick(m, GEMINI)) : undefined)), { lastTurn: 2 });
  assert.ok(has(r, 0, "grave", PENGUIN_SOLDIER));
  assert.ok(targets, "Penguin Soldier's flip effect activated");
  assert.deepEqual(targets, [GEMINI], "only the attacker can be chosen");
  assert.ok(has(r, 1, "hand", GEMINI));
});

test("BP substep 4 / RD rule 8 / RB p.38: Shrink can be activated before damage calculation, not during or after it", () => {
  const r = game([{ mzone: [ELF], szone: [SHRINK] }, { mzone: [GEMINI] }], attackSteps(GEMINI, ELF), { lastTurn: 2 });
  const ds = r.windows.filter((w) => inDamageStep(r, w) && w.player === 0 && w.type === M.SELECT_CHAIN);
  const byHint = Object.fromEntries([41, 42, 45, 43, 44].map((h) => [h, ds.filter((w) => w.hint === h).some((w) => offers(w, SHRINK))]));
  assert.deepEqual(byHint, { 41: true, 42: false, 45: false, 43: false, 44: false });
});

test("RD rule 8: a Counter Trap can be activated in the Damage Step: Divine Wrath negates Honest", () => {
  const r = game([{ mzone: [ELF], hand: [ELF], szone: [DIVINE_WRATH] }, { mzone: [SHINING_ANGEL], hand: [HONEST] }],
    attackSteps(SHINING_ANGEL, ELF, (m, d) => (m.player === 1 && d.chain.length === 0 ? act.chain(m, HONEST) : undefined), by(0, chain(DIVINE_WRATH))), { lastTurn: 2 });
  assert.deepEqual(chains(r).find((c) => c.includes(HONEST)), [HONEST, DIVINE_WRATH]);
  assert.equal(r.lp[0], 8000 - 600, "Shining Angel battled with its own 1400 ATK");
});

test("RD rule 8: Royal Oppression (a Spell Speed 2 card that negates) cannot be activated in the Damage Step against Mystic Tomato's Special Summon", () => {
  const r = game([{ mzone: [MYSTIC_TOMATO], deck: [ELF, SPIRIT_REAPER] }, { mzone: [GEMINI], szone: [{ code: ROYAL_OPPRESSION, position: P.FACEUP }] }],
    attackSteps(GEMINI, MYSTIC_TOMATO, by(0, chain(MYSTIC_TOMATO)), maybe(pick(SPIRIT_REAPER))), { lastTurn: 2 });
  assert.equal(chained(r, MYSTIC_TOMATO), 1);
  assert.ok(r.windows.filter((w) => inDamageStep(r, w) && w.player === 1).every((w) => !offers(w, ROYAL_OPPRESSION)), "never offered in the Damage Step");
  assert.ok(has(r, 0, "mzone", SPIRIT_REAPER));
});

test("BP substep 5: Elemental HERO Voltic Special Summons Stratos when it inflicts battle damage; Stratos's trigger is another chain in the Damage Step", () => {
  const r = game([{}, { mzone: [VOLTIC], removed: [STRATOS], deck: [ELF, ELF, STRATOS] }],
    attackSteps(VOLTIC, undefined, by(1, chain(VOLTIC)), maybe(pick(STRATOS)), by(1, (m) => act.chain(m, STRATOS) ?? yes(m))), { lastTurn: 2 });
  assert.equal(r.lp[0], 8000 - 1000);
  assert.ok(has(r, 1, "mzone", STRATOS));
  const cs = chains(r);
  assert.deepEqual(cs.slice(0, 2), [[VOLTIC], [STRATOS]]);
});

test("BP substep 7: Mystic Tomato destroyed by battle Special Summons Armageddon Knight, whose trigger is another chain in the Damage Step", () => {
  const r = game([{ mzone: [MYSTIC_TOMATO], deck: [ELF, ARMAGEDDON_KNIGHT, MALICIOUS] }, { mzone: [GEMINI] }],
    attackSteps(GEMINI, MYSTIC_TOMATO, by(0, chain(MYSTIC_TOMATO)), maybe(pick(ARMAGEDDON_KNIGHT)), by(0, (m) => act.chain(m, ARMAGEDDON_KNIGHT) ?? yes(m)), maybe(pick(MALICIOUS))), { lastTurn: 2 });
  assert.deepEqual(chains(r).slice(0, 2), [[MYSTIC_TOMATO], [ARMAGEDDON_KNIGHT]]);
  assert.ok(has(r, 0, "grave", MALICIOUS));
});

test("BP substep 6: Ryko flipped by an attack activates after damage calculation though destroyed; Peten it sends to the Graveyard starts another chain", () => {
  const r = game([{ mzone: [{ code: RYKO, position: P.FACEDOWN_DEFENSE }], deck: [ELF, PETEN, ELF, ELF, PETEN] }, { mzone: [GEMINI] }],
    attackSteps(GEMINI, RYKO, maybe(yes), (m) => (m.type === M.SELECT_CARD && m.player === 0 ? act.pick(m, GEMINI) : undefined), by(0, (m) => act.chain(m, PETEN) ?? yes(m))), { lastTurn: 2 });
  assert.ok(has(r, 0, "grave", RYKO) && has(r, 1, "grave", GEMINI));
  assert.deepEqual(chains(r).slice(0, 2), [[RYKO], [PETEN]]);
});

test("BP End Step: Goblin Attack Force changes to Defense Position at the end of the Battle Phase without starting a chain", () => {
  const r = game([{}, { mzone: [GOBLIN_ATTACK_FORCE] }], attackSteps(GOBLIN_ATTACK_FORCE), { lastTurn: 2 });
  assert.equal(r.lp[0], 8000 - 2300);
  assert.equal(r.players[1].mzone.find((c) => c?.code === GOBLIN_ATTACK_FORCE)?.position, P.FACEUP_DEFENSE);
  assert.equal(chained(r, GOBLIN_ATTACK_FORCE), 0);
});

test("BP End Step: the turn player's Gladiator Beast effect activates and resolves before the non-turn player can activate theirs", () => {
  // Bestiari (1500) attacks a face-up Defense Position Hoplomus (DEF 2100); both battled and stay on the field.
  const r = game([{ mzone: [{ code: HOPLOMUS, position: P.FACEUP_DEFENSE }], deck: [ELF, LAQUARI] }, { mzone: [BESTIARI], deck: [ELF, ELF, DARIUS] }],
    attackSteps(BESTIARI, HOPLOMUS, (m) => act.chain(m, BESTIARI) ?? act.chain(m, HOPLOMUS) ?? yes(m)), { lastTurn: 2 });
  assert.equal(r.lp[1], 8000 - 600);
  const gb = chains(r).filter((c) => c.includes(BESTIARI) || c.includes(HOPLOMUS));
  assert.deepEqual(gb, [[BESTIARI], [HOPLOMUS]], "two chains: the turn player's resolves first");
});

// =====================================================================================================================
// Rule differences (RD) beyond the ones edison-rules.test.mjs already plays
// =====================================================================================================================
const UMI = 22702055, MOUNTAIN = 50913601, SECRET_VILLAGE = 68462976, DARK_MAGICIAN = 46986414, MAUSOLEUM = 80921533, GEARTOWN = 37694547, AG_GOLEM = 56094445;
const APOPHIS = 28649820, ZOMA = 79852326, JINZO_CARD = JINZO, BRAIN_CONTROL = 87910978, HEAVY_STORM = 19613556, IMT = 36261276;
const MIRROR_WALL = 22359980, DEGENERATE_CIRCUIT = 36995273, TOON_WORLD = 15259703, WHITE_STONE = 79814787, SUPER_REJUVENATION = 27770341;
const NECROFACE = 28297833, FUTURE_VISIONS = 87902575, ASLLA_PISCU = 10875327, PWWB = 63356631, SOUL_EXCHANGE = 68005187;
const field = (code, position = P.FACEUP) => [, , , , , { code, position }];

test("RD rule 2, examples 1-2: Mountain destroys the opponent's Umi when it resolves; if Dust Tornado destroys Mountain in the chain, Umi stays", () => {
  const plain = game([{ hand: [MOUNTAIN] }, { szone: field(UMI) }], [activate(MOUNTAIN), look]);
  assert.ok(has(plain, 1, "grave", UMI) && has(plain, 0, "szone", MOUNTAIN));
  const chainedDT = game([{ hand: [MOUNTAIN] }, { szone: [DUST_TORNADO, , , , , { code: UMI, position: P.FACEUP }] }], [activate(MOUNTAIN), by(1, chain(DUST_TORNADO)), pick(MOUNTAIN), look]);
  assert.deepEqual({ umi: has(chainedDT, 1, "szone", UMI), mountain: has(chainedDT, 0, "grave", MOUNTAIN) }, { umi: true, mountain: true });
});

test("RD rule 2, example 3: Setting Umi does not destroy the opponent's Secret Village of the Spellcasters, and Umi cannot then be activated while they control a Spellcaster", () => {
  const r = game([{ hand: [UMI] }, { mzone: [DARK_MAGICIAN], szone: field(SECRET_VILLAGE) }],
    [(m) => { if (!idle(m)) return; const i = m.spell_sets.findIndex((c) => c.code === UMI); return i < 0 ? undefined : { type: R.SELECT_IDLECMD, action: I.SELECT_SPELL_SET, index: i }; }, look]);
  assert.ok(has(r, 1, "szone", SECRET_VILLAGE), "the Village stays");
  assert.equal(r.players[0].szone[5]?.code, UMI, "Umi is Set in its controller's Field Zone");
  assert.ok(!offers(r.windows.at(-1), UMI), "and cannot be activated");
});

test("RD rule 2, examples 4-5: Setting Mausoleum of the Emperor over your own Geartown destroys it without a chain and Geartown's effect activates; activating Mausoleum over it starts a chain and Geartown misses the timing", () => {
  const sides = [{ hand: [MAUSOLEUM, AG_GOLEM], szone: field(GEARTOWN) }, {}];
  const setIt = game(sides, [(m) => { if (!idle(m)) return; const i = m.spell_sets.findIndex((c) => c.code === MAUSOLEUM); return i < 0 ? assert.fail("Mausoleum cannot be Set over Geartown") : { type: R.SELECT_IDLECMD, action: I.SELECT_SPELL_SET, index: i }; }, maybe(chain(GEARTOWN)), maybe(yes), look]);
  assert.ok(has(setIt, 0, "grave", GEARTOWN), "Geartown was destroyed");
  assert.equal(chained(setIt, GEARTOWN), 1, "Geartown's effect activated");
  const activated = game(sides, [activate(MAUSOLEUM), look]);
  assert.ok(has(activated, 0, "grave", GEARTOWN));
  assert.equal(chained(activated, GEARTOWN), 0, "Geartown missed the timing");
});

test("RD rule 5: a Trap Monster cannot be activated with no empty Monster Card Zone", () => {
  const r = game([{ mzone: [ELF, ELF, ELF, ELF, ELF], szone: [APOPHIS] }, {}], [look]);
  assert.ok(!offers(r.windows.at(-1), APOPHIS));
});

const apophisUp = (m, d) => (d.turn === 1 ? act.activate(m, APOPHIS) : undefined);
test("RD rule 5: a Trap Monster whose effect is negated by Jinzo reverts to a Trap Card in the Spell & Trap Zone at once", () => {
  const r = game([{ szone: [APOPHIS] }, { mzone: [ELF], hand: [JINZO_CARD] }], [apophisUp, turn(2), summon(JINZO_CARD), maybe(pick(ELF)), look], { lastTurn: 2 });
  assert.ok(has(r, 1, "mzone", JINZO_CARD));
  assert.deepEqual({ mzone: has(r, 0, "mzone", APOPHIS), szone: has(r, 0, "szone", APOPHIS) }, { mzone: false, szone: true });
});

test("RD rule 5: a Trap Monster flipped face-down by Book of Moon is Set in its Spell & Trap Zone; one the opponent controls goes to the opponent's", () => {
  const own = game([{ szone: [APOPHIS], hand: [BOOK_OF_MOON] }, {}], [activate(APOPHIS), activate(BOOK_OF_MOON), pick(APOPHIS), look]);
  const ap = own.players[0].szone.find((c) => c?.code === APOPHIS);
  assert.deepEqual({ inSzone: !!ap, faceDown: ap ? (ap.position & P.FACEDOWN) !== 0 : null, inMzone: has(own, 0, "mzone", APOPHIS) }, { inSzone: true, faceDown: true, inMzone: false });
});

// Found by this audit: the core leaves the taken Apophis face-down in the taker's Monster Zone (position face-down, a
// monster nobody can use) instead of Setting it in their Spell & Trap Zone. Brain Control's control ends when the card is
// flipped (RESET_TURN_SET) while change_position moves it by its controller; the two disagree. Needs a core fix.
test("RD rule 5: your Embodiment of Apophis that the opponent controls (Brain Control) and that is flipped face-down goes to the opponent's Spell & Trap Zone", { todo: "core leaves it face-down in the taker's Monster Zone" }, () => {
  const taken = game([{ szone: [APOPHIS] }, { hand: [BRAIN_CONTROL, BOOK_OF_MOON] }], [apophisUp, turn(2), activate(BRAIN_CONTROL), pick(APOPHIS), activate(BOOK_OF_MOON), pick(APOPHIS), look], { lastTurn: 2 });
  const where = (r) => Object.fromEntries([0, 1].flatMap((t) => ["mzone", "szone"].map((z) => [`${t}.${z}`, r.players[t][z].filter((c) => c?.code === APOPHIS).map((c) => c.position)])).filter(([, v]) => v.length));
  assert.deepEqual(where(taken), { "1.szone": [P.FACEDOWN] }, "Set in the Spell & Trap Zone of the player who controlled it");
});

test("RD rule 5: a Trap Monster is affected by cards that affect Traps (Heavy Storm) and by cards that affect monsters (Lightning Vortex)", () => {
  for (const [card, extra] of [[HEAVY_STORM, []], [LIGHTNING_VORTEX, [ELF]]]) {
    const r = game([{ szone: [APOPHIS] }, { hand: [card, ...extra] }], [apophisUp, turn(2), activate(card), maybe(pick(ELF)), look], { lastTurn: 2 });
    assert.ok(has(r, 0, "grave", APOPHIS), `${card} destroyed Embodiment of Apophis`);
  }
});

test("RD rule 5: a Trap Monster that leaves the field is a Trap Card: Monster Reborn cannot revive it; Caius removing Zoma the Spirit inflicts no damage", () => {
  let targets = null;
  game([{ szone: [APOPHIS] }, { hand: [LIGHTNING_VORTEX, ELF, MONSTER_REBORN] }],
    [apophisUp, turn(2), activate(LIGHTNING_VORTEX), maybe(pick(ELF)), (m) => (idle(m) ? act.activate(m, MONSTER_REBORN) ?? "stop" : undefined), (m) => (m.type === M.SELECT_CARD ? ((targets = m.selects.map((c) => c.code)), "stop") : undefined)], { lastTurn: 2 });
  assert.ok(!targets?.includes(APOPHIS), "Apophis is not a monster in the Graveyard");
  const zoma = game([{ szone: [ZOMA] }, { mzone: [ELF], hand: [CAIUS] }], [(m, d) => (d.turn === 1 ? act.activate(m, ZOMA) : undefined), turn(2), summon(CAIUS), maybe(pick(ELF)), (m) => (m.type === M.SELECT_CARD && m.player === 1 ? act.pick(m, ZOMA) : undefined), look], { lastTurn: 2 });
  assert.ok(has(zoma, 0, "removed", ZOMA), "Caius removed Zoma");
  assert.equal(zoma.lp[0], 8000, "no damage: it left the field as a Trap Card, not a DARK monster");
});

test("RD rule 5: a Trap Monster removed from play until the End Phase (Interdimensional Matter Transporter) returns as a Trap Card and is destroyed at once", () => {
  const r = game([{ szone: [APOPHIS, IMT] }, {}], [activate(APOPHIS), (m) => act.chain(m, IMT) ?? act.activate(m, IMT), pick(APOPHIS), turn(2)], { lastTurn: 2 });
  assert.ok(has(r, 0, "grave", APOPHIS), "it is in the Graveyard after the End Phase");
});

test("RD rule 5: to take control of a Trap Monster you need an open Monster Card Zone and an open Spell & Trap Card Zone", () => {
  // Brain Control is the 5th card in its controller's Spell & Trap Zone while it resolves, so none is open.
  const r = game([{ szone: [APOPHIS] }, { hand: [BRAIN_CONTROL], szone: [MST, MST, MST, MST] }], [apophisUp, turn(2), (m) => (idle(m) ? act.activate(m, BRAIN_CONTROL) ?? "stop" : undefined), maybe(pick(APOPHIS)), look], { lastTurn: 2 });
  assert.ok(!has(r, 1, "mzone", APOPHIS), "control did not change");
});

test("RD rule 10: Mirror Wall's optional cost cannot be paid at 2000 Life Points or less, so it is destroyed; Degenerate Circuit's mandatory cost cannot be paid at 500 or less", () => {
  const upkeep = (code, lp) => {
    const r = game([{ szone: [{ code, position: P.FACEUP }] }, {}], [look], { lp });
    return { lp: r.lp[0], destroyed: has(r, 0, "grave", code) };
  };
  assert.deepEqual(upkeep(MIRROR_WALL, 2000), { lp: 2000, destroyed: true });
  assert.deepEqual(upkeep(MIRROR_WALL, 2001), { lp: 1, destroyed: false });
  assert.deepEqual(upkeep(DEGENERATE_CIRCUIT, 500), { lp: 500, destroyed: true });
  assert.deepEqual(upkeep(DEGENERATE_CIRCUIT, 501), { lp: 1, destroyed: false });
});

test("RD rule 10 / RB p.51: a Life Point cost larger than your Life Points cannot be paid either", () => {
  const r = game([{ hand: [TOON_WORLD] }, {}], [look], { lp: 999 });
  assert.ok(!offers(r.windows.at(-1), TOON_WORLD));
});

test("RD rule 11, example 1: the end-of-turn discard cannot be responded to; The White Stone of Legend's mandatory trigger can be negated (Divine Wrath) but not chained by Super Rejuvenation or a non-negating card", () => {
  let discard = null;
  const r = game([{ hand: [WHITE_STONE, SUPER_REJUVENATION, ELF, ELF, ELF, ELF], szone: [MST], deck: [ELF, BLUE_EYES] }, { hand: [ELF], szone: [DIVINE_WRATH, DUST_TORNADO] }],
    [(m, d) => (d.phase === PH.END && m.type === M.SELECT_CARD && m.player === 0 ? ((discard = m), act.pick(m, WHITE_STONE)) : undefined), until((m, d) => d.turn > 1)], { lastTurn: 2 });
  assert.ok(discard, "team 0 discarded for hand size");
  assert.equal(chained(r, WHITE_STONE), 1);
  const inChain = r.windows.filter((w) => w.turn === 1 && w.phase === PH.END && w.chain.includes(WHITE_STONE) && w.type === M.SELECT_CHAIN);
  assert.ok(inChain.some((w) => w.player === 1 && offers(w, DIVINE_WRATH)), "Divine Wrath can negate it");
  assert.ok(inChain.every((w) => !offers(w, DUST_TORNADO) && !offers(w, SUPER_REJUVENATION)), "nothing else can be chained");
  const afterDiscard = r.windows.filter((w) => w.turn === 1 && w.phase === PH.END && w.n > r.windows.indexOf(r.windows.find((x) => x.m === discard)) && w.chain.length === 0 && w.type === M.SELECT_CHAIN);
  assert.ok(afterDiscard.every((w) => !offers(w, DUST_TORNADO)), "the discard itself cannot be responded to");
});

test("RD rule 11, example 2: optional triggers of cards discarded for hand size cannot be activated (Peten the Dark Clown)", () => {
  const r = game([{ hand: [PETEN, ELF, ELF, ELF, ELF, ELF], deck: [ELF, PETEN] }, {}],
    [(m, d) => (d.phase === PH.END && m.type === M.SELECT_CARD && m.player === 0 ? act.pick(m, PETEN) : undefined), until((m, d) => d.turn > 1)], { lastTurn: 2 });
  assert.ok(has(r, 0, "grave", PETEN));
  assert.equal(chained(r, PETEN), 0);
  assert.ok(r.windows.every((w) => !offers(w, PETEN)));
});

test("RD rule 13, second half: a 0 ATK Attack Position monster cannot destroy a 0 DEF Defense Position monster", () => {
  const r = game([{ mzone: [{ code: MYSTIC_SWORDSMAN_LV2, position: P.FACEUP_DEFENSE }] }, { mzone: [OJAMA_GREEN] }], attackSteps(OJAMA_GREEN, MYSTIC_SWORDSMAN_LV2), { lastTurn: 2 });
  assert.ok(r.seen.some((e) => e.type === M.ATTACK), "the attack happened");
  assert.ok(has(r, 0, "mzone", MYSTIC_SWORDSMAN_LV2) && has(r, 1, "mzone", OJAMA_GREEN));
  assert.deepEqual(r.lp, [8000, 8000]);
});

test("RD rule 9: Earthbound Immortal Aslla piscu returned to the Deck from the field (Phoenix Wing Wind Blast) does not activate", () => {
  const r = game([{ mzone: [ASLLA_PISCU], szone: field(UMI) }, { mzone: [GEMINI], hand: [ELF], szone: [PWWB] }], [turn(2), (m) => act.activate(m, PWWB) ?? act.chain(m, PWWB), maybe(pick(ELF)), (m) => (m.type === M.SELECT_CARD ? act.pick(m, ASLLA_PISCU) : undefined), look], { lastTurn: 2 });
  assert.ok(!has(r, 0, "mzone", ASLLA_PISCU), "Aslla piscu left the field");
  assert.equal(chained(r, ASLLA_PISCU), 0);
  assert.ok(has(r, 1, "mzone", GEMINI));
});

test("RD rule 9 / MC: Necroface Normal Summoned under Future Visions: whichever order the two go on the chain, Necroface's 'when removed from play' effect activates after the chain, from wherever it ends up", () => {
  for (const cl1 of [NECROFACE, FUTURE_VISIONS]) {
    const r = game([{ hand: [NECROFACE], szone: field(FUTURE_VISIONS), removed: [ELF] }, {}], [summon(NECROFACE), chain(cl1), look], { filler: GEMINI });
    const first = chains(r)[0];
    assert.deepEqual(first, cl1 === NECROFACE ? [NECROFACE, FUTURE_VISIONS] : [FUTURE_VISIONS, NECROFACE], "both triggers on Chain 1, in the order chosen");
    // Necroface was shuffled into the Deck (Chain 1), so it may be among the 5 cards removed and trigger once more: hence "at least".
    assert.ok(chained(r, NECROFACE) >= 2, `order ${first}: Necroface's second effect activated`);
    const removed = pile(r, 1, "removed").length;
    assert.ok(removed >= 5 && removed % 5 === 0, `order ${first}: the opponent's top 5 cards were removed (${removed})`);
  }
});

test("RD rule 7, example 2: Caius Tribute Summoned with the opponent's Sangan (Soul Exchange): Caius is Chain Link 1 (turn player's mandatory), Sangan Chain Link 2", () => {
  const r = game([{ hand: [SOUL_EXCHANGE, CAIUS] }, { mzone: [SANGAN, ELF] }],
    [activate(SOUL_EXCHANGE), pick(SANGAN), summon(CAIUS), maybe(pick(SANGAN)), (m) => (m.type === M.SELECT_CARD && m.player === 0 ? act.pick(m, ELF) : undefined), look]);
  assert.ok(has(r, 0, "mzone", CAIUS) && has(r, 1, "grave", SANGAN));
  assert.deepEqual(chains(r).find((c) => c.includes(CAIUS)), [CAIUS, SANGAN]);
});

test("RD rule 7, steps 2-3: the opponent's mandatory trigger (Black Garden) goes on the chain before the turn player's optional one (Stratos)", () => {
  const r = game([{ hand: [STRATOS], deck: [ELF, STRATOS] }, { szone: field(BLACK_GARDEN) }], [summon(STRATOS), (m) => act.chain(m, STRATOS) ?? yes(m), look]);
  assert.deepEqual(chains(r)[0], [BLACK_GARDEN, STRATOS]);
});

// The same ruleset without formats/edison-scripts (and so without its init.lua), to show what a format-wide rule there changes.
const withoutInit = { ...edison, scriptDirs: edison.scriptDirs.filter((d) => !d.startsWith("./")) };
const WALL_OF_REVEALING_LIGHT = 17078030, STAR_BLAST = 67196946;

test("RD rule 10: a card that lets you choose how many Life Points to pay offers only amounts below your Life Points (Wall of Revealing Light, Star Blast)", () => {
  const amounts = (code, lp, sides, format) => {
    let options = null;
    game(sides, [(m) => act.activate(m, code) ?? act.chain(m, code), (m) => (m.type === M.ANNOUNCE_NUMBER ? ((options = m.options.map(Number)), undefined) : undefined), look], { lp, format });
    return options;
  };
  const wall = (format) => amounts(WALL_OF_REVEALING_LIGHT, 3000, [{ szone: [WALL_OF_REVEALING_LIGHT] }, {}], format);
  assert.deepEqual(wall(edison), [1000, 2000]);
  assert.deepEqual(wall(withoutInit), [1000, 2000, 3000], "the card's own list reaches all your Life Points");
  const star = (format) => amounts(STAR_BLAST, 1000, [{ hand: [STAR_BLAST, GEMINI] }, {}], format);
  assert.deepEqual(star(edison), [500]);
  assert.deepEqual(star(withoutInit), [500, 1000]);
});

test("RD rule 11: without the format-wide rule in init.lua the engine let Super Rejuvenation chain to the discard's trigger and Peten activate", () => {
  const wsDiscard = (format) => game([{ hand: [WHITE_STONE, SUPER_REJUVENATION, ELF, ELF, ELF, ELF], szone: [MST], deck: [ELF, BLUE_EYES] }, {}],
    [(m, d) => (d.phase === PH.END && m.type === M.SELECT_CARD && m.player === 0 ? act.pick(m, WHITE_STONE) : undefined), until((m, d) => d.turn > 1)], { lastTurn: 2, format })
    .windows.some((w) => w.phase === PH.END && w.chain.includes(WHITE_STONE) && offers(w, SUPER_REJUVENATION));
  assert.deepEqual([wsDiscard(edison), wsDiscard(withoutInit)], [false, true]);
  const peten = (format) => chained(game([{ hand: [PETEN, ELF, ELF, ELF, ELF, ELF], deck: [ELF, PETEN] }, {}],
    [(m, d) => (d.phase === PH.END && m.type === M.SELECT_CARD && m.player === 0 ? act.pick(m, PETEN) : undefined), until((m, d) => d.turn > 1)], { lastTurn: 2, format }), PETEN);
  assert.deepEqual([peten(edison), peten(withoutInit)], [0, 1]);
});

test("RD rule 10: Bark of Dark Ruler and Attack of the Cornered Rat, in the Damage Step, offer only amounts below your Life Points", () => {
  const INFERNITY_ARCHFIEND = 99177923, SKULL_SERVANT = 32274490, BARK = 41925941, RAT = 84389640;
  const amounts = (attacker, card, position, format) => {
    let options = null;
    const d = game([{ mzone: [GEMINI] }, { mzone: [attacker], szone: [{ code: card, position }] }],
      attackSteps(attacker, GEMINI, (m) => (m.player === 1 && m.type === M.SELECT_CHAIN ? act.chain(m, card) : undefined), maybe(pick(GEMINI)), (m) => (m.type === M.ANNOUNCE_NUMBER ? ((options = m.options.map(Number)), undefined) : undefined)), { lastTurn: 2, lp: 300, format });
    assert.deepEqual(d.errors, []);
    return options;
  };
  assert.deepEqual(amounts(INFERNITY_ARCHFIEND, BARK, P.FACEDOWN, edison), [100, 200]);
  assert.deepEqual(amounts(INFERNITY_ARCHFIEND, BARK, P.FACEDOWN, withoutInit), [100, 200, 300]);
  assert.deepEqual(amounts(SKULL_SERVANT, RAT, P.FACEUP, edison), [100, 200]);
  assert.deepEqual(amounts(SKULL_SERVANT, RAT, P.FACEUP, withoutInit), [100, 200, 300]);
});

test("P example 3 / S: a Summon that triggers an optional effect in the hand (Alien Dog) gives no Ignition Effect priority, whether the trigger is used or declined", () => {
  const SHOCKTROOPER = 97127906, ALIEN_DOG = 15475415;
  const sides = [{ hand: [SHOCKTROOPER, ALIEN_DOG], grave: [MALICIOUS], deck: [ELF, MALICIOUS] }, { mzone: [ELF], szone: [TORRENTIAL] }];
  const declined = game(sides, [summon(SHOCKTROOPER), decline, look]);
  const dw = chainWindows(declined).filter((w) => w.phase === PH.MAIN1);
  assert.ok(declined.windows.some((w) => w.type === M.SELECT_EFFECTYN && w.m.code === ALIEN_DOG), "the turn player is asked only whether to use Alien Dog");
  assert.ok(dw.every((w) => !offers(w, MALICIOUS)), "never Malicious in that response timing");
  assert.ok(dw.some((w) => w.player === 1 && offers(w, TORRENTIAL)), "the opponent may respond with Torrential Tribute");
  const used = game(sides, [summon(SHOCKTROOPER), yes, look]);
  assert.ok(has(used, 0, "mzone", ALIEN_DOG));
  assert.ok(chainWindows(used).filter((w) => w.phase === PH.MAIN1).every((w) => !offers(w, MALICIOUS)), "no Ignition Effect after Alien Dog's chain either");
});

test("MT 'When... [do this]' example 3: Ultimate Offering resolving as Chain Link 2 Tribute Summons Caius: no Summon negation or response timing, and Caius's mandatory effect starts a new chain", () => {
  const r = game([{ hand: [CAIUS], mzone: [GEMINI], szone: [{ code: ULTIMATE_OFFERING, position: P.FACEUP }, MST] }, { mzone: [ELF], szone: [SOLEMN, TORRENTIAL, DUST_TORNADO] }],
    [activate(MST), pick(DUST_TORNADO), by(0, chain(ULTIMATE_OFFERING)), (m) => (m.type === M.SELECT_CARD && m.player === 0 && m.selects.some((c) => c.code === CAIUS) ? act.pick(m, CAIUS) : undefined), maybe(pick(GEMINI)), (m) => (m.type === M.SELECT_CARD && m.player === 0 ? act.pick(m, ELF) : undefined), look]);
  assert.ok(has(r, 0, "mzone", CAIUS), "Caius was Summoned");
  assert.ok(index(r, M.SUMMONING, CAIUS) < index(r, M.CHAIN_END), "while Ultimate Offering resolved");
  assert.ok(r.windows.filter((w) => w.n > r.windows.findIndex((x) => x.chain.length === 2)).every((w) => !offers(w, SOLEMN) && !offers(w, TORRENTIAL)), "neither Solemn Judgment nor Torrential Tribute is offered once Ultimate Offering is chained");
  assert.deepEqual(chains(r)[1], [CAIUS], "Caius's effect is a new chain");
});

// Card rulings (Forbidden Chalice vs Lonefire Blossom; Skill Drain) say a negated monster's Ignition Effect can still be
// activated: the cost is paid and the effect resolves negated. No general rules page states it either way.
test("a face-up monster whose effects are negated can still activate its Ignition Effect: the cost is paid and the effect does nothing (Skill Drain, Forbidden Chalice)", () => {
  const SKILL_DRAIN = 82732705, LONEFIRE = 48686504, CHALICE = 25789292;
  const drained = game([{ mzone: [CHAOS_SORCERER] }, { mzone: [ELF], szone: [{ code: SKILL_DRAIN, position: P.FACEUP }] }], [activate(CHAOS_SORCERER), maybe(pick(ELF)), look]);
  assert.equal(chained(drained, CHAOS_SORCERER), 1, "Chaos Sorcerer's effect is activated under Skill Drain");
  assert.ok(has(drained, 1, "mzone", ELF), "and resolves negated: nothing is removed");
  const chalice = game([{ mzone: [LONEFIRE], hand: [CHALICE], deck: [ELF, LONEFIRE] }, {}], [activate(CHALICE), pick(LONEFIRE), activate(LONEFIRE), maybe(pick(LONEFIRE)), look]);
  assert.equal(chained(chalice, LONEFIRE), 1);
  assert.deepEqual({ grave: has(chalice, 0, "grave", LONEFIRE), field: pile(chalice, 0, "mzone").includes(LONEFIRE) }, { grave: true, field: false }, "Tributed itself; no Plant was Summoned");
});

test("a Gemini monster Gemini Summoned and then negated (Skill Drain) can still activate its Ignition Effect (Blazewing Butterfly)", () => {
  const BLAZEWING = 16984449, SKILL_DRAIN = 82732705;
  const offered = (format) => {
    const r = game([{ mzone: [BLAZEWING], grave: [83269557] }, { szone: [SKILL_DRAIN] }],
      [summon(BLAZEWING), (m, d) => (m.player === 1 && m.type === M.SELECT_CHAIN && !d.chain.length ? act.chain(m, SKILL_DRAIN) : undefined), look], { format });
    assert.ok(has(r, 1, "szone", SKILL_DRAIN) && chained(r, SKILL_DRAIN) === 1, "Skill Drain was activated after the Gemini Summon");
    return offers(r.windows.at(-1), BLAZEWING);
  };
  assert.deepEqual({ edison: offered(edison), withoutInit: offered(withoutInit) }, { edison: true, withoutInit: false });
});

// Honest's ruling (Individual Card Rulings F-H): "This effect can activate in ... Substep 4 - Damage Calculation"; the test the
// F-H card audit left as todo (../edison-sim-audit-fh/test/edison-rulings-fh.test.mjs), played here.
test("BP substep 4: a monster's ATK-changing Quick Effect can be used during damage calculation: Honest chained to Kuriboh", () => {
  const KURIBOH = 40640057, VORSE = 14898066;
  const play = (format) => {
    const mine = (code) => (m) => (m.type === M.SELECT_CHAIN && m.player === 0 ? act.chain(m, code) : undefined);
    const r = game([{ mzone: [ELF], hand: [HONEST, KURIBOH] }, { mzone: [VORSE] }], attackSteps(VORSE, ELF, mine(KURIBOH), mine(HONEST)), { lastTurn: 2, format });
    const ds = r.windows.find((w) => w.chain.includes(KURIBOH) && w.player === 0);
    return { kuribohAt: ds?.hint, honest: chained(r, HONEST), vorse: has(r, 1, "grave", VORSE) };
  };
  assert.deepEqual(play(edison), { kuribohAt: 42, honest: 1, vorse: true });
  assert.deepEqual(play(withoutInit), { kuribohAt: 42, honest: 0, vorse: false });
});

test("BP substep 4: Shrink, a Spell, still cannot be chained during damage calculation", () => {
  const KURIBOH = 40640057, VORSE = 14898066;
  const r = game([{ mzone: [ELF], hand: [KURIBOH] }, { mzone: [VORSE], szone: [SHRINK] }],
    attackSteps(VORSE, ELF, (m) => (m.type === M.SELECT_CHAIN && m.player === 0 ? act.chain(m, KURIBOH) : undefined)), { lastTurn: 2 });
  const after = r.windows.filter((w) => w.chain.includes(KURIBOH) && w.player === 1);
  assert.ok(after.length && after.every((w) => !offers(w, SHRINK)));
});

// RD rule 12. Found by this audit: the core lets the Summon happen and then stops the loop at an arbitrary point (X-Head Cannon
// left at 1800 ATK beside Luminous Spark, Pole Position still on the field), so neither the "voluntary" rule (the action is
// illegal) nor the "involuntary" one (Pole Position destroyed by game mechanics) is played. It would need loop detection in
// the core: try the action, see whether Pole Position's adjustment repeats, and refuse it.
test("RD rule 12, example 1: a voluntary action that would start an infinite loop is illegal: X-Head Cannon cannot be Summoned beside Gemini Elf, Luminous Spark and Pole Position", { todo: "the core allows the Summon and settles the loop at an arbitrary state" }, () => {
  const POLE = 73578229, SPARK = 81777047, XHEAD = 62651957;
  let offered = null;
  game([{ mzone: [GEMINI], szone: [{ code: SPARK, position: P.FACEUP }, { code: POLE, position: P.FACEUP }] }, { hand: [XHEAD] }],
    [turn(2), (m) => (idle(m) ? ((offered = m.summons.some((c) => c.code === XHEAD)), "stop") : undefined)], { lastTurn: 2 });
  assert.equal(offered, false);
});

// =====================================================================================================================
// The rulebook (RB), the basics a 2010 duel is built on
// =====================================================================================================================
const AXE_OF_DESPAIR = 40619825, SCAPEGOAT = 73915051, SHEEP_TOKEN = 73915052, REINFORCEMENT = 32807846, SEVEN_TOOLS = 3819470, DARK_HOLE = 53129443;
const firstIdle = (r, turn = 1) => r.windows.find((w) => w.type === M.SELECT_IDLECMD && w.turn === turn);

test("RB p.16, p.29: one Normal Summon or Set a turn; Level 5-6 need 1 Tribute and 7+ need 2; a Normal Summon is face-up Attack, a Set face-down Defense", () => {
  const offered = (mzone) => firstIdle(game([{ hand: [SKULL, BLUE_EYES], mzone }, {}], [look])).summons;
  assert.deepEqual(offered([]).filter((c) => c !== ELF), [], "no Tribute: neither");
  assert.deepEqual(offered([ELF]).filter((c) => c !== ELF), [SKULL], "one Tribute: Summoned Skull only");
  assert.deepEqual(offered([ELF, ELF]).filter((c) => c !== ELF).sort(), [SKULL, BLUE_EYES].sort(), "two: both");
  const summoned = game([{ hand: [GEMINI, ELF] }, {}], [summon(GEMINI), look]);
  assert.equal(summoned.players[0].mzone.find((c) => c?.code === GEMINI).position, P.FACEUP_ATTACK);
  assert.deepEqual({ summons: summoned.windows.at(-1).summons, sets: summoned.windows.at(-1).m.monster_sets }, { summons: [], sets: [] }, "nothing more this turn");
  const setOne = game([{ hand: [GEMINI, ELF] }, {}], [set(GEMINI), look]);
  assert.equal(setOne.players[0].mzone.find((c) => c?.code === GEMINI).position, P.FACEDOWN_DEFENSE);
  assert.deepEqual({ summons: setOne.windows.at(-1).summons, sets: setOne.windows.at(-1).m.monster_sets }, { summons: [], sets: [] });
});

test("RB p.17: a monster cannot be Flip Summoned the turn it was Set; a Flip Summon is to face-up Attack Position", () => {
  const r = game([{ hand: [GEMINI] }, {}], [set(GEMINI), (m) => (idle(m) ? ((m.pos_changes.some((c) => c.code === GEMINI) ? assert.fail("Flip Summon offered the turn it was Set") : null), "stop") : undefined)]);
  assert.ok(r.done >= 1);
  const flip = game([{ mzone: [{ code: GEMINI, position: P.FACEDOWN_DEFENSE }] }, {}], [flipSummon(GEMINI), look]);
  assert.equal(flip.players[0].mzone.find((c) => c?.code === GEMINI).position, P.FACEUP_ATTACK);
});

test("RB p.17: a monster Special Summoned by an effect is put in your choice of face-up Attack or face-up Defense Position", () => {
  let positions = null;
  game([{ hand: [MONSTER_REBORN], grave: [GEMINI] }, {}], [activate(MONSTER_REBORN), pick(GEMINI), (m) => (m.type === M.SELECT_POSITION ? ((positions = m.positions), undefined) : undefined), look]);
  assert.equal(Number(positions), P.FACEUP_ATTACK | P.FACEUP_DEFENSE);
});

test("RB p.29: a monster cannot change its battle position the turn it was Summoned, more than once a turn, or in Main Phase 2 after it attacked", () => {
  const summoned = game([{ hand: [GEMINI] }, {}], [summon(GEMINI), look]);
  assert.ok(!summoned.windows.at(-1).m.pos_changes.some((c) => c.code === GEMINI), "Summoned this turn");
  const once = game([{ mzone: [GEMINI] }, {}], [flipSummon(GEMINI), look]);
  assert.equal(once.players[0].mzone[0].position, P.FACEUP_DEFENSE, "changed once");
  assert.ok(!once.windows.at(-1).m.pos_changes.some((c) => c.code === GEMINI), "not twice");
  const attacked = game([{}, { mzone: [GEMINI] }], [turn(2), toBattle, attack(GEMINI), (m, d) => (idle(m) && d.phase === PH.MAIN2 ? "stop" : undefined)], { lastTurn: 2 });
  const m2 = attacked.windows.at(-1);
  assert.equal(m2.phase, PH.MAIN2);
  assert.ok(!m2.m.pos_changes.some((c) => c.code === GEMINI));
});

test("RB p.31: the first player cannot conduct a Battle Phase on the first turn; each Attack Position monster attacks once; Defense Position monsters cannot attack", () => {
  const t1 = firstIdle(game([{ mzone: [GEMINI] }, {}], [look]));
  assert.ok(!t1.m.to_bp);
  const r = game([{}, { mzone: [GEMINI, { code: SKULL, position: P.FACEUP_DEFENSE }] }], [turn(2), toBattle, attack(GEMINI), until(battleOver)], { lastTurn: 2 });
  const battles = r.windows.filter((w) => w.turn === 2 && w.type === M.SELECT_BATTLECMD);
  assert.deepEqual(battles[0].attacks, [GEMINI], "the Defense Position Summoned Skull cannot attack");
  assert.deepEqual(battles.at(-1).attacks, [], "Gemini Elf has attacked");
  assert.equal(r.lp[0], 8000 - 1900);
});

test("RB p.35-36: battle damage: ATK vs ATK win, tie, lose; ATK vs DEF win, tie, lose; a face-down monster attacked is flipped to face-up Defense Position", () => {
  const fight = (attacker, defender) => {
    const r = game([{ mzone: [defender] }, { mzone: [attacker] }], attackSteps(typeof attacker === "number" ? attacker : attacker.code, typeof defender === "number" ? defender : defender.code), { lastTurn: 2 });
    return { lp: r.lp, attacker: r.players[1].mzone.filter(Boolean).length, defender: r.players[0].mzone.filter(Boolean).map((c) => c.position) };
  };
  assert.deepEqual(fight(GEMINI, ELF), { lp: [8000 - 1100, 8000], attacker: 1, defender: [] }, "1900 vs 800 ATK");
  assert.deepEqual(fight(GEMINI, GEMINI), { lp: [8000, 8000], attacker: 0, defender: [] }, "tie: both destroyed, no damage");
  assert.deepEqual(fight(ELF, GEMINI), { lp: [8000, 8000 - 1100], attacker: 0, defender: [P.FACEUP_ATTACK] }, "800 vs 1900 ATK");
  assert.deepEqual(fight(SKULL, { code: ELF, position: P.FACEUP_DEFENSE }), { lp: [8000, 8000], attacker: 1, defender: [] }, "2500 vs 2000 DEF: destroyed, no damage");
  assert.deepEqual(fight(GEMINI, { code: COMMAND_KNIGHT, position: P.FACEUP_DEFENSE }), { lp: [8000, 8000], attacker: 1, defender: [P.FACEUP_DEFENSE] }, "1900 vs 1900 DEF: nothing");
  assert.deepEqual(fight(GEMINI, { code: ELF, position: P.FACEDOWN_DEFENSE }), { lp: [8000, 8000 - 100], attacker: 1, defender: [P.FACEUP_DEFENSE] }, "1900 vs 2000 DEF: the attacker's controller takes 100; the Elf was flipped face-up");
});

test("RB p.11, p.14: a face-down monster's effect cannot be used; an Ignition Effect only in its controller's Main Phase", () => {
  const down = firstIdle(game([{ mzone: [{ code: EXILED_FORCE, position: P.FACEDOWN_DEFENSE }] }, { mzone: [ELF] }], [look]));
  assert.ok(!offers(down, EXILED_FORCE));
  const r = game([{ mzone: [EXILED_FORCE] }, { mzone: [ELF] }], [turn(2), toBattle, attack(ELF), until(battleOver)], { lastTurn: 2 });
  assert.ok(r.windows.filter((w) => w.turn === 2 || w.phase !== PH.MAIN1 && w.phase !== PH.MAIN2).every((w) => !offers(w, EXILED_FORCE)), "not in the Draw, Standby, Battle or End Phase, nor in the opponent's turn");
});

test("RB p.46: Tokens destroyed leave the field and go nowhere", () => {
  const r = game([{ hand: [SCAPEGOAT, DARK_HOLE] }, {}], [activate(SCAPEGOAT), activate(DARK_HOLE), look]);
  assert.ok(r.seen.some((e) => e.type === M.MOVE && e.card === SHEEP_TOKEN), "the tokens were there");
  assert.deepEqual([pile(r, 0, "mzone"), pile(r, 0, "grave").filter((c) => c === SHEEP_TOKEN)], [[], []]);
});

test("RB p.25, p.51: an Equip Card is destroyed when the equipped monster is flipped face-down", () => {
  const r = game([{ mzone: [GEMINI], hand: [AXE_OF_DESPAIR, BOOK_OF_MOON] }, {}], [activate(AXE_OF_DESPAIR), pick(GEMINI), activate(BOOK_OF_MOON), pick(GEMINI), decline, look]);
  assert.ok(r.seen.some((e) => e.type === M.MOVE && e.card === AXE_OF_DESPAIR && e.from.location === L.SZONE && e.to.location === L.GRAVE), "Axe of Despair went to the Graveyard");
});

test("RB p.48: an effect that searches the Deck cannot be activated with nothing in the Deck to find (Reinforcement of the Army)", () => {
  assert.ok(!offers(firstIdle(game([{ hand: [REINFORCEMENT] }, {}], [look])), REINFORCEMENT), "Mystical Elf, the rest of the Deck, is no Warrior");
  assert.ok(offers(firstIdle(game([{ hand: [REINFORCEMENT], deck: [ELF, EXILED_FORCE] }, {}], [look])), REINFORCEMENT));
});

test("RB p.25: Field Spells do not count toward the 5 Spell & Trap Zones: one can be activated with all 5 full", () => {
  assert.ok(offers(firstIdle(game([{ hand: [UMI], szone: [MST, MST, MST, MST, MST] }, {}], [look])), UMI));
});

test("RB p.43-44, Spell Speeds: Heavy Storm, Threatening Roar chained, Seven Tools of the Bandit chained to that; only a Counter Trap can respond to Seven Tools; Seven Tools resolves first", () => {
  const r = game([{ hand: [HEAVY_STORM], szone: [SEVEN_TOOLS, DUST_TORNADO] }, { szone: [THREATENING_ROAR, DUST_TORNADO, SOLEMN] }],
    [activate(HEAVY_STORM), by(1, chain(THREATENING_ROAR)), by(0, chain(SEVEN_TOOLS)), look]);
  assert.deepEqual(chains(r)[0], [HEAVY_STORM, THREATENING_ROAR, SEVEN_TOOLS]);
  const atCl3 = r.windows.filter((w) => w.chain.length === 3 && w.type === M.SELECT_CHAIN);
  assert.ok(atCl3.length && atCl3.every((w) => !offers(w, DUST_TORNADO)), "no Spell Speed 2 card after a Counter Trap");
  assert.ok(atCl3.some((w) => w.player === 1 && offers(w, SOLEMN)), "a Counter Trap still can");
  assert.ok(r.seen.some((e) => e.type === M.CHAIN_NEGATED), "Threatening Roar was negated");
  assert.equal(r.lp[0], 7000);
  assert.deepEqual([pile(r, 0, "szone"), pile(r, 1, "szone")], [[], []], "Heavy Storm resolved");
});
