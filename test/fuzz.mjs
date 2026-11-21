// Plays whole duels between two random bots and reports anything the core complained about.
// Usage: node test/fuzz.mjs [duels] [firstSeed]
import { Duel } from "../lib/duel.js";
import { formats, getCard } from "../lib/data.js";
import { answer, makeRng } from "./bot.js";
import { OcgMessageType as M } from "ocgcore-wasm";

const format = formats.get("edison");
const EXTRA = 0x40 | 0x2000 | 0x800000 | 0x4000000, TOKEN = 0x4000;
const pool = format.pool.filter((id) => getCard(id) && !(getCard(id).core.type & TOKEN) && !format.limits.has(getCard(id).core.alias || id));
const mainPool = pool.filter((id) => !(getCard(id).core.type & EXTRA)), extraPool = pool.filter((id) => getCard(id).core.type & EXTRA);

export function playOne(seed, log = () => {}, check = () => {}) {
  const rnd = makeRng(seed);
  const deck = () => ({ main: Array.from({ length: 40 }, () => mainPool[Math.floor(rnd() * mainPool.length)]), extra: Array.from({ length: 15 }, () => extraPool[Math.floor(rnd() * extraPool.length)]) });
  const duel = new Duel({ format, decks: [deck(), deck()], seed: [BigInt(seed), 1n, 2n, 3n] });
  const result = { seed, prompts: 0, retries: 0, stuck: null, errors: duel.errors, turn: 0, winner: null, types: new Set() };
  let lastPrompt = null, tries = 0;
  for (; result.prompts < 20000; ) {
    const events = duel.advance();
    check(duel, events);
    if (duel.winner !== null) break;
    const m = duel.prompt;
    if (m === lastPrompt) { result.retries++; if (++tries > 200) { result.stuck = m; break; } } else { tries = 0; lastPrompt = m; result.prompts++; result.types.add(m.type); }
    const r = answer(m, rnd);
    log(m, r);
    if (!duel.respond(r)) { result.stuck = { encode: r, m }; break; }
  }
  result.turn = duel.turn; result.winner = duel.winner;
  duel.destroy();
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = Number(process.argv[2] ?? 50), first = Number(process.argv[3] ?? 1);
  const J = (x) => JSON.stringify(x, (k, v) => (typeof v === "bigint" ? v.toString() : v));
  const errs = new Map(); let ended = 0, stuck = 0, retries = 0, prompts = 0; const types = new Set(); const t0 = Date.now();
  for (let s = first; s < first + n; s++) {
    const r = playOne(s);
    prompts += r.prompts; retries += r.retries; r.types.forEach((t) => types.add(t));
    if (r.winner !== null) ended++;
    if (r.stuck) { stuck++; console.log(`seed ${s} STUCK turn ${r.turn}:`, J(r.stuck).slice(0, 600)); }
    for (const e of r.errors) { const k = e.replace(/\d{5,}/g, "N").slice(0, 160); errs.set(k, (errs.get(k) ?? []).concat(s)); }
  }
  console.log(`${n} duels in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${ended} ended, ${stuck} stuck, ${prompts} prompts, ${retries} rejected answers`);
  console.log("prompt types seen:", [...types].sort((a, b) => a - b).map((t) => M[t]).join(" "));
  for (const [k, seeds] of [...errs].sort((a, b) => b[1].length - a[1].length).slice(0, 25)) console.log(`${seeds.length}x (seed ${seeds[0]}) ${k}`);
}
