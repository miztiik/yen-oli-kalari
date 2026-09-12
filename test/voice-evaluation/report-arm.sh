#!/usr/bin/env bash
# Print one arm's reading as a markdown table, for the job summary.
# A separate file because the same block inline in YAML had to survive three
# levels of quoting and lost an environment variable doing it.
set -euo pipefail
M="results/${MODEL}/manifest.json"
if [ ! -f "$M" ]; then
  echo "### ${MODEL} produced no manifest"
  exit 0
fi
MANIFEST="$M" GRADES="results/${MODEL}/verbalization-grades.json" node -e '
const fs = require("fs");
const m = JSON.parse(fs.readFileSync(process.env.MANIFEST, "utf8"));
const x = m.metrics;
const row = (k, v) => console.log(`| ${k} | ${v} |`);
console.log(`### ${m.model}  \`${m.runtime}\``);
console.log("");
console.log(`${m.params ?? "?"} - ${m.architecture ?? "?"} - ${m.licence ?? "?"} - voice \`${m.voice}\` (${m.accent ?? "?"}${m.accentKnown === false ? ", unverified" : ""})`);
console.log("");
console.log("| Metric | Value |");
console.log("| --- | --- |");
if (x) {
  row("Real-time factor", `${x.realTimeFactor.toFixed(4)} (${x.speedMultiplier.toFixed(2)}x real time)`);
  row("Median speed", `${x.medianCharactersASecond.toFixed(1)} char/s`);
  row("Speaking rate", `${x.speakingRate.toFixed(1)} wpm, +/-${(x.rateStability.coefficientOfVariation * 100).toFixed(1)}%`);
  row("Long-form drift", x.drift ? `${x.drift.medianDriftPercent.toFixed(1)}%` : "n/a");
  row("Processing time", `${Math.round(x.processingSeconds)} s`);
  row("Total characters", x.totalCharacters.toLocaleString());
}
row("Peak memory", `${m.peakMemoryMb} MB`);
row("Model load", `${(m.modelLoadMs / 1000).toFixed(1)} s`);
if (fs.existsSync(process.env.GRADES)) {
  const g = JSON.parse(fs.readFileSync(process.env.GRADES, "utf8"));
  row("**Verbalization accuracy**", `**${(g.verbalizationAccuracy * 100).toFixed(1)}%** (${g.casesCorrect}/${g.casesScored})`);
  row("Text fidelity", `WER ${g.medianTextFidelityWer.toFixed(3)}`);
  console.log("");
  console.log("| Category | Correct |");
  console.log("| --- | --- |");
  for (const [name, s] of Object.entries(g.byCategory)) {
    console.log(`| ${name} | ${s.correct}/${s.total} |`);
  }
}
console.log("");
'