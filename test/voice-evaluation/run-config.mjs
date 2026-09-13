/**
 * Resolve the knobs of ONE benchmark run, and derive its identity.
 *
 * THE SINGLE PLACE a run configuration is decided. The schema beside this file
 * (`run-manifest.schema.json`) says what a run must record; this says what the
 * values are. Everything else - the workflow planner, both arms, the merger,
 * the tests - calls in here rather than reading the environment itself.
 *
 * That matters because the alternative was already tried and already failed.
 * The knobs used to be read wherever they were needed: `MAX_WORDS_A_CHUNK` in
 * two harness scripts, `ORT_THREADS` hardcoded in the workflow, `MAX_ITEMS`
 * hardcoded on one arm and absent from the other. No file held the whole set,
 * so no manifest could record it, so no two readings could be compared. One
 * resolver is the fix, and the derived slug is what makes the fix checkable:
 * if the slug is computed from the config by the only function that can compute
 * it, a slug cannot lie about the run it names.
 *
 * Usage as a module:
 *   import { resolveRunConfig } from "./run-config.mjs";
 *
 * Usage as a command, which is how the Python arm and the tests reach it:
 *   node run-config.mjs            -> the resolved config as JSON on stdout
 */

import { pathToFileURL } from "node:url";

/** Every knob, in the order the slug writes them. Adding one here is the only
    way to add one at all: the schema closes `run.config`, so a knob that is not
    in this list fails validation rather than producing an unattributable
    number. */
export const KNOBS = ["maxWordsAChunk", "repeats", "threads", "maxItems", "shards"];

function wholeNumber(name, raw, fallback, { minimum = 0 } = {}) {
  const text = String(raw ?? "").trim();
  if (text === "") return fallback;
  const value = Number(text);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be a whole number of at least ${minimum}, got "${text}"`);
  }
  return value;
}

/**
 * Flatten a config into a filename-safe string, in a fixed order.
 *
 * `t0` is written `auto` and `i0` is written `all` because both zeros mean "no
 * limit" rather than "zero", and a reader should not have to know that. The
 * pattern this produces is pinned in the schema, so a change here that the
 * schema does not know about fails the contract test.
 */
export function slugFor(config) {
  return [
    `c${config.maxWordsAChunk}`,
    `r${config.repeats}`,
    `t${config.threads || "auto"}`,
    `i${config.maxItems || "all"}`,
    `s${config.shards}`,
  ].join("-");
}

/**
 * Read the environment into a complete, validated run configuration.
 *
 * `spec` is the model's row from voices.config.json. A model may carry its own
 * `maxItems` ceiling - an autoregressive model on a CPU will not finish the
 * corpus inside the job cap - and an explicit MAX_ITEMS overrides it, so an
 * operator can always ask for the whole corpus and watch it fail honestly.
 */
export function resolveRunConfig(environment = process.env, spec = {}) {
  const config = {
    maxWordsAChunk: wholeNumber("MAX_WORDS_A_CHUNK", environment.MAX_WORDS_A_CHUNK, 40, { minimum: 1 }),
    repeats: wholeNumber("REPEATS", environment.REPEATS, 1, { minimum: 1 }),
    /* 0 is legal and distinct: it means the runtime picks, which is not the
       same configuration as an explicit 4 even on a 4-vCPU box. */
    threads: wholeNumber("THREADS", environment.THREADS, 4),
    maxItems: wholeNumber("MAX_ITEMS", environment.MAX_ITEMS, Number(spec.maxItems ?? 0)),
    shards: wholeNumber("SHARDS", environment.SHARDS, 1, { minimum: 1 }),
  };

  const model = String(environment.MODEL ?? spec.id ?? "").trim();
  if (!model) throw new Error("MODEL is required: a run measures exactly one model");
  if (model.includes(",")) {
    throw new Error(
      `MODEL must name exactly one model, got "${model}". A run measures one model at one ` +
        `config so its readings are not polluted by another model's; use the sweep to measure several.`,
    );
  }

  const configSlug = slugFor(config);

  /* Isolation is asserted by whoever dispatched the run, never inferred here. A
     process cannot see the other twenty-seven jobs it is contending with, so
     guessing would produce exactly the false confidence the field exists to
     prevent. Absent the assertion, a run is NOT isolated. */
  const isolated = String(environment.RUN_ISOLATED ?? "").toLowerCase() === "true";
  const notIsolatedBecause = isolated
    ? undefined
    : (environment.NOT_ISOLATED_BECAUSE ?? "").trim() ||
      "the dispatcher did not assert isolation, so this run may have been voicing " +
        "alongside others and its wall clock may not be compared against the job cap";

  const run = {
    runId: `${model}__${configSlug}`,
    model,
    configSlug,
    isolated,
    config,
  };
  if (!isolated) run.notIsolatedBecause = notIsolatedBecause;
  if ((environment.NOTES ?? "").trim()) run.notes = environment.NOTES.trim();

  const dispatch = {
    workflow: environment.GITHUB_WORKFLOW,
    runId: environment.GITHUB_RUN_ID,
    runNumber: environment.GITHUB_RUN_NUMBER ? Number(environment.GITHUB_RUN_NUMBER) : undefined,
    runAttempt: environment.GITHUB_RUN_ATTEMPT ? Number(environment.GITHUB_RUN_ATTEMPT) : undefined,
    url:
      environment.GITHUB_SERVER_URL && environment.GITHUB_REPOSITORY && environment.GITHUB_RUN_ID
        ? `${environment.GITHUB_SERVER_URL}/${environment.GITHUB_REPOSITORY}/actions/runs/${environment.GITHUB_RUN_ID}`
        : undefined,
    sha: environment.GITHUB_SHA,
    ref: environment.GITHUB_REF_NAME,
  };
  const dispatched = Object.fromEntries(Object.entries(dispatch).filter(([, v]) => v !== undefined));
  if (Object.keys(dispatched).length) run.dispatch = dispatched;

  return run;
}

/** Which shard of the fan-out this process is, checked against the total. */
export function resolveShard(environment = process.env, shards = 1) {
  const index = wholeNumber("SHARD_INDEX", environment.SHARD_INDEX, 0);
  if (index >= shards) {
    throw new Error(`SHARD_INDEX ${index} is outside a fan-out of ${shards}`);
  }
  return index;
}

/**
 * The run block for THIS process, resolved once per run rather than once per job.
 *
 * In CI the planner resolves the configuration before any arm starts and hands
 * the finished block down as `RUN_JSON`. Every shard then records byte-identical
 * provenance, which is what lets the merger refuse a mismatch meaningfully: if
 * each shard re-read the environment, a workflow edit between two jobs would
 * produce two honest but different answers and neither would be wrong.
 *
 * Off CI there is no planner, so the environment is resolved directly. Both
 * paths run the same function; only the moment differs.
 */
export function runForThisProcess(environment = process.env, spec = {}) {
  const handed = (environment.RUN_JSON ?? "").trim();
  if (!handed) return resolveRunConfig(environment, spec);

  let run;
  try {
    run = JSON.parse(handed);
  } catch (error) {
    throw new Error(`RUN_JSON is not valid JSON: ${error.message}`);
  }
  for (const key of ["runId", "model", "configSlug", "config"]) {
    if (run[key] === undefined) throw new Error(`RUN_JSON is missing "${key}"`);
  }
  const missing = KNOBS.filter((knob) => run.config[knob] === undefined);
  if (missing.length) throw new Error(`RUN_JSON config is missing: ${missing.join(", ")}`);
  /* The slug is the run's identity, so a handed-down block that disagrees with
     its own knobs is refused rather than recorded. */
  const derived = slugFor(run.config);
  if (derived !== run.configSlug) {
    throw new Error(`RUN_JSON slug "${run.configSlug}" does not match its config, which derives "${derived}"`);
  }
  return run;
}

/* Run as a command rather than imported. `pathToFileURL` rather than a string
   template: on Windows the naive form builds `file://C:/...` against an actual
   `file:///C:/...` and the block never fires, so the CLI silently prints
   nothing and every caller gets an empty parse. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(resolveRunConfig(), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
