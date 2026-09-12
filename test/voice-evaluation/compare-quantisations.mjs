/**
 * Compare quantisations of one model on the same corpus and machine.
 *
 * Two independent sources report int8/q8 degrading StyleTTS2-family models -
 * KittenTTS ships an int8 build with known open issues, and the LiteRT port
 * rejected int8 at log-mel correlation 0.913 with altered durations. Kokoro is
 * the same family, and this project has been measuring q8 without ever checking
 * it against fp32.
 *
 * The speed question is the sharper one. This project measured Kokoro q8 at a
 * real-time factor of 1.0112 on the runner, while comparable compact models
 * publish 0.03 to 0.25 on similar CPU thread counts. If q8 is costing rather
 * than saving, the incumbent is several times faster than anyone here believes.
 * Quantised integer paths are not always faster on a CPU: they can add
 * dequantise work on a machine whose float units were never the bottleneck.
 *
 * A ratio between two quantisations on ONE machine transfers where an absolute
 * figure does not, which is what makes this worth running off the runner.
 *
 * Usage:
 *   node compare-quantisations.mjs
 *   QUANTISATIONS=fp32,q8,q4 SAMPLES=6 node compare-quantisations.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cpus, totalmem, platform, arch } from "node:os";
import { KokoroTTS } from "kokoro-js";
import { splitIntoChunks } from "../../backend/utilities/measurement-recorder.mjs";

const MODEL_ID = process.env.MODEL_ID ?? "onnx-community/Kokoro-82M-v1.0-ONNX";
const VOICE = process.env.VOICE ?? "af_heart";
const MAX_WORDS_A_CHUNK = Number(process.env.MAX_WORDS_A_CHUNK ?? 40);
const SAMPLE_RATE = 24000;
const QUANTISATIONS = (process.env.QUANTISATIONS ?? "fp32,q8").split(",");
const SAMPLES = Number(process.env.SAMPLES ?? 6);
const REPEATS = Number(process.env.REPEATS ?? 2);

const CORPUS_PATH = new URL("../onnx-runtime-comparison/real-summaries/summaries.json", import.meta.url);
const OUT_DIR = fileURLToPath(new URL("../onnx-runtime-comparison/measurements/", import.meta.url));

const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));

/* Step across the length distribution rather than taking the first N: the fixed
   cost of a chunk is what makes a short summary expensive, so a sample of one
   length would hide the thing most likely to differ between quantisations. */
const step = corpus.summaries.length / SAMPLES;
const slice = Array.from({ length: SAMPLES }, (_, i) => corpus.summaries[Math.floor(i * step)]);

console.log(`model ${MODEL_ID}   voice ${VOICE}`);
console.log(`${slice.length} summaries, ${slice.reduce((s, x) => s + x.words, 0)} words, ${REPEATS} repeat(s)`);
console.log(`comparing: ${QUANTISATIONS.join(", ")}\n`);

const results = [];

for (const dtype of QUANTISATIONS) {
  process.stdout.write(`  ${dtype.padEnd(6)} loading... `);
  const loadStarted = Date.now();
  let tts;
  try {
    tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype, device: "cpu" });
  } catch (error) {
    console.log(`FAILED: ${error.message}`);
    results.push({ dtype, failed: String(error.message) });
    continue;
  }
  const loadMs = Date.now() - loadStarted;

  let audioSeconds = 0;
  let words = 0;
  const wallClocks = [];
  const perClip = [];

  for (const sample of slice) {
    const chunks = splitIntoChunks(sample.text, MAX_WORDS_A_CHUNK);
    const clocks = [];
    let totalSamples = 0;
    for (let repeat = 0; repeat < REPEATS; repeat += 1) {
      const startedMs = Date.now();
      totalSamples = 0;
      for (const chunk of chunks) {
        const audio = await tts.generate(chunk, { voice: VOICE });
        totalSamples += (audio.audio ?? audio.data).length;
      }
      clocks.push(Date.now() - startedMs);
    }
    const median = [...clocks].sort((a, b) => a - b)[Math.floor(clocks.length / 2)];
    const seconds = totalSamples / SAMPLE_RATE;
    audioSeconds += seconds;
    words += sample.words;
    wallClocks.push(median);
    perClip.push({ id: sample.id, words: sample.words, audioSeconds: Number(seconds.toFixed(2)), wallClockMs: median });
  }

  const wallSeconds = wallClocks.reduce((s, x) => s + x, 0) / 1000;
  const rtf = wallSeconds / audioSeconds;
  const wpm = (words / audioSeconds) * 60;

  results.push({
    dtype,
    loadMs,
    audioSeconds: Number(audioSeconds.toFixed(2)),
    wallSeconds: Number(wallSeconds.toFixed(1)),
    realTimeFactor: Number(rtf.toFixed(4)),
    wordsAMinute: Number(wpm.toFixed(1)),
    perClip,
  });

  console.log(
    `load ${(loadMs / 1000).toFixed(1)}s   ` +
      `RTF ${rtf.toFixed(4)}   ${audioSeconds.toFixed(1)}s audio in ${wallSeconds.toFixed(1)}s   ` +
      `${wpm.toFixed(1)} wpm`,
  );
}

const ok = results.filter((r) => !r.failed);
const fastest = ok.length ? ok.reduce((a, b) => (a.realTimeFactor < b.realTimeFactor ? a : b)) : null;

console.log("\n--- relative speed ---");
for (const r of ok) {
  const ratio = r.realTimeFactor / fastest.realTimeFactor;
  console.log(
    `  ${r.dtype.padEnd(6)} RTF ${r.realTimeFactor.toFixed(4)}  ` +
      `${ratio === 1 ? "fastest" : `${ratio.toFixed(2)}x slower than ${fastest.dtype}`}`,
  );
}

/* Audio duration is deterministic for a given model, so any difference in it
   across quantisations is the quantisation changing the output rather than the
   clock - which is the quality signal, not a timing artefact. */
console.log("\n--- audio duration, which should be identical if quality is untouched ---");
for (const r of ok) {
  const delta = ((r.audioSeconds - ok[0].audioSeconds) / ok[0].audioSeconds) * 100;
  console.log(
    `  ${r.dtype.padEnd(6)} ${r.audioSeconds.toFixed(2)}s  ` +
      `${Math.abs(delta) < 0.01 ? "identical" : `${delta > 0 ? "+" : ""}${delta.toFixed(2)}% vs ${ok[0].dtype}`}`,
  );
}

mkdirSync(OUT_DIR, { recursive: true });
const outPath = `${OUT_DIR}quantisation-comparison-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      schemaVersion: "2026-09-12",
      generatedAt: new Date().toISOString(),
      model: MODEL_ID,
      voice: VOICE,
      corpus: corpus.sampledFrom,
      samples: slice.length,
      repeats: REPEATS,
      host: {
        isCi: Boolean(process.env.CI),
        platform: platform(),
        arch: arch(),
        cpuModel: cpus()[0]?.model?.trim() ?? "unknown",
        cpuCount: cpus().length,
        totalMemoryGb: Number((totalmem() / 1024 ** 3).toFixed(1)),
        nodeVersion: process.version,
      },
      results,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
console.log(`\nwrote ${outPath}`);
