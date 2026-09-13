/**
 * Turn one model id and one set of knobs into the job outputs a benchmark needs.
 *
 * A benchmark run measures ONE model at ONE configuration. That is the whole
 * point of this file. Its predecessor split every configured model into two
 * runtime lists and let a single run fan out across all of them, so 7 models x
 * 4 shards became 28 jobs that started at the same instant, contended for
 * Hugging Face, npm and the Actions pool, and were timed while doing it. One
 * arm died of ETIMEDOUT inside a native postinstall. Whatever those wall clocks
 * measured, it was not a property of a model.
 *
 * This file DERIVES NOTHING. `test/voice-evaluation/run-config.mjs` is the only
 * thing that resolves a configuration or computes a slug, and
 * `run-manifest.schema.json` is the only thing that says what a run must
 * record. Both the planner and the arms call in there, so the identity written
 * into a manifest is the identity the workflow dispatched - not a second
 * derivation that agrees until the day it does not.
 *
 * A file rather than an inline `run:` block, because the same logic embedded in
 * YAML had to survive three levels of quoting and lost an environment variable
 * doing it.
 */

import { readFileSync, appendFileSync } from "node:fs";
import { resolveRunConfig } from "../../test/voice-evaluation/run-config.mjs";

const config = JSON.parse(
  readFileSync(new URL("../../test/voice-evaluation/voices.config.json", import.meta.url), "utf8"),
);

/* Which toolchain the runner needs. A model whose runtime is in neither set
   gets no arm, and failing here is better than a matrix that comes back empty
   and a run that goes green having measured nothing. */
const NODE_RUNTIMES = new Set(["kokoro-js", "transformers.js"]);
const PYTHON_RUNTIMES = new Set(["onnxruntime-python"]);

function fail(message, detail) {
  console.error(message);
  if (detail) console.error(detail);
  process.exit(1);
}

const wanted = (process.env.MODEL ?? "").trim();
if (!wanted) fail("MODEL is required. A benchmark run measures one model.");

const spec = config.models.find((m) => m.id === wanted);
if (!spec) fail(`unknown model "${wanted}".`, `configured: ${config.models.map((m) => m.id).join(", ")}`);
if (spec.blocked) fail(`${wanted} is blocked: ${spec.blocked}`);
if (!spec.enabled) fail(`${wanted} is disabled in voices.config.json`);

const arm = NODE_RUNTIMES.has(spec.runtime)
  ? "node"
  : PYTHON_RUNTIMES.has(spec.runtime)
    ? "python"
    : null;
if (!arm) {
  fail(
    `${wanted} needs runtime "${spec.runtime}", which has no arm.`,
    `wired runtimes: ${[...NODE_RUNTIMES, ...PYTHON_RUNTIMES].join(", ")}`,
  );
}

let run;
try {
  run = resolveRunConfig(process.env, spec);
} catch (error) {
  fail(error.message);
}

const knobs = run.config;

/* The shard list is the only thing this run fans out over. A shard is a whole
   4-vCPU runner voicing its own slice, not a slice of one machine's cores, so
   it cuts elapsed time without changing what any single clip cost. */
const outputs = {
  model: wanted,
  arm,
  runtime: spec.runtime,
  runId: run.runId,
  configSlug: run.configSlug,
  shards: JSON.stringify(Array.from({ length: knobs.shards }, (_, i) => i)),
  shardTotal: knobs.shards,
  repeats: knobs.repeats,
  maxWordsAChunk: knobs.maxWordsAChunk,
  threads: knobs.threads,
  maxItems: knobs.maxItems,
  /* The resolved block itself, handed down to every shard so all of them record
     byte-identical provenance. One line on purpose: a `$GITHUB_OUTPUT` entry is
     key=value terminated by a newline, so a pretty-printed object would need
     heredoc quoting and would break the moment a value contained the delimiter. */
  runJson: JSON.stringify(run),
};
for (const [key, value] of Object.entries(outputs)) {
  appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

const summary = [
  `## ${spec.name} \`${wanted}\``,
  "",
  `${spec.params ?? "?"} - ${spec.architecture ?? "?"} - ${spec.licence ?? "?"} - ` +
    `voice \`${spec.voice}\` (${spec.accent ?? "?"}${spec.accentKnown === false ? ", unverified" : ""})`,
  "",
  `**Run id** \`${run.runId}\``,
  "",
  "| Setting | Value |",
  "| --- | --- |",
  `| Runtime | \`${spec.runtime}\` (${arm} arm) |`,
  `| Weights | \`${spec.modelId}\` ${spec.dtype} |`,
  `| Shards | ${knobs.shards} - each a whole runner voicing its own slice |`,
  `| Words a chunk | ${knobs.maxWordsAChunk} |`,
  `| Repeats a clip | ${knobs.repeats}${knobs.repeats > 1 ? " (the median is reported)" : ""} |`,
  `| Inference threads | ${knobs.threads || "the runtime chooses"} |`,
  `| Items | ${knobs.maxItems || "the whole corpus"} |`,
  "",
  run.notes ? `**What this run tweaks:** ${run.notes}` : "",
  "",
  "One model, one configuration, one run. Nothing else voices while this is timed,",
  "so the figures may be compared against the 6 h job cap.",
  "",
].join("\n");

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
console.log(summary);
