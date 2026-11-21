// A player that answers every prompt with a random legal-looking choice. Used to play whole duels in tests.
import { OcgMessageType as M, OcgResponseType as R, OcgLocation as L, OcgPosition as P, SelectIdleCMDAction as I, SelectBattleCMDAction as B } from "ocgcore-wasm";

export function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function answer(m, rnd) {
  const int = (n) => Math.floor(rnd() * n);
  const pick = (a) => a[int(a.length)];
  const some = (n, min, max) => { // random distinct indices, between min and max of them
    const idx = Array.from({ length: n }, (_, i) => i).sort(() => rnd() - 0.5);
    return idx.slice(0, Math.min(n, min + int(Math.max(0, Math.min(max, n) - min) + 1)));
  };
  const bits = (mask) => { const out = []; for (let b = 1n; b <= BigInt(mask); b <<= 1n) if (BigInt(mask) & b) out.push(b); return out; };
  switch (m.type) {
    case M.SELECT_IDLECMD: {
      const options = [];
      const add = (list, action, weight) => list.forEach((_, index) => { for (let i = 0; i < weight; i++) options.push({ action, index }); });
      add(m.summons, I.SELECT_SUMMON, 4); add(m.special_summons, I.SELECT_SPECIAL_SUMMON, 4); add(m.monster_sets, I.SELECT_MONSTER_SET, 1);
      add(m.spell_sets, I.SELECT_SPELL_SET, 1); add(m.activates, I.SELECT_ACTIVATE, 3); add(m.pos_changes, I.SELECT_POS_CHANGE, 1);
      if (m.to_bp) for (let i = 0; i < 6; i++) options.push({ action: I.TO_BP, index: null });
      if (m.to_ep) for (let i = 0; i < 3; i++) options.push({ action: I.TO_EP, index: null });
      return { type: R.SELECT_IDLECMD, ...pick(options) };
    }
    case M.SELECT_BATTLECMD: {
      const options = [];
      m.attacks.forEach((_, index) => { for (let i = 0; i < 6; i++) options.push({ action: B.SELECT_BATTLE, index }); });
      m.chains.forEach((_, index) => options.push({ action: B.SELECT_CHAIN, index }));
      if (m.to_m2) options.push({ action: B.TO_M2, index: null });
      if (m.to_ep) options.push({ action: B.TO_EP, index: null });
      return { type: R.SELECT_BATTLECMD, ...pick(options) };
    }
    case M.SELECT_CHAIN: return { type: R.SELECT_CHAIN, index: m.selects.length && (m.forced || rnd() < 0.5) ? int(m.selects.length) : null };
    case M.SELECT_EFFECTYN: return { type: R.SELECT_EFFECTYN, yes: rnd() < 0.7 };
    case M.SELECT_YESNO: return { type: R.SELECT_YESNO, yes: rnd() < 0.7 };
    case M.SELECT_OPTION: return { type: R.SELECT_OPTION, index: int(m.options.length) };
    case M.SELECT_CARD: return { type: R.SELECT_CARD, indicies: some(m.selects.length, m.min, m.max) };
    case M.SELECT_TRIBUTE: return { type: R.SELECT_TRIBUTE, indicies: some(m.selects.length, m.min, m.max) };
    case M.SELECT_UNSELECT_CARD: return { type: R.SELECT_UNSELECT_CARD, index: m.select_cards.length && !(m.can_finish && rnd() < 0.3) ? int(m.select_cards.length) : null };
    case M.SELECT_PLACE: case M.SELECT_DISFIELD: {
      const free = [];
      for (let i = 0; i < 32; i++) {
        if ((m.field_mask >>> i) & 1) continue;
        const s = i % 16;
        if (s === 7 || s > 13) continue;
        free.push({ player: i < 16 ? m.player : 1 - m.player, location: s < 8 ? L.MZONE : L.SZONE, sequence: s < 8 ? s : s - 8 });
      }
      const places = free.sort(() => rnd() - 0.5).slice(0, m.count);
      return m.type === M.SELECT_PLACE ? { type: R.SELECT_PLACE, places } : { type: R.SELECT_DISFIELD, places };
    }
    case M.SELECT_POSITION: return { type: R.SELECT_POSITION, position: Number(pick(bits(m.positions))) };
    case M.SELECT_COUNTER: { // spread `count` removals over cards that have counters
      const counters = m.cards.map(() => 0);
      for (let left = m.count, guard = 0; left > 0 && guard < 1000; guard++) { const i = int(m.cards.length); if (counters[i] < m.cards[i].count) { counters[i]++; left--; } }
      return { type: R.SELECT_COUNTER, counters };
    }
    case M.SELECT_SUM: return { type: R.SELECT_SUM, indicies: some(m.selects.length, Math.max(0, m.min), Math.max(1, m.max || m.selects.length)) };
    case M.SORT_CARD: case M.SORT_CHAIN: return { type: R.SORT_CARD, order: null };
    case M.ANNOUNCE_RACE: return { type: R.ANNOUNCE_RACE, races: bits(m.available).sort(() => rnd() - 0.5).slice(0, m.count) };
    case M.ANNOUNCE_ATTRIB: return { type: R.ANNOUNCE_ATTRIB, attributes: bits(m.available).sort(() => rnd() - 0.5).slice(0, m.count).map(Number) };
    case M.ANNOUNCE_NUMBER: return { type: R.ANNOUNCE_NUMBER, value: int(m.options.length) };
    case M.ANNOUNCE_CARD: return { type: R.ANNOUNCE_CARD, card: pick([15025844, 74131780, 53582587, 83764718, 44095762, 46986414]) };
    case M.ROCK_PAPER_SCISSORS: return { type: R.ROCK_PAPER_SCISSORS, value: 1 + int(3) };
  }
  throw new Error(`bot has no answer for message type ${m.type}`);
}
