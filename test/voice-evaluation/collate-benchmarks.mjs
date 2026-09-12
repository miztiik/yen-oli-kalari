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
  arms.push(JSON.parse(readFileSync(manifestPath, "utf8")));
}

const finished = arms.filter((a) => !a.failed);
const failed = arms.filter((a) => a.failed);

if (finished.length === 0) {
  console.log("# Voice benchmark\n\nNo arm produced a manifest.");
  process.exit(0);
}

finished.sort((a, b) => a.metrics.realTimeFactor - b.metrics.realTimeFactor);

const hosts = new Set(finished.map((a) => a.host.cpuModel));
const onRunner = finished.every((a) => a.host.isCi);

console.log("# Voice benchmark");
console.log("");
console.log(
  `${finished.length} arm${finished.length === 1 ? "" : "s"} finished` +
    (failed.length ? `, **${failed.length} failed: ${failed.map((f) => f.model).join(", ")}**` : "") +
    ".",
);
console.log("");

if (!onRunner) {
  console.log("> **Not every arm ran on the production runner.** Wall clock is a property of");
  console.log("> the host, so the real-time factors below are not comparable to a job cap.");
  console.log("");
} else if (hosts.size > 1) {
  console.log(`> **Arms ran on ${hosts.size} different runner models**, so small differences`);
  console.log("> in real-time factor may be the hardware rather than the model.");
  console.log("");
}

console.log("| Model | Runtime | RTF | x real time | wpm | Rate spread | Drift | Peak MB | Load |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const arm of finished) {
  const m = arm.metrics;
  console.log(
    `| \`${arm.model}\` | ${arm.runtime} | **${m.realTimeFactor.toFixed(4)}** | ` +
      `${m.speedMultiplier.toFixed(2)}x | ${m.speakingRate.toFixed(1)} | ` +
      `+/-${(m.rateStability.coefficientOfVariation * 100).toFixed(1)}% | ` +
      `${m.drift ? m.drift.medianDriftPercent.toFixed(1) + "%" : "n/a"} | ` +
      `${arm.peakMemoryMb} | ${(arm.modelLoadMs / 1000).toFixed(1)}s |`,
  );
}
console.log("");

/* What each arm's factor means against the cap, which is the only question the
   pipeline actually needs answered. */
if (onRunner) {
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
      failed: failed.map((f) => f.model),
      arms: finished.map((a) => ({
        model: a.model,
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
