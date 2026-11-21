// A duel's record must be enough to play it again move for move: that is what replays, analytics and dispute checks stand on.
import test from "node:test";
import assert from "node:assert/strict";
import { Duel, replay, engineVersion } from "../lib/duel.js";
import { formats, getCard } from "../lib/data.js";
import { answer, makeRng } from "./bot.js";

const edison = formats.get("edison");
// CARD_HINT is left out: after a hand shuffle the core lists a card's hint labels in the order of a table keyed by
// memory address (field.cpp, `pcard->indexer`), so two runs can swap them. They label cards; they decide nothing.
const CARD_HINT = 160;
const J = (x) => JSON.stringify(x.filter((m) => m.type !== CARD_HINT), (_k, v) => (typeof v === "bigint" ? v.toString() : v));
const mainPool = edison.pool.filter((id) => !(getCard(id).core.type & 0x4802040) && !edison.limits.has(getCard(id).core.alias || id));

test("a recorded duel replays to the identical stream of core messages", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const rnd = makeRng(seed);
    const deck = () => ({ main: Array.from({ length: 40 }, () => mainPool[Math.floor(rnd() * mainPool.length)]), extra: [] });
    const duel = new Duel({ format: edison, decks: [deck(), deck()] });
    const live = [];
    for (let n = 0; n < 20000; n++) {
      live.push(...duel.advance());
      if (duel.winner !== null) break;
      live.push(duel.prompt);
      duel.respond(answer(duel.prompt, rnd));
    }
    const record = JSON.parse(JSON.stringify(duel.record)); // as it would come back from storage
    const again = replay(record, edison);
    assert.equal(again.messages.length, live.length, `seed ${seed}: message count`);
    assert.deepEqual([again.turn, again.lp], [duel.turn, duel.lp], `seed ${seed}: final turn and LP`);
    assert.equal(J(again.messages), J(live), `seed ${seed}: messages differ`);
    assert.equal(again.winner, duel.winner);
    assert.deepEqual(record.engine, engineVersion);
    duel.destroy();
  }
});
