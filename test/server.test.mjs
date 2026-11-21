// The engine server over its protocol: a host's view of it, through a real child process and pipes.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { formats, getCard } from "../lib/data.js";
import { answer, makeRng } from "./bot.js";

const edison = formats.get("edison");
const pool = edison.pool.filter((id) => !(getCard(id).core.type & 0x4806040) && !edison.limits.has(getCard(id).core.alias || id));

/** A host: one request at a time, each answered by the next line. */
function host() {
  const child = spawn(process.execPath, [new URL("../server.js", import.meta.url).pathname], { stdio: ["pipe", "pipe", "inherit"] });
  let buf = "", waiting = [], n = 0;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (c) => { buf += c; for (let i; (i = buf.indexOf("\n")) >= 0; ) { const line = buf.slice(0, i); buf = buf.slice(i + 1); waiting.shift()(JSON.parse(line)); } });
  const ask = (req) => new Promise((resolve) => { waiting.push(resolve); child.stdin.write(JSON.stringify({ id: ++n, ...req }) + "\n"); });
  return { ask, tell: (req) => child.stdin.write(JSON.stringify({ ...req, noreply: true }) + "\n"), close: () => child.stdin.end(), child };
}

test("a whole duel over the protocol: redacted tables and events for each viewer, and a record that replays to the same end", async () => {
  const h = host(), rnd = makeRng(4);
  const hello = await h.ask({ op: "hello" });
  assert.equal(hello.protocol, 1);
  assert.ok(hello.formats.includes("edison"));
  const deck = () => ({ main: Array.from({ length: 40 }, () => pool[Math.floor(rnd() * pool.length)]), extra: [] });
  const made = await h.ask({ op: "create", duel: "a", spec: { format: "edison", decks: [deck(), deck()], seed: ["4", "1", "2", "3"] } });
  assert.equal(made.record.answers.length, 0);
  let f = made.next, answers = [], hidden = 0;
  for (let i = 0; i < 20000 && f.winner === null; i++) {
    const { views } = await h.ask({ op: "views", duel: "a" });
    for (const c of views[2].players.flatMap((p) => p.hand)) if (!(c.position & 5)) { assert.equal(c.code, 0, "a spectator sees no card in hand"); hidden++; }
    for (const e of f.events) if (e.s) assert.equal(e.j.type, (e.s.find(Boolean) ?? e.j).type);
    const r = answer(f.prompt.judge, rnd);
    answers.push({ r: JSON.parse(JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) });
    const got = await h.ask({ op: "respond", duel: "a", response: answers.at(-1).r });
    assert.equal(got.taken, true);
    f = got.next;
  }
  assert.notEqual(f.winner, null);
  assert.ok(hidden > 100);
  const again = await h.ask({ op: "replay", spec: { format: "edison", decks: made.record.decks, seed: made.record.seed, shuffle: false }, answers });
  assert.deepEqual([again.winner, again.turn, again.lp], [f.winner, f.turn, f.lp]);
  h.tell({ op: "destroy", duel: "a" });
  assert.equal((await h.ask({ op: "stats" })).duels, 0);
  const bad = await h.ask({ op: "respond", duel: "nope", response: {} });
  assert.match(bad.error, /no duel/);
  h.close();
});
