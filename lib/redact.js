// What each viewer may know of one core message. With `Duel.view()` and `Duel.promptView()` this is the only place that decides
// hidden information: a host is handed every message already redacted for each player and for spectators (see server.js).
import { OcgMessageType as M, OcgPosition as P, OcgLocation as L } from "ocgcore-wasm";

const FACEUP = P.FACEUP_ATTACK | P.FACEUP_DEFENSE;
// Messages both players may see exactly as the core wrote them.
const PUBLIC = new Set([M.NEW_TURN, M.NEW_PHASE, M.SUMMONING, M.SUMMONED, M.SPSUMMONED, M.FLIPSUMMONING, M.FLIPSUMMONED, M.CHAINING, M.CHAINED,
  M.CHAIN_SOLVING, M.CHAIN_SOLVED, M.CHAIN_END, M.CHAIN_NEGATED, M.CHAIN_DISABLED, M.ATTACK, M.BATTLE, M.ATTACK_DISABLED, M.DAMAGE_STEP_START, M.DAMAGE_STEP_END,
  M.DAMAGE, M.RECOVER, M.PAY_LPCOST, M.LPUPDATE, M.BECOME_TARGET, M.EQUIP, M.ADD_COUNTER, M.REMOVE_COUNTER, M.TOSS_COIN, M.TOSS_DICE, M.POS_CHANGE,
  M.SHUFFLE_DECK, M.SHUFFLE_HAND, M.SWAP, M.FIELD_DISABLED, M.CARD_TARGET, M.CANCEL_TARGET, M.WIN]);
const HINT_TO_PLAYER = new Set([1, 2, 3, 5]), HINT_TO_BOTH = new Set([10]);
/** The viewer that is neither player: a spectator, who is told only what both players can see. */
export const SPECTATOR = -1;

/** What `viewer` (a team, or SPECTATOR) may know of one core message, or null when it is none of their business. */
export function redact(m, viewer) {
  if (PUBLIC.has(m.type)) return m.type === M.SHUFFLE_HAND ? { type: m.type, player: m.player } : m;
  switch (m.type) {
    case M.DRAW: return m.player === viewer ? m : { ...m, drawn: m.drawn.map((c) => ({ code: c.position & FACEUP ? c.code : 0, position: c.position })) };
    case M.SET: return m.controller === viewer ? m : { ...m, code: 0 };
    case M.SPSUMMONING: return m.controller === viewer || (m.position & FACEUP) ? m : { ...m, code: 0 };
    case M.MOVE: {
      const open = m.to.location === L.GRAVE || ((m.to.position & FACEUP) && m.to.location !== L.HAND && m.to.location !== L.DECK && m.to.location !== L.EXTRA)
        || ((m.from.position & FACEUP) && (m.from.location & (L.MZONE | L.SZONE | L.GRAVE | L.REMOVED)));
      const mine = (m.to.controller === viewer && (m.to.location & (L.HAND | L.MZONE | L.SZONE | L.EXTRA))) || (m.from.controller === viewer && (m.from.location & (L.HAND | L.MZONE | L.SZONE | L.EXTRA)));
      return open || mine ? m : { ...m, card: 0 };
    }
    case M.CONFIRM_CARDS: case M.CONFIRM_DECKTOP: case M.CONFIRM_EXTRATOP: case M.MISSED_EFFECT: return m.player === viewer ? m : null;
    case M.HINT: return HINT_TO_BOTH.has(m.hint_type) || HINT_TO_PLAYER.has(m.hint_type) === (m.player === viewer) ? m : null;
  }
  return null;
}
