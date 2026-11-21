#!/usr/bin/env node
// The engine server: owns every duel and is the only program that touches the core. A host (edison-sim's web server) starts it as
// a child process and speaks to it over stdin/stdout, one JSON object per line each way, one reply per request, in order.
// See PROTOCOL in README.md. Hidden information is decided here: a host is handed each player's and the spectators' table, events
// and question already redacted, and the unredacted ones only under the name `judge`.
import { Duel, JUDGE, revive, engineVersion } from "./lib/duel.js";
import { formats } from "./lib/data.js";
import { redact, SPECTATOR } from "./lib/redact.js";

export const PROTOCOL = 1;
const json = (x) => JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
console.log = console.info = console.warn; // stdout carries the protocol and nothing else

/** @type {Map<string, {duel: Duel, seq: number, prompt: any, errors: number}>} */
const duels = new Map();

/** A ruleset by id, with what a puzzle or a test changes in it (`{id, startingHand: 0}`). */
function formatOf(f) {
  const id = typeof f === "string" ? f : f?.id, base = formats.get(id);
  if (!base) throw new Error(`no format ${id}`);
  return typeof f === "string" ? base : { ...base, ...f };
}

function make(spec) {
  return new Duel({ format: formatOf(spec.format), decks: spec.decks, seed: spec.seed?.map(BigInt), shuffle: spec.shuffle, place: spec.place, lp: spec.lp, draws: spec.draws });
}

/**
 * What the host needs after one step of a duel: the events of the step for each viewer, the question for the player asked (as they
 * may see it), and the duel's public state. `judge` fields are unredacted and for a judge only. A public event (the same for everyone)
 * is sent once as `p`. The tables (`views`) are asked for apart, once per step the host shows: a step the host answers at once (an
 * auto-passed window) never needs them, and they are most of the cost of a step.
 */
function frame(e, events) {
  const d = e.duel, p = d.prompt;
  if (p !== e.prompt) { e.seq++; e.prompt = p; }
  const errors = d.errors.slice(e.errors); e.errors = d.errors.length;
  return {
    events: events.map((m) => {
      const seen = [redact(m, 0), redact(m, 1), redact(m, SPECTATOR)];
      return seen.every((x) => x === m) ? { p: m } : { s: seen, j: m };
    }),
    prompt: p ? { seq: e.seq, view: d.promptView(), judge: p } : null,
    hint: [...d.hint],
    turn: d.turn, turnPlayer: d.turnPlayer, phase: d.phase, lp: d.lp, chain: d.chain, attack: d.attack, window: d.window,
    winner: d.winner, winReason: d.winReason, errors,
  };
}

const entry = (id) => { const e = duels.get(id); if (!e) throw new Error(`no duel ${id}`); return e; };
const put = (id, duel) => { duels.get(id)?.duel.destroy(); const e = { duel, seq: 0, prompt: null, errors: 0 }; duels.set(id, e); return e; };
const header = (d) => ({ ...d.record, answers: [] });

/** Builds a duel from its spec and plays `answers` into it (each `{r}`), stopping before the last is advanced past. */
/** `repeats` lists `[i, j]`: messages[i] is the question messages[j] asked again (the core refused an answer), the same object in the core. */
function rebuild(spec, answers, messages) {
  const duel = make({ ...spec, shuffle: false }), accepted = [], repeats = [];
  let last = null, at = -1;
  answers.forEach((a, i) => {
    const out = duel.advance();
    if (messages) {
      messages.push(...out);
      if (duel.prompt) { if (duel.prompt === last) repeats.push([messages.length, at]); else { last = duel.prompt; at = messages.length; } messages.push(duel.prompt); }
    }
    if (duel.respond(revive(a.r))) accepted.push(i);
  });
  return { duel, accepted, repeats };
}

const OPS = {
  hello: () => ({ protocol: PROTOCOL, version: engineVersion, pid: process.pid, formats: [...formats.keys()] }),
  stats: () => ({ duels: duels.size, pid: process.pid, memory: process.memoryUsage() }),

  /** A new duel. `state` is the table before the core has run; `next` is after it ran to its first question (what `advance` would give). */
  create: ({ duel: id, spec }) => {
    const e = put(id, make(spec));
    const state = frame(e, []);
    return { record: header(e.duel), state, next: frame(e, e.duel.advance()) };
  },
  /** An answer to the current question, and the core run on to the next one. `taken` false: the answer could not be encoded; nothing changed. */
  respond: ({ duel: id, response }) => {
    const e = entry(id);
    if (!e.duel.respond(revive(response))) return { taken: false };
    return { taken: true, next: frame(e, e.duel.advance()) };
  },
  advance: ({ duel: id }) => { const e = entry(id); return { next: frame(e, e.duel.advance()) }; },
  /**
   * A live duel rebuilt from its spec and the first `upTo` answers (a restart, a judge's rewind, an engine restart). `accepted` lists
   * the answers the core took. `messages` (when asked) is every core message on the way, prompts included, unredacted: for a judge's list.
   */
  resume: ({ duel: id, spec, answers, upTo = answers.length, messages: want }) => {
    const messages = want ? [] : null, { duel, accepted, repeats } = rebuild(spec, answers.slice(0, upTo), messages);
    const e = put(id, duel);
    const state = frame(e, []);
    return { accepted, record: header(duel), state, next: frame(e, duel.advance()), messages, repeats };
  },
  /** A recorded duel played again from start to end: every core message, prompts included, unredacted (for replays and analytics). */
  replay: ({ spec, answers }) => {
    const messages = [], { duel, repeats } = rebuild(spec, answers, messages);
    messages.push(...duel.advance());
    const end = { winner: duel.winner, winReason: duel.winReason, turn: duel.turn, lp: duel.lp, errors: duel.errors };
    duel.destroy();
    return { messages, repeats, ...end };
  },
  /** The table as both players and a spectator see it now. */
  views: ({ duel: id }) => { const d = entry(id).duel; return { views: [d.view(0), d.view(1), d.view(SPECTATOR)] }; },
  /** The table as `viewer` sees it; `"judge"` is every hand and face-down card (for a judge at the table only). */
  view: ({ duel: id, viewer }) => ({ view: entry(id).duel.view(viewer === "judge" ? JUDGE : viewer) }),
  /** A Deck, Extra Deck or other pile in order: hidden information, for a judge who asked. */
  contents: ({ duel: id, team, pile }) => ({ codes: entry(id).duel.contents(team, pile) }),
  destroy: ({ duel: id }) => { duels.get(id)?.duel.destroy(); duels.delete(id); return {}; },
};

function handle(line) {
  let req;
  try { req = JSON.parse(line); } catch { return process.stdout.write(json({ error: "not JSON" }) + "\n"); }
  let reply;
  try {
    const op = OPS[req.op];
    if (!op) throw new Error(`no op ${req.op}`);
    reply = { id: req.id, ...op(req) };
  } catch (e) { reply = { id: req.id, error: String(e?.message ?? e) }; }
  if (!req.noreply) process.stdout.write(json(reply) + "\n");
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  for (let i; (i = buf.indexOf("\n")) >= 0; ) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line) handle(line); }
});
process.stdin.on("end", () => process.exit(0)); // the host went away
