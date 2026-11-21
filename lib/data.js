// What the core reads: the card database (only the numbers a duel needs), the card scripts, and the rulesets in formats/.
// The card scripts and database are Project Ignis's, fetched at pinned commits by scripts/fetch-data.sh into EDISON_DATA
// (this folder's data/ by default).
import Database from "better-sqlite3";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const dataDir = path.resolve(process.env.EDISON_DATA ?? path.join(root, "data"));
const scriptDir = path.join(dataDir, "scripts");

const TYPE_LINK = 0x4000000, TYPE_TOKEN = 0x4000;
/** @type {Map<number, {core: any}>} */
const cards = new Map();
const db = new Database(path.join(dataDir, "cdb/cards.cdb"), { readonly: true });
for (const d of db.prepare("select * from datas").iterate()) {
  const setcodes = [];
  for (let sc = BigInt.asUintN(64, BigInt(d.setcode)); sc; sc >>= 16n) if (sc & 0xffffn) setcodes.push(Number(sc & 0xffffn));
  const link = (d.type & TYPE_LINK) !== 0;
  cards.set(d.id, {
    core: {
      code: d.id, alias: d.alias, setcodes, type: d.type, level: d.level & 0xff, attribute: d.attribute, race: BigInt(d.race),
      attack: d.atk, defense: link ? 0 : d.def, lscale: (d.level >> 24) & 0xff, rscale: (d.level >> 16) & 0xff, link_marker: link ? d.def : 0,
    },
  });
}
db.close();

export const getCard = (code) => cards.get(code) ?? null;

const scriptCache = new Map();
/** Reads a script by file name, trying each of the format's script folders in order. A folder starting "./" is in this repo, any other is under data/scripts. */
export function readScript(name, dirs = ["", "official"]) {
  for (const dir of dirs) {
    const p = path.join(dir.startsWith("./") ? root : scriptDir, dir, name);
    let s = scriptCache.get(p);
    if (s === undefined) scriptCache.set(p, (s = existsSync(p) ? readFileSync(p, "utf8") : null));
    if (s !== null) return s;
  }
  return null;
}

/** The rulesets: formats/<id>.json. A JSON file there with no `id` is not one. */
export const formats = new Map();
for (const f of readdirSync(path.join(root, "formats"))) {
  if (!f.endsWith(".json")) continue;
  const fmt = JSON.parse(readFileSync(path.join(root, "formats", f), "utf8"));
  if (!fmt.id) continue;
  fmt.pool = fmt.pool.filter((id) => cards.has(id) && !(cards.get(id).core.type & TYPE_TOKEN)); // drop alternate arts the database lacks, and Tokens
  fmt.limits = new Map([...fmt.forbidden.map((id) => [id, 0]), ...fmt.limited.map((id) => [id, 1]), ...fmt.semiLimited.map((id) => [id, 2])]);
  formats.set(fmt.id, fmt);
}

const head = (dir) => { try { return readFileSync(path.join(dataDir, dir, ".git/HEAD"), "utf8").trim().slice(0, 12); } catch { return "unknown"; } };
/** The pinned card data this engine is running (scripts/fetch-data.sh). */
export const dataVersion = { scripts: head("scripts"), cards: head("cdb") };
