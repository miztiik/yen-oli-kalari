/**
 * Write the index the page fetches at runtime.
 *
 * The page used to be prerendered: every manifest, every clip entry and every
 * grade were inlined into a `data.js` that assigned one global, which grew past
 * half a megabyte with six voices and would have grown linearly with every one
 * added.
 *
 * It is now a shell. This writes a small index naming the runs and where their
 * manifests live; the page fetches the index, then fetches one manifest at a
 * time as a listener selects a voice. Adding a voice costs one row here and one
 * request there, rather than reshipping the whole payload to every reader.
 *
 * The trade is a fetch, and it is worth taking: the manifests are static JSON
 * beside the audio they describe, served by the same host, and a reader only
 * pays for the voice they actually open.
 *
 * Usage:
 *   node build-page-index.mjs
 *   CLIP_BASE=./results/ CLIP_EXTENSION=.ogg node build-page-index.mjs
 *   RESULTS_DIR=/tmp/run INDEX_PATH=/tmp/index.json node build-page-index.mjs
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const RESULTS_DIR = process.env.RESULTS_DIR
  ? `${process.env.RESULTS_DIR.replace(/[\\/]?$/, "/")}`
  : fileURLToPath(new URL("./results/", import.meta.url));
const CATALOGUE_PATH = fileURLToPath(new URL("./model-catalogue.json", import.meta.url));
const OUTPUT_PATH = process.env.INDEX_PATH
  ? process.env.INDEX_PATH
  : fileURLToPath(new URL("./page/index.json", import.meta.url));

/* Where the page looks for audio and manifests, and what the clips are called
   there. Locally they sit in results/<model>/; the published site flattens and
   encodes them. Both are written into the index rather than assumed. */
const CLIP_BASE = process.env.CLIP_BASE ?? "../results/";
const CLIP_EXTENSION = process.env.CLIP_EXTENSION ?? "";

if (!existsSync(RESULTS_DIR)) {
  console.error("No results/ directory. Run a benchmark first.");
  process.exit(1);
}

const catalogue = existsSync(CATALOGUE_PATH)
  ? JSON.parse(readFileSync(CATALOGUE_PATH, "utf8")).models
  : {};

/* THE CATALOGUE IS KEYED BY HUGGING FACE REPOSITORY ID, not by the results
   directory name. The directory is named for a RUN (`kokoro-fp32-uk`), and a
   run is a model at a voice at a quantisation; the catalogue describes the
   MODEL, so three of those runs share one row. Joining on the directory name
   was the original bug and it failed silently - every lookup missed, so the
   licence, the architecture note and both source URLs resolved to undefined and
   the page drew nothing where they should have been. */
function catalogued(manifest, modelSlug) {
  return catalogue[manifest.modelId] ?? catalogue[modelSlug] ?? {};
}

function directories(path) {
  return readdirSync(path).filter((name) => statSync(join(path, name)).isDirectory());
}

const runs = [];
for (const directoryName of directories(RESULTS_DIR)) {
  /* The publish workflow names its artifacts `voiced-<model>`, and downloading
     them makes that the directory name. The prefix is a packaging detail, not
     part of a model's identity. */
  const modelSlug = directoryName.replace(/^voiced-/, "");
  const manifestPath = join(RESULTS_DIR, directoryName, "manifest.json");
  if (!existsSync(manifestPath)) continue;

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const gradesPath = join(RESULTS_DIR, directoryName, "verbalization-grades.json");
  const grades = existsSync(gradesPath) ? JSON.parse(readFileSync(gradesPath, "utf8")) : null;
  const known = catalogued(manifest, modelSlug);

  /* The index carries only what the model panel needs to draw a card and rank
     the runs. Everything per-clip stays in the manifest the page fetches on
     demand - which is the whole point of the split. */
  runs.push({
    runId: modelSlug,
    /* The benchmark's identity for this reading: `<model>__<configSlug>`, and
       whether it may be priced against the job cap. A page that showed two
       readings of one model without saying what differed between them would be
       inviting a false comparison. */
    benchmarkRunId: manifest.run?.runId ?? null,
    configSlug: manifest.run?.configSlug ?? null,
    config: manifest.run?.config ?? null,
    isolated: manifest.run?.isolated ?? false,
    notIsolatedBecause: manifest.run?.notIsolatedBecause ?? null,
    /* Whether the run got every shard back. A run that lost one measured a
       shorter corpus than it asked for, so its clip count and byte totals are
       short - the card has to be able to say so before the manifest is
       fetched, which means it belongs in the index rather than only in the
       manifest the page loads on demand. */
    shard: manifest.shard
      ? {
          merged: manifest.shard.merged ?? false,
          complete: manifest.shard.complete ?? true,
          shardsMerged: manifest.shard.shardsMerged ?? null,
          shardsExpected: manifest.shard.shardsExpected ?? null,
          incompleteBecause: manifest.shard.incompleteBecause ?? null,
        }
      : null,
    /* `?? null` on every field the catalogue can fill, rather than letting
       JSON.stringify drop an undefined key. The page prints "not recorded" for
       a null and cannot tell a missing key from a field nobody has drawn yet,
       so an explicit null is what makes the empty state honest. */
    name: manifest.name ?? known.name ?? modelSlug,
    modelId: manifest.modelId,
    quantisation: manifest.quantisation,
    runtime: manifest.runtime,
    voice: manifest.voice,
    accent: manifest.accent ?? known.accent ?? null,
    accentKnown: manifest.accentKnown ?? known.accentKnown ?? null,
    params: manifest.params ?? known.params ?? null,
    architecture: manifest.architecture ?? known.architecture ?? null,
    licence: manifest.licence ?? known.licence ?? null,
    commercialUse: manifest.commercialUse ?? known.commercialUse ?? null,
    arenaElo: known.arenaElo ?? null,
    incumbent: Boolean(known.incumbent),
    sizeGb: manifest.sizeGb ?? known.sizeGb ?? null,
    host: manifest.host,
    peakMemoryMb: manifest.peakMemoryMb,
    modelLoadMs: manifest.modelLoadMs,
    metrics: manifest.metrics ?? null,
    totals: manifest.totals ?? null,
    verbalization: grades
      ? {
          accuracy: grades.verbalizationAccuracy,
          correct: grades.casesCorrect,
          scored: grades.casesScored,
          medianWer: grades.medianTextFidelityWer,
          byCategory: grades.byCategory,
        }
      : null,
    manifestUrl: `${CLIP_BASE}${directoryName}/manifest.json`,
    gradesUrl: grades ? `${CLIP_BASE}${directoryName}/verbalization-grades.json` : null,
    clipBase: `${CLIP_BASE}${directoryName}/summaries/`,
    clipExtension: CLIP_EXTENSION,
    clipCount: manifest.clips?.length ?? 0,
  });
}

if (runs.length === 0) {
  console.error("results/ holds no manifest.");
  process.exit(1);
}

/* Fastest first, and the incumbent ahead of anything it ties with, so the page
   opens on something worth hearing rather than on whatever sorted first. */
runs.sort((a, b) => {
  const rtf = (run) => run.metrics?.realTimeFactor ?? Infinity;
  return rtf(a) - rtf(b) || (b.incumbent ? 1 : 0) - (a.incumbent ? 1 : 0);
});

const index = {
  schemaVersion: "2026-09-14",
  generatedAt: new Date().toISOString(),
  /* THE CATALOGUE TRAVELS WITH THE INDEX. `app.js` has always merged what a run
     says about itself over what the catalogue claims, but the index never
     carried a catalogue, so the merge ran against an empty object on every load
     and the source URLs - the only route from a run back to the model's own
     card - were never on screen. Only the rows for models that actually ran are
     carried: the file holds ten and a page usually shows six, and a reader
     should not pay for four models nobody voiced. */
  catalogue: Object.fromEntries(
    [...new Set(runs.map((run) => run.modelId))]
      .filter((modelId) => catalogue[modelId])
      .map((modelId) => [modelId, catalogue[modelId]]),
  ),
  runs,
};

writeFileSync(OUTPUT_PATH, `${JSON.stringify(index, null, 2)}\n`, "utf8");

const bytes = Buffer.byteLength(JSON.stringify(index));
console.log(`wrote page/index.json - ${runs.length} runs, ${(bytes / 1024).toFixed(1)} KB`);
for (const run of runs) {
  console.log(
    `  ${run.runId.padEnd(26)} RTF ${String(run.metrics?.realTimeFactor ?? "?").padEnd(8)} ` +
      `${run.verbalization ? (run.verbalization.accuracy * 100).toFixed(1) + "% verbal" : "ungraded"}  ` +
      `${run.clipCount} clips`,
  );
}
