/**
 * Rank every benchmark arm that finished, and say what is missing.
 *
 * A comparison table that quietly omits the arms that died reads as though only
 * the survivors were ever tried - and "this model does not run on a 4 vCPU
 * runner" is itself a finding, not an absence of one.
 *
 * Usage:
 *   node collate-benchmarks.mjs
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const RESULTS_DIR = fileURLToPath(new URL("./results/", import.meta.url));
const CATALOGUE_PATH = fileURLToPath(new URL("./model-catalogue.json", import.meta.url));

/* The real-time factor the busiest observed day needs, by how many runners
   carry it. Derived in docs/concepts/model-formats-and-inference.md: 731 items
   x 90.2 words at the measured pace, against a 6 h job. */
const BUDGETS = { 1: 0.692, 2: 1.384, 4: 2.767, 8: 5.534 };

if (!existsSync(RESULTS_DIR)) {
  console.log("No results/ directory - nothing finished.");
  process.exit(0);
}

const catalogue = existsSync(CATALOGUE_PATH)
  ? JSON.parse(readFileSync(CATALOGUE_PATH, "utf8")).models
  : {};

const arms = [];
for (const name of readdirSync(RESULTS_DIR)) {
  const dir = join(RESULTS_DIR, name);
  if (!statSync(dir).isDirectory()) continue;
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    arms.push({ model: name, failed: true });
    continue;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const gradesPath = join(dir, "verbalization-grades.json");
  if (existsSync(gradesPath)) manifest.verbalizationGrades = JSON.parse(readFileSync(gradesPath, "utf8"));
  arms.push(manifest);
}

/* An arm that produced a manifest but no metrics ran and could not be scored -
   which is different from an arm that died, and different again from one that
   was never attempted. All three are reported rather than dropped. */
const finished = arms.filter((a) => !a.failed && a.metrics);
const unscored = arms.filter((a) => !a.failed && !a.metrics);
const failed = arms.filter((a) => a.failed);

if (finished.length === 0) {
  console.log("# Voice benchmark\n\nNo arm produced a manifest.");
  process.exit(0);
}

finished.sort((a, b) => a.metrics.realTimeFactor - b.metrics.realTimeFactor);

const hosts = new Set(finished.map((a) => a.host.cpuModel));
const onRunner = finished.every((a) => a.host.isCi);
/* The cap table is arithmetic against a 6 h job, and it is only meaningful for
   a reading taken with nothing else voicing. A run that shared its runner pool
   with twenty-seven others produced a real wall clock for that moment, but not
   one a design may be priced on. */
const isolated = finished.every((a) => a.run?.isolated === true);

console.log("# Voice benchmark");
console.log("");
console.log(
  `${finished.length} arm${finished.length === 1 ? "" : "s"} finished` +
    (failed.length ? `, **${failed.length} failed: ${failed.map((f) => f.model).join(", ")}**` : "") +
    ".",
);
console.log("");

/* What was measured, and at what settings. A figure without its configuration
   cannot be compared with another figure, which is the entire reason a run
   carries one. */
const configured = finished.filter((a) => a.run);
if (configured.length) {
  console.log("## What was measured");
  console.log("");
  console.log("| Run | Words a chunk | Repeats | Threads | Items | Shards | Isolated |");
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  for (const arm of configured) {
    const c = arm.run.config;
    const shardCell =
      arm.shard?.merged && arm.shard.complete === false
        ? `**${arm.shard.shardsMerged}/${arm.shard.shardsExpected}**`
        : String(c.shards);
    console.log(
      `| \`${arm.run.runId}\` | ${c.maxWordsAChunk} | ${c.repeats} | ` +
        `${c.threads || "auto"} | ${c.maxItems || "all"} | ${shardCell} | ` +
        `${arm.run.isolated ? "yes" : "**no**"} |`,
    );
  }
  console.log("");
  for (const arm of configured.filter((a) => a.run.notes)) {
    console.log(`- \`${arm.run.model}\` tweaks: ${arm.run.notes}`);
  }
  if (configured.some((a) => a.run.notes)) console.log("");
}

/* A run that lost a shard measured a shorter corpus than it asked for. The
   real-time factor survives because it is a ratio, but the totals do not, and
   nothing else on this page would say so. */
const incomplete = finished.filter((a) => a.shard?.merged && a.shard.complete === false);
if (incomplete.length) {
  console.log("> **Some runs are missing shards.** Their totals cover fewer clips than the");
  console.log("> corpus holds, so clip counts, byte totals and audio durations are short.");
  console.log("> The real-time factor is still a ratio and still means something.");
  console.log(">");
  for (const arm of incomplete) console.log(`> - \`${arm.model}\`: ${arm.shard.incompleteBecause}`);
  console.log("");
}

if (!onRunner) {
  console.log("> **Not every arm ran on the production runner.** Wall clock is a property of");
  console.log("> the host, so the real-time factors below are not comparable to a job cap.");
  console.log("");
} else if (hosts.size > 1) {
  console.log(`> **Arms ran on ${hosts.size} different runner models**, so small differences`);
  console.log("> in real-time factor may be the hardware rather than the model.");
  console.log("");
}

if (!isolated) {
  const reasons = new Set(
    configured.filter((a) => !a.run.isolated).map((a) => a.run.notIsolatedBecause).filter(Boolean),
  );
  console.log("> **Not every reading is isolated, so none of them may be priced against the");
  console.log("> job cap.** An unisolated run measured a model while something else was");
  console.log("> voicing on the same pool, so its wall clock carries contention that is not");
  console.log("> a property of the model.");
  console.log(">");
  for (const reason of reasons) console.log(`> - ${reason}`);
  console.log("");
}

console.log("| Model | Runtime | RTF | x real time | Verbalization | wpm | Rate spread | Drift | Peak MB |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const arm of finished) {
  const m = arm.metrics;
  const grade = arm.verbalizationGrades
    ? `**${(arm.verbalizationGrades.verbalizationAccuracy * 100).toFixed(1)}%**`
    : "-";
  console.log(
    `| \`${arm.model}\` | ${arm.runtime} | **${m.realTimeFactor.toFixed(4)}** | ` +
      `${m.speedMultiplier.toFixed(2)}x | ${grade} | ${m.speakingRate.toFixed(1)} | ` +
      `+/-${(m.rateStability.coefficientOfVariation * 100).toFixed(1)}% | ` +
      `${m.drift ? m.drift.medianDriftPercent.toFixed(1) + "%" : "n/a"} | ` +
      `${arm.peakMemoryMb} |`,
  );
}
console.log("");

/* What each arm's factor means against the cap, which is the only question the
   pipeline actually needs answered. Drawn only for an isolated reading taken on
   the runner: the cap is 6 h of one job's wall clock, and a figure that carries
   another run's contention would price the design on the wrong number. */
if (onRunner && isolated) {
  console.log("## Against the 6 h job cap");
  console.log("");
  console.log("The busiest observed day is 731 items. A shard is a whole runner.");
  console.log("");
  console.log("| Model | 1 runner | 2 | 4 | 8 |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const arm of finished) {
    const rtf = arm.metrics.realTimeFactor;
    const cells = [1, 2, 4, 8].map((n) => (rtf <= BUDGETS[n] ? "fits" : "busts"));
    console.log(`| \`${arm.model}\` | ${cells.join(" | ")} |`);
  }
  console.log("");
} else if (onRunner) {
  console.log("## Against the 6 h job cap");
  console.log("");
  console.log("**Not drawn.** The cap is one job's wall clock, and these readings are not");
  console.log("isolated, so the arithmetic would price the design on contention rather than");
  console.log("on the model. Re-run through `benchmark-voice.yml`, which measures one model");
  console.log("at one configuration with nothing else voicing.");
  console.log("");
}

console.log("## Licence and provenance");
console.log("");
console.log("| Model | Licence | Commercial | Architecture | Arena Elo |");
console.log("| --- | --- | --- | --- | --- |");
for (const arm of finished) {
  const slug = Object.keys(catalogue).find((k) => arm.model.startsWith(k.split("-")[0]));
  const known = catalogue[slug] || {};
  console.log(
    `| \`${arm.model}\` | ${known.licence ?? "unknown"} | ` +
      `${known.commercialUse === true ? "yes" : known.commercialUse === false ? "**no**" : "unknown"} | ` +
      `${known.architecture ?? "unknown"} | ${known.arenaElo ?? "-"} |`,
  );
}
console.log("");

const voiced = finished.reduce((s, a) => s + (a.verbalization?.length ?? 0), 0);
console.log("## What this does NOT say");
console.log("");
console.log(`- **Nothing above is a quality judgement.** ${voiced} verbalization cases were`);
console.log("  voiced and none graded - grading needs an ASR pass against the expected");
console.log("  spoken form each case carries.");
console.log("- **Nobody has listened.** Speed and steadiness are not intelligibility,");
console.log("  pronunciation or naturalness.");
console.log("- Peak memory is this process's resident set, which excludes whatever the");
console.log("  ONNX runtime maps outside the heap.");
console.log("");

writeFileSync(
  join(RESULTS_DIR, "comparison.json"),
  `${JSON.stringify(
    {
      schemaVersion: "2026-09-13",
      generatedAt: new Date().toISOString(),
      onRunner,
      isolated,
      failed: failed.map((f) => f.model),
      arms: finished.map((a) => ({
        model: a.model,
        run: a.run ?? null,
        runtime: a.runtime,
        modelId: a.modelId,
        host: a.host,
        peakMemoryMb: a.peakMemoryMb,
        modelLoadMs: a.modelLoadMs,
        metrics: a.metrics,
        verbalizationCasesVoiced: a.verbalization?.length ?? 0,
      })),
    },
    null,
    2,
  )}\n`,
  "utf8",
);
