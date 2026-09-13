/**
 * Split the publishable models into the two runtimes that need different
 * toolchains on the runner.
 *
 * PUBLISHING IS NOT BENCHMARKING, and this is the file where that distinction
 * lives. The benchmark measures one model at one configuration with nothing
 * else voicing, because a wall clock taken beside twenty-seven other jobs is
 * not a property of a model. Publishing has the opposite requirement: it wants
 * audio on a page, the audio is deterministic, and six models one after another
 * would cost two hours for a result identical to the parallel one.
 *
 * So this planner still fans out over a model LIST, and every manifest it
 * produces is stamped `run.isolated: false`. Nothing downstream will price the
 * design on those figures: the collator refuses to draw the job-cap table for
 * an unisolated reading, and the page labels it.
 *
 * The benchmark's planner is `plan-run.mjs`, and it takes exactly one model.
 */

import { readFileSync, appendFileSync } from "node:fs";

const config = JSON.parse(
  readFileSync(new URL("../../test/voice-evaluation/voices.config.json", import.meta.url), "utf8"),
);

const NODE_RUNTIMES = new Set(["kokoro-js", "transformers.js"]);
const PYTHON_RUNTIMES = new Set(["onnxruntime-python"]);

const wanted = (process.env.WANTED ?? "all").trim();
const filter =
  wanted === "all" || wanted === ""
    ? () => true
    : ((set) => (id) => set.has(id))(new Set(wanted.split(",").map((s) => s.trim())));

const enabled = config.models.filter((m) => m.enabled && filter(m.id));
const node = enabled.filter((m) => NODE_RUNTIMES.has(m.runtime)).map((m) => m.id);
const python = enabled.filter((m) => PYTHON_RUNTIMES.has(m.runtime)).map((m) => m.id);

if (node.length === 0 && python.length === 0) {
  console.error(`no enabled model matched "${wanted}"`);
  console.error(
    `configured and enabled: ${config.models.filter((m) => m.enabled).map((m) => m.id).join(", ")}`,
  );
  process.exit(1);
}

appendFileSync(process.env.GITHUB_OUTPUT, `node=${JSON.stringify(node)}\n`);
appendFileSync(process.env.GITHUB_OUTPUT, `python=${JSON.stringify(python)}\n`);

console.log(`node arms   (${node.length}): ${node.join(", ") || "-"}`);
console.log(`python arms (${python.length}): ${python.join(", ") || "-"}`);
console.log(
  `\nThese voice in parallel, so their wall clocks carry each other's contention.\n` +
    `Every manifest is stamped isolated:false. A comparable figure comes from\n` +
    `benchmark-voice.yml, which measures one model at one config, alone.`,
);

const blocked = config.models.filter((m) => !m.enabled);
if (blocked.length) {
  console.log(`\nnot published, and why:`);
  for (const m of blocked) console.log(`  ${m.id.padEnd(24)} ${m.blocked ?? "disabled"}`);
}
