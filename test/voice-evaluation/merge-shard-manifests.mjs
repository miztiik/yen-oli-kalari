/**
 * Merge the manifests N shards wrote into one, and report what they measured.
 *
 * A sharded run produces N partial manifests, each covering its own slice. This
 * joins them back into the single manifest the evaluation page reads, and
 * writes a summary the workflow puts in its step summary.
 *
 * The wall clock is NOT summed across shards. Shards run at the same instant on
 * separate runners, so the run costs its slowest shard - summing would report a
 * number no clock on earth measured. Both are printed, because the gap between
 * them is exactly what the fan-out bought.
 *
 * Usage:
 *   node merge-shard-manifests.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const SHARD_DIR = fileURLToPath(new URL("./shards/", import.meta.url));
const CLIP_DIR = fileURLToPath(new URL("./clips/", import.meta.url));

/* The budget: the real-time factor at which the busiest observed day fits in
   one 6 h job. 731 items x 90.2 words at 129.5 wpm is 509.2 minutes of audio,
   and 360 minutes of job divided by that is 0.707. */
const RTF_BUDGET = 0.707;
const BUSIEST_ITEMS = 731;
const MEDIAN_ITEMS = 370;
const MEAN_WORDS = 90.2;
const JOB_CAP_H = 6;

if (!existsSync(SHARD_DIR)) {
  console.error(`no shards/ directory - nothing to merge`);
  process.exit(1);
}

const manifests = [];
for (const entry of readdirSync(SHARD_DIR, { withFileTypes: true })) {
  const path = entry.isDirectory()
    ? join(SHARD_DIR, entry.name, "manifest.json")
    : join(SHARD_DIR, entry.name);
  if (!path.endsWith("manifest.json") || !existsSync(path)) continue;
  manifests.push(JSON.parse(readFileSync(path, "utf8")));
}

if (manifests.length === 0) {
  console.error("found no shard manifests");
  process.exit(1);
}

manifests.sort((a, b) => (a.shard?.index ?? 0) - (b.shard?.index ?? 0));

const expected = manifests[0].shard?.total ?? manifests.length;
const present = new Set(manifests.map((m) => m.shard?.index ?? 0));
const missing = [];
for (let i = 0; i < expected; i += 1) if (!present.has(i)) missing.push(i);

const clips = manifests
  .flatMap((m) => m.clips)
  .sort((a, b) => a.id.localeCompare(b.id));

const audioSeconds = clips.reduce((s, c) => s + c.audioSeconds, 0);
const words = clips.reduce((s, c) => s + c.words, 0);
const bytes = clips.reduce((s, c) => s + c.bytes, 0);

/* Per-shard wall clock is the sum of its own clips; the run is the slowest of
   those, not their total. */
const shardSeconds = manifests.map((m) => ({
  index: m.shard?.index ?? 0,
  seconds: m.clips.reduce((s, c) => s + c.wallClockMs, 0) / 1000,
  clips: m.clips.length,
}));
const serialSeconds = shardSeconds.reduce((s, x) => s + x.seconds, 0);
const slowestShard = shardSeconds.reduce((a, b) => (a.seconds > b.seconds ? a : b));

const rtfSerial = serialSeconds / audioSeconds;
const rtfSharded = slowestShard.seconds / audioSeconds;
const wpm = (words / audioSeconds) * 60;

function dayHours(items, rtf) {
  return ((items * MEAN_WORDS) / wpm / 60) * rtf;
}

const merged = {
  ...manifests[0],
  generatedAt: new Date().toISOString(),
  shard: {
    total: expected,
    present: [...present].sort((a, b) => a - b),
    missing,
    repeats: manifests[0].shard?.repeats ?? 1,
  },
  totals: {
    clipCount: clips.length,
    words,
    audioSeconds: Number(audioSeconds.toFixed(2)),
    bytes,
    serialSeconds: Number(serialSeconds.toFixed(1)),
    slowestShardSeconds: Number(slowestShard.seconds.toFixed(1)),
    realTimeFactorSerial: Number(rtfSerial.toFixed(4)),
    realTimeFactorSharded: Number(rtfSharded.toFixed(4)),
    wordsAMinute: Number(wpm.toFixed(1)),
  },
  clips,
};

mkdirSync(CLIP_DIR, { recursive: true });
writeFileSync(join(CLIP_DIR, "manifest.json"), `${JSON.stringify(merged, null, 2)}\n`, "utf8");

const onRunner = Boolean(merged.host?.isCi);
const lines = [
  `# Voice measurement`,
  ``,
  `**${merged.model}**, corpus \`${merged.corpus?.name ?? "unknown"}\`, ` +
    `${expected} shard(s), ${merged.shard.repeats} repeat(s) each.`,
  ``,
  missing.length ? `> **${missing.length} shard(s) missing: ${missing.join(", ")}** - this is a partial reading.\n` : ``,
  `| Quantity | Value |`,
  `| --- | --- |`,
  `| Clips | ${clips.length} |`,
  `| Words | ${words} |`,
  `| Audio produced | ${(audioSeconds / 60).toFixed(1)} min |`,
  `| Speaking pace | **${wpm.toFixed(1)} wpm** (host-independent) |`,
  `| Compute, summed across shards | ${(serialSeconds / 60).toFixed(1)} min |`,
  `| Compute, slowest shard | ${(slowestShard.seconds / 60).toFixed(1)} min |`,
  `| Real-time factor, one runner | **${rtfSerial.toFixed(4)}** |`,
  `| Real-time factor, ${expected} runners | **${rtfSharded.toFixed(4)}** |`,
  ``,
];

if (onRunner) {
  const busiestSerial = dayHours(BUSIEST_ITEMS, rtfSerial);
  const busiestSharded = dayHours(BUSIEST_ITEMS, rtfSharded);
  lines.push(
    `## Against the ${JOB_CAP_H} h job cap`,
    ``,
    `The budget is a real-time factor of **${RTF_BUDGET}** - what the busiest observed`,
    `day (${BUSIEST_ITEMS} items) needs to fit one job.`,
    ``,
    `| Day | One runner | ${expected} runners |`,
    `| --- | --- | --- |`,
    `| Median (${MEDIAN_ITEMS} items) | ${dayHours(MEDIAN_ITEMS, rtfSerial).toFixed(2)} h | ${dayHours(MEDIAN_ITEMS, rtfSharded).toFixed(2)} h |`,
    `| Busiest (${BUSIEST_ITEMS} items) | ${busiestSerial.toFixed(2)} h ${busiestSerial > JOB_CAP_H ? "**busts**" : "fits"} | ${busiestSharded.toFixed(2)} h ${busiestSharded > JOB_CAP_H ? "**busts**" : "fits"} |`,
    ``,
  );
} else {
  lines.push(
    `> Timed off the production runner (\`${merged.host?.cpuModel ?? "unknown"}\`), so no`,
    `> budget comparison is drawn. Pace and audio duration still transfer; wall clock does not.`,
    ``,
  );
}

lines.push(
  `## Per shard`,
  ``,
  `| Shard | Clips | Compute |`,
  `| --- | --- | --- |`,
  ...shardSeconds.map((s) => `| ${s.index} | ${s.clips} | ${(s.seconds / 60).toFixed(1)} min |`),
  ``,
);

const summary = lines.filter((l) => l !== undefined).join("\n");
writeFileSync(join(CLIP_DIR, "summary.md"), `${summary}\n`, "utf8");

console.log(summary);
