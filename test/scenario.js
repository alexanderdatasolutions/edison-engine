// Sets up an exact board and walks the duel, for tests of single rulings.
import { OcgMessageType as M, OcgResponseType as R, OcgLocation as L, OcgPosition as P, SelectIdleCMDAction as I, SelectBattleCMDAction as B } from "ocgcore-wasm";
import { Duel } from "../lib/duel.js";
import { formats } from "../lib/data.js";
import { answer, makeRng } from "./bot.js";

export { M, R, L, P, I, B };
export const edison = formats.get("edison");
const FILLER = 15025844; // Mystical Elf
const ZONES = { hand: L.HAND, mzone: L.MZONE, szone: L.SZONE, grave: L.GRAVE, removed: L.REMOVED };

/**
 * A duel with no opening hands and the given cards already in place.
 * Each side: {hand, mzone, szone, grave, removed, deck, extra}; a card is a passcode or {code, position}.
 * Spell/Trap Zone cards default to face-down, everything else face-up attack. `deck` is drawn in the order listed.
 * A zone list may have holes to reach a given slot: `szone: [, , , , , {code, position: P.FACEUP}]` is the Field Zone.
 * Cards placed this way count as having been there before turn 1; team 0 takes turn 1, and nobody can attack until turn 2.
 */
export function scenario(sides, format = edison) {
  const place = [];
  const decks = sides.map((side, team) => {
    for (const [zone, location] of Object.entries(ZONES)) {
      (side[zone] ?? []).forEach((c, sequence) => {
        const card = typeof c === "number" ? { code: c } : c;
        place.push({ team, code: card.code, location, sequence, position: card.position ?? (zone === "szone" ? P.FACEDOWN : P.FACEUP_ATTACK) });
      });
    }
    return { main: [...(side.deck ?? []), ...Array(12).fill(FILLER)], extra: side.extra ?? [] };
  });
  return new Duel({ format: { ...format, startingHand: 0 }, decks, shuffle: false, place });
}

/**
 * Runs the duel, asking `decide(prompt, duel)` at every prompt. It returns an answer, "stop", or nothing,
 * in which case the quiet default applies: pass on chains, end the phase, say yes, pick the first legal thing.
 * Returns every core message seen, in order.
 */
export function run(duel, decide, maxPrompts = 300) {
  const seen = [], rnd = makeRng(1);
  for (let i = 0; i < maxPrompts; i++) {
    seen.push(...duel.advance());
    if (duel.winner !== null) return seen;
    const m = duel.prompt;
    const r = decide(m, duel);
    if (r === "stop") return seen;
    if (!duel.respond(r ?? quiet(m, rnd))) throw new Error("answer could not be encoded");
  }
  throw new Error("scenario did not finish");
}

function quiet(m, rnd) {
  switch (m.type) {
    case M.SELECT_CHAIN: return { type: R.SELECT_CHAIN, index: m.forced ? 0 : null };
    case M.SELECT_IDLECMD: return { type: R.SELECT_IDLECMD, action: I.TO_EP, index: null };
    case M.SELECT_BATTLECMD: return { type: R.SELECT_BATTLECMD, action: m.to_m2 ? B.TO_M2 : B.TO_EP, index: null };
    case M.SELECT_EFFECTYN: return { type: R.SELECT_EFFECTYN, yes: true };
    case M.SELECT_YESNO: return { type: R.SELECT_YESNO, yes: true };
    case M.SELECT_POSITION: return { type: R.SELECT_POSITION, position: m.positions & P.FACEUP_ATTACK ? P.FACEUP_ATTACK : Number(BigInt(m.positions) & -BigInt(m.positions)) };
    case M.SELECT_CARD: return { type: R.SELECT_CARD, indicies: m.selects.slice(0, m.min).map((_, i) => i) };
    case M.SELECT_TRIBUTE: return { type: R.SELECT_TRIBUTE, indicies: m.selects.slice(0, m.min).map((_, i) => i) };
  }
  return answer(m, rnd);
}

// Answers by card, for use inside `decide`. Each returns undefined when the prompt does not offer it.
const at = (list, code) => { const i = list.findIndex((c) => c.code === code); return i < 0 ? undefined : i; };
const when = (i, make) => (i === undefined ? undefined : make(i));
export const act = {
  summon: (m, code) => m.type === M.SELECT_IDLECMD ? when(at(m.summons, code), (index) => ({ type: R.SELECT_IDLECMD, action: I.SELECT_SUMMON, index })) : undefined,
  special: (m, code) => m.type === M.SELECT_IDLECMD ? when(at(m.special_summons, code), (index) => ({ type: R.SELECT_IDLECMD, action: I.SELECT_SPECIAL_SUMMON, index })) : undefined,
  setSpell: (m, code) => m.type === M.SELECT_IDLECMD ? when(at(m.spell_sets, code), (index) => ({ type: R.SELECT_IDLECMD, action: I.SELECT_SPELL_SET, index })) : undefined,
  activate: (m, code) => m.type === M.SELECT_IDLECMD ? when(at(m.activates, code), (index) => ({ type: R.SELECT_IDLECMD, action: I.SELECT_ACTIVATE, index }))
    : m.type === M.SELECT_BATTLECMD ? when(at(m.chains, code), (index) => ({ type: R.SELECT_BATTLECMD, action: B.SELECT_CHAIN, index })) : undefined,
  chain: (m, code) => m.type === M.SELECT_CHAIN ? when(at(m.selects, code), (index) => ({ type: R.SELECT_CHAIN, index })) : undefined,
  toBattle: (m) => m.type === M.SELECT_IDLECMD && m.to_bp ? { type: R.SELECT_IDLECMD, action: I.TO_BP, index: null } : undefined,
  attack: (m, code) => m.type === M.SELECT_BATTLECMD ? when(at(m.attacks, code), (index) => ({ type: R.SELECT_BATTLECMD, action: B.SELECT_BATTLE, index })) : undefined,
  pick: (m, ...codes) => m.type === M.SELECT_CARD && codes.every((c) => at(m.selects, c) !== undefined) ? { type: R.SELECT_CARD, indicies: codes.map((c) => at(m.selects, c)) } : undefined,
};
