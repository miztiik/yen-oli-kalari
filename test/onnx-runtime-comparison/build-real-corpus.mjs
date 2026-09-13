/**
 * Build a measurement corpus from several real published days.
 *
 * One day is one day's news. A corpus drawn from a single digest inherits
 * whatever that day happened to be about - if 2026-09-11 was heavy on central
 * banking, the corpus is heavy on currency and light on everything else, and a
 * model is then judged on a sample of one editorial accident.
 *
 * So this walks back over several days and samples across all of them, which
 * also widens the length distribution and moves the hazard mix closer to what
 * the pipeline will really hand a model.
 *
 * Usage:
 *   node build-real-corpus.mjs                     # the default window
 *   DAYS=7 COUNT=48 node build-real-corpus.mjs     # a week, 48 summaries
 *   node build-real-corpus.mjs 2026/09/11          # one named day
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const NAMED_DAY = process.argv[2] ?? null;
const DAYS = Number(process.env.DAYS ?? 5);
const COUNT = Number(process.env.COUNT ?? 36);
const BASE = process.env.DIGEST_BASE ?? "https://miztiik.github.io/yen-idhazh/digest";
const END_DATE = process.env.END_DATE ?? "2026-09-11";

const OUT_DIR = fileURLToPath(new URL("./real-summaries/", import.meta.url));
const OUT_PATH = `${OUT_DIR}summaries.json`;

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** The days to try, newest first, as `YYYY/MM/DD`. */
function daysToFetch() {
  if (NAMED_DAY) return [NAMED_DAY];
  const end = new Date(`${END_DATE}T00:00:00Z`);
  return Array.from({ length: DAYS }, (_, back) => {
    const day = new Date(end);
    day.setUTCDate(day.getUTCDate() - back);
    const month = String(day.getUTCMonth() + 1).padStart(2, "0");
    const date = String(day.getUTCDate()).padStart(2, "0");
    return `${day.getUTCFullYear()}/${month}/${date}`;
  });
}

/* Things a news voice gets wrong, and which a hand-picked sample can miss. Each
   summary is tagged with the hazards it carries, so a listener with limited
   time can be sent to the clips that will discriminate between two models. */
const HAZARDS = [
  { id: "currency", test: /(?:US\$|S\$|NT\$|Rs\.?|₹|\$|€|£)\s?[\d,.]+|\b\d[\d,.]*\s?(?:crore|lakh|billion|million|trillion|bn|tn)\b/i },
  { id: "percent", test: /\b\d+(?:\.\d+)?\s?(?:percent|per cent|%)/i },
  { id: "bigNumber", test: /\b\d{1,3}(?:,\d{3})+\b|\b\d+\.\d+\b/ },
  { id: "acronym", test: /\b(?:[A-Z]{2,6})\b(?!\.)/ },
  { id: "date", test: /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i },
  { id: "hyphenate", test: /\b[a-z]+-[a-z]+(?:-[a-z]+)*\b/i },
  { id: "quoted", test: /["“”']/ },
];

function hazardsIn(text) {
  return HAZARDS.filter((hazard) => hazard.test.test(text)).map((hazard) => hazard.id);
}

const pool = [];
const fetched = [];

for (const day of daysToFetch()) {
  const url = `${BASE}/${day}/digest.json`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`  ${day}  HTTP ${response.status}, skipped`);
      continue;
    }
    const digest = await response.json();
    const usable = digest.items.filter(
      (item) => typeof item.summary === "string" && countWords(item.summary) > 0,
    );
    for (const item of usable) pool.push({ ...item, day });
    fetched.push({ day, url, published: digest.items.length, usable: usable.length });
    console.log(`  ${day}  ${usable.length} usable of ${digest.items.length}`);
  } catch (error) {
    console.log(`  ${day}  ${error.message}, skipped`);
  }
}

if (pool.length === 0) {
  console.error("no day yielded a usable summary");
  process.exit(1);
}

/* Sample across the length distribution rather than taking the first N: the
   fixed cost of a chunk is what makes a short summary expensive in real-time
   terms, and a corpus of one length would hide that. Sorting by length and
   stepping evenly picks the spread without pretending to be random - a seeded
   shuffle would be reproducible and would still cluster. */
const sorted = [...pool].sort((a, b) => countWords(a.summary) - countWords(b.summary));
const step = sorted.length / Math.min(COUNT, sorted.length);
const picked = [];
for (let i = 0; picked.length < Math.min(COUNT, sorted.length); i += 1) {
  const item = sorted[Math.min(sorted.length - 1, Math.floor(i * step))];
  if (!picked.includes(item)) picked.push(item);
}

const summaries = picked.map((item, index) => ({
  id: `real-${String(index + 1).padStart(2, "0")}`,
  words: countWords(item.summary),
  text: item.summary,
  hazards: hazardsIn(item.summary),
  sourceItemId: item.item_id,
  sourceName: item.source_name,
  vertical: item.vertical,
  day: item.day,
}));

const totalWords = summaries.reduce((sum, summary) => sum + summary.words, 0);
const hazardTally = {};
for (const hazard of HAZARDS) {
  hazardTally[hazard.id] = summaries.filter((s) => s.hazards.includes(hazard.id)).length;
}
const dayTally = {};
for (const summary of summaries) dayTally[summary.day] = (dayTally[summary.day] ?? 0) + 1;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  OUT_PATH,
  `${JSON.stringify(
    {
      note:
        "Real published summaries, fetched from the live site rather than written for the test, " +
        "drawn from several days so the corpus does not inherit one day's editorial accident. " +
        "Sampled across the length distribution. Each carries the pronunciation hazards it holds.",
      sampledFrom: fetched.map((f) => f.url),
      days: fetched,
      fetchedAt: new Date().toISOString(),
      dayItemsTotal: fetched.reduce((sum, f) => sum + f.published, 0),
      poolSize: pool.length,
      totalWords,
      hazardTally,
      dayTally,
      summaries,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`\n${fetched.length} day(s), ${pool.length} summaries in the pool`);
console.log(
  `sampled ${summaries.length}, ${totalWords} words, ` +
    `${summaries[0].words} to ${summaries[summaries.length - 1].words} words`,
);
console.log(`\nby day:`);
for (const [day, count] of Object.entries(dayTally)) console.log(`  ${day}  ${count}`);
console.log(`\nhazards carried:`);
for (const hazard of HAZARDS) {
  console.log(`  ${hazard.id.padEnd(12)} ${String(hazardTally[hazard.id]).padStart(3)} / ${summaries.length}`);
}
console.log(`\nwrote ${OUT_PATH}`);
