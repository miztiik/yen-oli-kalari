#!/usr/bin/env node
/**
 * Merge the shards of one model back into a single run manifest.
 *
 * A sharded benchmark leaves `results/<model>/shard-N/` directories, each a
 * real but partial reading. The listening page wants one run per model, so the
 * clips are concatenated and the totals recomputed from the merged set.
 *
 * WHY THE TOTALS ARE RECOMPUTED RATHER THAN AVERAGED: a shard's real-time
 * factor is its own audio over its own wall clock. Averaging four of those
 * weights a shard that drew three short summaries the same as one that drew
 * nine long ones. Summing the seconds first and dividing once is the only
 * figure that means "this model, this corpus".
 *
 * WHAT IS DELIBERATELY NOT MERGED: peak memory is a maximum, not a sum -- four
 * shards are four separate machines, so the fleet's peak is the worst single
 * reading, which is what a deployment has to provision for.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const MODEL = process.env.MODEL;
if (!MODEL) {
  console.error("MODEL is required");
  process.exit(1);
}

const ROOT = fileURLToPath(new URL(`./results/${MODEL}/`, import.meta.url));
if (!existsSync(ROOT)) {
  console.error(`no results for ${MODEL}`);
  process.exit(1);
}

const shardDirs = readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^shard-\d+$/.test(entry.name))
  .map((entry) => join(ROOT, entry.name))
  .sort((a, b) => Number(a.match(/\d+$/)[0]) - Number(b.match(/\d+$/)[0]));

if (shardDirs.length === 0) {
  console.log(`${MODEL}: no shard directories, nothing to merge`);
  process.exit(0);
}

const shards = [];
for (const dir of shardDirs) {
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    /* A shard that died is a finding, not a reason to fail the merge: the
       remaining shards still measured real audio on the real runner. */
    console.log(`  ${dir.split(/[\\/]/).pop()}: no manifest, skipped`);
    continue;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const gradesPath = join(dir, "verbalization-grades.json");
  if (existsSync(gradesPath)) manifest.verbalizationGrades = JSON.parse(readFileSync(gradesPath, "utf8"));
  shards.push({ dir, manifest });
}

if (shards.length === 0) {
  console.error(`${MODEL}: every shard failed`);
  process.exit(1);
}

/* Audio moves up one level so the merged manifest's clip paths stay relative to
   the model directory, the same shape an unsharded run produces. */
for (const kind of ["summaries", "verbalization"]) {
  mkdirSync(join(ROOT, kind), { recursive: true });
  for (const { dir } of shards) {
    const from = join(dir, kind);
    if (!existsSync(from)) continue;
    for (const file of readdirSync(from)) {
      renameSync(join(from, file), join(ROOT, kind, file));
    }
  }
}

const merged = { ...shards[0].manifest };
merged.clips = shards.flatMap((s) => s.manifest.clips ?? []);
merged.clips.sort((a, b) => String(a.id).localeCompare(String(b.id), "en", { numeric: true }));

const sum = (key) => merged.clips.reduce((total, clip) => total + (clip[key] ?? 0), 0);
const audioSeconds = sum("audioSeconds");
const wallClockMs = sum("wallClockMs");
const round = (n, places) => Number(n.toFixed(places));

/* The schema is the one an unsharded run writes. A merged manifest that used
   different key names would be a second schema for the same thing, and the page
   would have to know which kind of run it was reading. */
merged.totals = {
  clipCount: merged.clips.length,
  words: sum("words"),
  audioSeconds: round(audioSeconds, 2),
  wallSeconds: round(wallClockMs / 1000, 2),
  bytes: sum("bytes"),
  realTimeFactor: audioSeconds > 0 ? round(wallClockMs / 1000 / audioSeconds, 4) : null,
  wordsAMinute: audioSeconds > 0 ? round((sum("words") / audioSeconds) * 60, 1) : null
};

/* Peak memory is a maximum, not a sum: four shards are four separate machines,
   so what a deployment must provision for is the worst single reading. */
merged.peakMemoryMb = Math.max(...shards.map((s) => s.manifest.peakMemoryMb ?? 0));
merged.modelLoadMs = Math.max(...shards.map((s) => s.manifest.modelLoadMs ?? 0));

/* A merged run must say it was merged. A reader comparing this figure with an
   unsharded one is comparing four machines against one, and this is the only
   place that fact survives. */
const shardWallSeconds = shards.map((s) => s.manifest.totals?.wallSeconds ?? 0);
merged.shard = {
  index: 0,
  total: shards.length,
  merged: true,
  shardsExpected: shardDirs.length,
  shardsMerged: shards.length,
  repeats: shards[0].manifest.shard?.repeats ?? 1,
  wallSecondsPerShard: shardWallSeconds,
  /* Fanning out only buys the difference between the slowest shard and the sum,
     so the slowest shard is the run's real elapsed cost. */
  elapsedSecondsIfParallel: round(Math.max(...shardWallSeconds), 2)
};

const graded = shards.filter((s) => s.manifest.verbalizationGrades);
if (graded.length) {
  const cases = graded.flatMap((s) => s.manifest.verbalizationGrades.cases ?? []);
  const passed = cases.filter((c) => c.verbalizationCorrect).length;
  const grades = {
    ...graded[0].manifest.verbalizationGrades,
    cases,
    casesGraded: cases.length,
    casesCorrect: passed,
    verbalizationAccuracy: cases.length ? round(passed / cases.length, 4) : null
  };
  const wers = cases.map((c) => c.wordErrorRate).filter((n) => typeof n === "number");
  if (wers.length) grades.wordErrorRate = round(wers.reduce((a, b) => a + b, 0) / wers.length, 4);
  writeFileSync(join(ROOT, "verbalization-grades.json"), `${JSON.stringify(grades, null, 2)}\n`, "utf8");
  merged.verbalizationGrades = grades;
}

delete merged.verbalizationGrades;
writeFileSync(join(ROOT, "manifest.json"), `${JSON.stringify(merged, null, 2)}\n`, "utf8");

for (const { dir } of shards) rmSync(dir, { recursive: true, force: true });

console.log(
  `${MODEL}: merged ${shards.length}/${shardDirs.length} shards -> ` +
    `${merged.totals.clipCount} clips, RTF ${merged.totals.realTimeFactor}, ` +
    `${merged.totals.wallSeconds}s of work in ${merged.shard.elapsedSecondsIfParallel}s elapsed`
);
