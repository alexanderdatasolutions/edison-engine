// Edison rulings that needed a change to the core itself (vendor/ocgcore/patches), or that were checked against it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scenario, run, act, edison, M } from "./scenario.js";

const upstream = { ...edison, duelFlags: edison.duelFlags.filter((f) => !f.startsWith("EDISON_")) };

// Rule 10, https://www.edisonformat.com/edison-rule-differences.html : "you cannot pay costs if doing so would reduce your Life Points to 0".
test("rule 10: a Life Point cost equal to your Life Points cannot be paid", () => {
  const TOON_WORLD = 15259703; // "Pay 1000 Life Points to activate this card."
  const canActivate = (lp, format) => {
    const d = scenario([{ hand: [TOON_WORLD] }, {}], { ...format, startingLP: lp });
    let offered;
    run(d, (m) => { if (m.type !== M.SELECT_IDLECMD) return; offered = act.activate(m, TOON_WORLD) !== undefined; return "stop"; });
    d.destroy();
    return offered;
  };
  assert.equal(canActivate(1000, edison), false);
  assert.equal(canActivate(1001, edison), true);
  assert.equal(canActivate(1000, upstream), true, "upstream's rule: you may pay your last Life Points");
});

// https://www.edisonformat.com/battle-phase.html , Battle Step: "ONLY ONE CHAIN may be built in response to an attack declaration",
// then "multiple chains built with Spell Speed 2 or higher cards (that do not activate in response to an attack declaration)".
// The unpatched core already plays this, so there is no flag for it.
test("attack declaration: only the first chain can hold a card that responds to the attack; later chains are free-chain only", () => {
  const JAR_OF_GREED = 83968380, SAKURETSU = 56120475, GEMINI_ELF = 69140098;
  for (const format of [edison, upstream]) {
    const d = scenario([{ szone: [JAR_OF_GREED, SAKURETSU, JAR_OF_GREED] }, { mzone: [GEMINI_ELF] }], format);
    let attacked = false, jars = 0;
    const windows = []; // what the defender was offered each time no chain was open, after the attack
    const seen = run(d, (m) => {
      if (d.turn === 3) return "stop";
      if (d.turn !== 2) return;
      if (m.player === 1) { const r = act.toBattle(m) ?? act.attack(m, GEMINI_ELF); if (r && m.type === M.SELECT_BATTLECMD) attacked = true; return r; }
      if (!attacked || m.type !== M.SELECT_CHAIN || d.chain.length || !m.selects.length) return;
      windows.push(m.selects.map((c) => c.code).sort());
      if (jars < 2) { jars++; return act.chain(m, JAR_OF_GREED); }
    });
    d.destroy();
    assert.deepEqual(windows.slice(0, 2), [[SAKURETSU, JAR_OF_GREED, JAR_OF_GREED], [JAR_OF_GREED]], "Sakuretsu Armor is gone after the first chain; the second Jar of Greed starts a second chain");
    assert.equal(seen.filter((e) => e.type === M.CHAIN_END).length, 2);
    assert.ok(windows.every((w, i) => i === 0 || !w.includes(SAKURETSU)));
  }
});

// https://www.edisonformat.com/battle-phase.html , Damage Step: "Multiple chains may be formed during Substeps 1-3. One 'manual' chain is
// built during each of Substeps 4-7", and Substep 4 (damage calculation) is where it lists "Honest". The core has one window before damage
// calculation. EDISON_DAMAGE_STEP_CHAINS allows further chains before damage calculation whatever started the last one: Honest's
// ruling allows it in Substeps 1, 3 and 4, so a Spell or Trap may follow an Honest used before damage calculation.
test("Damage Step: Spells and Traps can start chain after chain before damage calculation, after Honest too", () => {
  const HONEST = 37742478, SHINING_ANGEL = 95956346, ELF = 15025844, RUSH = 70046172, SHRINK = 55713623;
  // Team 1's Shining Angel (1400) attacks team 0's Mystical Elf (800, Attack Position). `first` is what team 1 starts a chain with.
  const battle = (first, format = edison) => {
    const d = scenario([{ mzone: [ELF], szone: [SHRINK] }, { mzone: [SHINING_ANGEL], szone: [RUSH], hand: [HONEST] }], format);
    let attacked = false, damageStep = false, started = false, shrinkOffered = false;
    const advance = d.advance.bind(d);
    d.advance = () => { const out = advance(); for (const e of out) { if (e.type === M.DAMAGE_STEP_START) damageStep = true; if (e.type === M.DAMAGE_STEP_END) damageStep = false; } return out; };
    run(d, (m) => {
      if (d.turn === 3) return "stop";
      if (d.turn !== 2) return;
      if (!attacked && m.player === 1) { const r = act.toBattle(m) ?? act.attack(m, SHINING_ANGEL); if (r && m.type === M.SELECT_BATTLECMD) attacked = true; return r; }
      if (!damageStep || m.type !== M.SELECT_CHAIN || d.chain.length) return;
      if (m.player === 1 && !started) { started = true; return act.chain(m, first); }
      if (m.player === 0 && started && act.chain(m, SHRINK)) { shrinkOffered = true; return act.chain(m, SHRINK); }
    });
    const lp = [...d.lp];
    d.destroy();
    assert.ok(started, "team 1 started a chain in the Damage Step");
    return { shrinkOffered, lp };
  };
  // Rush Recklessly (1400+700), then Shrink in a new chain: (1400/2)+700 = 1400 against 800.
  assert.deepEqual(battle(RUSH), { shrinkOffered: true, lp: [8000 - 600, 8000] });
  // Honest (1400+800), then Shrink in a new chain: half the original ATK and Honest's gain re-applied (Honest ruling, "VS. Shrink"): 700+800 = 1500 against 800.
  assert.deepEqual(battle(HONEST), { shrinkOffered: true, lp: [8000 - 700, 8000] });
  // Upstream: one chain whatever starts it.
  const upstream = { ...edison, duelFlags: edison.duelFlags.filter((f) => !f.startsWith("EDISON_")) };
  assert.deepEqual(battle(RUSH, upstream), { shrinkOffered: false, lp: [8000 - 1300, 8000] });
});

// The package's JavaScript loader runs our wasm, so both must come from the same emscripten build settings.
test("the vendored wasm was built with the same loader the installed ocgcore-wasm carries", () => {
  const ours = readFileSync(new URL("../vendor/ocgcore/ocgcore.sync.mjs", import.meta.url));
  const theirs = readFileSync(new URL("../node_modules/ocgcore-wasm/lib/ocgcore.sync.mjs", import.meta.url));
  assert.ok(ours.equals(theirs), "vendor/ocgcore/ocgcore.sync.mjs differs from node_modules/ocgcore-wasm/lib/ocgcore.sync.mjs: rebuild (vendor/ocgcore/BUILD.md)");
});
