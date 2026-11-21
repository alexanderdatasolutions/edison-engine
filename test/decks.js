// The sample decks (test/decks, edison-sim's sample lists): Edison meta decks whose cards look at hands and Set cards.
import { readFileSync } from "node:fs";

const dir = new URL("./decks/", import.meta.url);
const parseYdk = (text) => {
  const deck = { main: [], extra: [], side: [] };
  let section = deck.main;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "#main") section = deck.main; else if (line === "#extra") section = deck.extra; else if (line === "!side") section = deck.side;
    else if (/^\d+$/.test(line)) section.push(Number(line));
  }
  return deck;
};

/** `[{id, name, deck: {main, extra, side}}]`, in the order of decks/index.json. */
export const sampleDecks = () => JSON.parse(readFileSync(new URL("index.json", dir), "utf8")).map((d) => ({ id: d.file.replace(/\.ydk$/, ""), name: d.name, deck: parseYdk(readFileSync(new URL(d.file, dir), "utf8")) }));
