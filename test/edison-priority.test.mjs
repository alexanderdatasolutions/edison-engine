// Edison "Ignition Effect Priority": https://www.edisonformat.com/priority.html
// The turn player may activate an Ignition Effect as Chain Link 1 in the response timing of their own Summon,
// when that Summon triggered nothing; never after a chain resolves, and not after declining the Summon's optional trigger.
import test from "node:test";
import assert from "node:assert/strict";
import { scenario, run, act, edison, M, R, I } from "./scenario.js";

const format = edison; // its duelFlags include EDISON_IGNITION_PRIORITY
const upstream = { ...edison, duelFlags: edison.duelFlags.filter((f) => !f.startsWith("EDISON_")) };
const EXILED_FORCE = 74131780, MALICIOUS = 9411399, GREPHER = 14536035, FOOLISH = 81439173, ARMAGEDDON_KNIGHT = 28985331;
const CROW = 24508238, TORRENTIAL = 53582587, ELF = 15025844, DEMISE = 72426662, END_OF_THE_WORLD = 8198712, BLUE_EYES = 89631139;

/**
 * Plays turn 1 (team 0's). `turnPlayer(m, n)` answers team 0's prompts; n counts its Main Phase menus.
 * Returns the chain windows that offered something between the first Main Phase action and the return to the open
 * Main Phase, in order: {player, codes, grave: team 0's Graveyard at that moment}; and the events.
 * Team 0 draws for turn first, so every `deck` starts with a card that does not matter.
 */
function play(sides, turnPlayer, opponent = () => undefined, fmt = format) {
  const d = scenario(sides, fmt);
  const windows = [];
  let menus = 0;
  const events = run(d, (m) => {
    if (d.turn > 1) return "stop";
    if (m.type === M.SELECT_CHAIN && menus === 1 && m.selects.length) windows.push({ player: m.player, codes: m.selects.map((c) => c.code), grave: d.view(0).players[0].grave.map((c) => c.code) });
    if (m.type === M.SELECT_IDLECMD) menus++;
    return m.player === 0 ? turnPlayer(m, menus, windows) : opponent(m, windows);
  });
  d.destroy();
  return { windows, events, menus };
}
const offered = (w, code) => w.codes.includes(code);
const specialSummon = (m, code) => { const index = m.special_summons?.findIndex((c) => c.code === code) ?? -1; return index < 0 ? undefined : { type: R.SELECT_IDLECMD, action: I.SELECT_SPECIAL_SUMMON, index }; };
const chained = (events) => events.filter((e) => e.type === M.CHAINING).map((e) => e.code);

test("after a Normal Summon the turn player is offered a monster's Ignition Effect before the opponent can respond", () => {
  const { windows } = play([{ hand: [EXILED_FORCE] }, { mzone: [ELF], szone: [TORRENTIAL] }], (m, n) => (n === 1 ? act.summon(m, EXILED_FORCE) : undefined));
  assert.deepEqual({ player: windows[0].player, exiled: offered(windows[0], EXILED_FORCE) }, { player: 0, exiled: true });
  assert.ok(windows.some((w) => w.player === 1 && offered(w, TORRENTIAL)), "the opponent's Torrential Tribute window comes after");
});

test("after a Special Summon, Destiny HERO - Malicious in the Graveyard can be activated before D.D. Crow (priority page, example 1)", () => {
  const { windows, events } = play(
    [{ hand: [GREPHER, MALICIOUS], deck: [ELF, MALICIOUS] }, { hand: [CROW] }],
    (m) => specialSummon(m, GREPHER) ?? act.chain(m, MALICIOUS),
    (m) => act.chain(m, CROW));
  assert.deepEqual({ player: windows[0].player, malicious: offered(windows[0], MALICIOUS) }, { player: 0, malicious: true });
  assert.equal(chained(events)[0], MALICIOUS, "Malicious is Chain Link 1");
  assert.ok(events.some((e) => e.type === M.SPSUMMONING && e.code === MALICIOUS), "the second Malicious is Summoned: its cost was paid before D.D. Crow could target it");
});

test("after a Ritual Summon that triggers nothing, any Ignition Effect is offered before the opponent can respond (example 2)", () => {
  const { windows } = play(
    [{ hand: [END_OF_THE_WORLD, DEMISE, BLUE_EYES], grave: [MALICIOUS], deck: [ELF, MALICIOUS] }, { szone: [TORRENTIAL] }],
    (m, n) => (n === 1 ? act.activate(m, END_OF_THE_WORLD) : undefined));
  const after = windows.filter((w) => w.grave.includes(END_OF_THE_WORLD));
  assert.deepEqual({ player: after[0].player, demise: offered(after[0], DEMISE), malicious: offered(after[0], MALICIOUS) }, { player: 0, demise: true, malicious: true });
});

// The two "after a chain resolves" rows. Exiled Force is on the field as well, so both a field and a Graveyard Ignition Effect are at stake.
const afterChain = (name, hand, start) => test(name, () => {
  const { windows, events } = play(
    [{ hand: [hand], mzone: [EXILED_FORCE], deck: [ELF, MALICIOUS, MALICIOUS] }, { mzone: [ELF], hand: [CROW] }],
    (m, n) => (n === 1 ? start(m) : act.pick(m, MALICIOUS)),
    (m) => act.chain(m, CROW));
  const after = windows.filter((w) => w.grave.includes(MALICIOUS));
  assert.ok(after.length > 0, "Malicious reached the Graveyard and a window opened");
  for (const w of after.filter((w) => w.player === 0)) assert.deepEqual({ exiled: offered(w, EXILED_FORCE), malicious: offered(w, MALICIOUS) }, { exiled: false, malicious: false });
  assert.deepEqual({ player: after[0].player, crow: offered(after[0], CROW) }, { player: 1, crow: true }, "the first window with Malicious in the Graveyard is the opponent's D.D. Crow");
  assert.ok(chained(events).includes(CROW) && !chained(events).includes(MALICIOUS), "D.D. Crow removed Malicious before its effect could be used");
});
afterChain("after Foolish Burial resolves there is no Ignition Effect priority: D.D. Crow gets its window", FOOLISH, (m) => act.activate(m, FOOLISH));
afterChain("after Armageddon Knight's trigger resolves there is no Ignition Effect priority: D.D. Crow gets its window", ARMAGEDDON_KNIGHT, (m) => act.summon(m, ARMAGEDDON_KNIGHT));

test("declining the Summoned monster's optional trigger gives no priority: the opponent responds first (example 3)", () => {
  const sides = [{ hand: [ARMAGEDDON_KNIGHT], mzone: [EXILED_FORCE], szone: [TORRENTIAL], grave: [MALICIOUS], deck: [ELF, MALICIOUS] }, { mzone: [ELF], szone: [TORRENTIAL] }];
  const decline = (m, n) => (m.type === M.SELECT_EFFECTYN ? { type: R.SELECT_EFFECTYN, yes: false } : n === 1 ? act.summon(m, ARMAGEDDON_KNIGHT) : undefined);
  const passed = play(sides, decline);
  assert.deepEqual(passed.windows.map((w) => w.player), [1], "only the opponent gets a window; when they pass too, the response timing is over");
  assert.ok(offered(passed.windows[0], TORRENTIAL));
  assert.equal(passed.menus, 2, "the turn player is back in the open Main Phase");

  const responded = play(sides, decline, (m) => act.chain(m, TORRENTIAL));
  assert.deepEqual(responded.windows.slice(0, 2).map((w) => w.player), [1, 0], "once the opponent starts a chain, the turn player may chain to it");
  assert.ok(!offered(responded.windows[1], EXILED_FORCE) && !offered(responded.windows[1], MALICIOUS), "but not with an Ignition Effect");
});

test("with the flag off the build plays upstream's Master Rule 1: a field Ignition Effect is offered after a chain resolves", () => {
  const { windows } = play(
    [{ hand: [FOOLISH], mzone: [EXILED_FORCE], deck: [ELF, MALICIOUS, MALICIOUS] }, { mzone: [ELF], hand: [CROW] }],
    (m, n) => (n === 1 ? act.activate(m, FOOLISH) : act.pick(m, MALICIOUS)), undefined, upstream);
  const after = windows.filter((w) => w.grave.includes(MALICIOUS));
  assert.deepEqual({ player: after[0].player, exiled: offered(after[0], EXILED_FORCE), malicious: offered(after[0], MALICIOUS) }, { player: 0, exiled: true, malicious: false });
});
