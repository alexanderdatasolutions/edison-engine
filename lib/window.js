// What a response window is about, kept from the core's messages as they come (`Duel.track` calls this for every message, so a duel
// rebuilt from its record by a replay, a restart or a judge's rewind has the same). All of it is public: both players see these
// messages. A host uses it to decide which questions to put to a player (edison-sim's stops).
import { OcgMessageType as M } from "ocgcore-wasm";

export const newWindow = () => ({ turns: 0, chains: 0, links: [], summoning: null, step: null, damage: false, calcDone: false });

export function trackWindow(w, m) {
  switch (m.type) {
    case M.NEW_TURN: w.turns++; w.summoning = null; break;
    case M.NEW_PHASE: w.step = m.phase === 8 ? "bpstart" : null; w.damage = false; w.summoning = null; break;
    case M.SUMMONING: w.summoning = { player: m.controller, kind: "summon" }; break;
    case M.FLIPSUMMONING: w.summoning = { player: m.controller, kind: "summon" }; break;
    case M.SPSUMMONING: w.summoning = { player: m.controller, kind: "special" }; break;
    case M.SUMMONED: case M.SPSUMMONED: case M.FLIPSUMMONED: w.summoning = null; break;
    case M.CHAINING: w.links.push([false, false]); w.summoning = null; break;
    case M.BECOME_TARGET: { const top = w.links.at(-1); if (top) for (const c of m.cards) if (c.controller === 0 || c.controller === 1) top[c.controller] = true; break; }
    case M.CHAIN_SOLVED: w.links.pop(); break;
    case M.CHAIN_END: w.links = []; w.chains++; break;
    case M.ATTACK: w.step = "battle"; break;
    case M.DAMAGE_STEP_START: w.damage = true; w.calcDone = false; break;
    case M.BATTLE: case M.DAMAGE: if (w.damage) w.calcDone = true; break; // a direct attack has no BATTLE message, only its damage
    case M.DAMAGE_STEP_END: w.damage = false; break;
  }
}
