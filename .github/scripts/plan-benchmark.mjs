/**
 * Split the configured models into the two runtimes that need different
 * toolchains on the runner, and write both lists as job outputs.
 *
 * A file rather than an inline `run:` block, because the same logic embedded in
 * YAML had to survive three levels of quoting and lost an environment variable
 * doing it. A matrix that silently comes back empty is worse than one that
 * fails, because the run goes green having measured nothing.
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
  console.error(`configured and enabled: ${config.models.filter((m) => m.enabled).map((m) => m.id).join(", ")}`);
  process.exit(1);
}

appendFileSync(process.env.GITHUB_OUTPUT, `node=${JSON.stringify(node)}\n`);
appendFileSync(process.env.GITHUB_OUTPUT, `python=${JSON.stringify(python)}\n`);

/* A shard is a whole runner with its own 4 vCPU, not a slice of one machine's
   cores. Fanning a model across four of them cuts elapsed time roughly fourfold
   while every real-time factor stays a reading from the same hardware, because
   each shard voices its slice alone. */
const shardTotal = Math.max(1, Number(process.env.SHARDS ?? 1));
const shards = Array.from({ length: shardTotal }, (_, i) => i);
appendFileSync(process.env.GITHUB_OUTPUT, `shards=${JSON.stringify(shards)}\n`);
appendFileSync(process.env.GITHUB_OUTPUT, `shardTotal=${shardTotal}\n`);

console.log(`node arms   (${node.length}): ${node.join(", ") || "-"}`);
console.log(`python arms (${python.length}): ${python.join(", ") || "-"}`);
console.log(
  `shards per model: ${shardTotal}` +
    (shardTotal > 1 ? ` -> ${(node.length + python.length) * shardTotal} jobs` : ""),
);

const blocked = config.models.filter((m) => !m.enabled);
if (blocked.length) {
  console.log(`\nnot run, and why:`);
  for (const m of blocked) console.log(`  ${m.id.padEnd(24)} ${m.blocked ?? "disabled"}`);
}
