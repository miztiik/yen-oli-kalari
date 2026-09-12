/**
 * Build a measurement corpus from a real published day.
 *
 * The first corpus was twelve summaries picked to span the measured length
 * distribution. That made the speed reading honest but left the hardest
 * question open: those were sampled by hand, and a hand-picked sample can
 * quietly avoid the things that actually break a voice model - a ticker, a
 * currency amount, an Indian name, an acronym nobody expands.
 *
 * This pulls the day straight off the published site instead, so the text the
 * model reads is the text the pipeline will really hand it.
 *
 * Usage:
 *   node build-real-corpus.mjs                      # the default day
 *   node build-real-corpus.mjs 2026/09/11           # a specific day
 *   COUNT=24 node build-real-corpus.mjs             # how many summaries
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DAY = process.argv[2] ?? "2026/09/11";
const COUNT = Number(process.env.COUNT ?? 24);
const BASE = process.env.DIGEST_BASE ?? "https://miztiik.github.io/yen-idhazh/digest";
const URL_FOR_DAY = `${BASE}/${DAY}/digest.json`;

const OUT_DIR = fileURLToPath(new URL("./real-summaries/", import.meta.url));
const OUT_PATH = `${OUT_DIR}summaries.json`;

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/* Things a news voice gets wrong, and which a hand-picked sample can miss.
   Each summary is tagged with the hazards it carries so a listener can be sent
   to the clips that will actually discriminate between two models rather than
   listening to twelve pleasant ones. */
const HAZARDS = [
  { id: "currency", label: "currency amount", test: /(?:US\$|S\$|NT\$|Rs\.?|₹|\$|€|£)\s?[\d,.]+|\b\d[\d,.]*\s?(?:crore|lakh|billion|million|trillion)\b/i },
  { id: "percent", label: "percentage", test: /\b\d+(?:\.\d+)?\s?(?:percent|per cent|%)/i },
  { id: "bigNumber", label: "large or decimal number", test: /\b\d{1,3}(?:,\d{3})+\b|\b\d+\.\d+\b/ },
  { id: "acronym", label: "acronym", test: /\b(?:[A-Z]{2,6})\b(?!\.)/ },
  { id: "date", label: "date or time", test: /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i },
  { id: "hyphenate", label: "hyphenated compound", test: /\b[a-z]+-[a-z]+(?:-[a-z]+)*\b/i },
  { id: "quoted", label: "quoted speech", test: /["“”']/ },
];

function hazardsIn(text) {
  return HAZARDS.filter((h) => h.test.test(text)).map((h) => h.id);
}

const response = await fetch(URL_FOR_DAY);
if (!response.ok) {
  console.error(`could not fetch ${URL_FOR_DAY}: HTTP ${response.status}`);
  process.exit(1);
}
const digest = await response.json();

const withSummaries = digest.items.filter(
  (item) => typeof item.summary === "string" && countWords(item.summary) > 0,
);

if (withSummaries.length === 0) {
  console.error("the day carries no summaries");
  process.exit(1);
}

/* Sample across the length distribution rather than taking the first N, because
   the fixed cost of a chunk is what makes a short summary expensive in
   real-time terms and a corpus of one length would hide that. Sorting by length
   and stepping evenly picks the spread without pretending to be random - a
   seeded shuffle would be reproducible but would still cluster. */
const sorted = [...withSummaries].sort(
  (a, b) => countWords(a.summary) - countWords(b.summary),
);
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
}));

const totalWords = summaries.reduce((sum, s) => sum + s.words, 0);
const hazardTally = {};
for (const hazard of HAZARDS) {
  hazardTally[hazard.id] = summaries.filter((s) => s.hazards.includes(hazard.id)).length;
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  OUT_PATH,
  `${JSON.stringify(
    {
      note:
        "Real published summaries, fetched from the live site rather than written for the test. " +
        "Sampled across the day's length distribution. Each carries the pronunciation hazards it holds.",
      sampledFrom: URL_FOR_DAY,
      fetchedAt: new Date().toISOString(),
      dayItemsTotal: digest.items.length,
      dayItemsPlanned: digest.items_planned ?? null,
      totalWords,
      hazardTally,
      summaries,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`day ${DAY}: ${digest.items.length} items published, ${digest.items_planned ?? "?"} planned`);
console.log(`sampled ${summaries.length} summaries, ${totalWords} words`);
console.log(`lengths ${summaries[0].words} to ${summaries[summaries.length - 1].words} words\n`);
console.log("pronunciation hazards carried by the sample:");
for (const hazard of HAZARDS) {
  const n = hazardTally[hazard.id];
  console.log(`  ${hazard.label.padEnd(26)} ${String(n).padStart(3)} / ${summaries.length}`);
}
console.log(`\nwrote ${OUT_PATH}`);
