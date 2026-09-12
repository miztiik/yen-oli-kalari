/**
 * Benchmark one model against the corpus and the verbalization suite.
 *
 * Runs on the CI runner, never locally - a wall clock read on a developer
 * machine may not be compared against the job cap, and the same corpus measured
 * 2.576 on a laptop against 1.0112 on the runner.
 *
 * Two corpora, two purposes:
 *
 *   real summaries      how fast, how steady, how it drifts over a long read
 *   verbalization suite whether it says the right words - currency, quarters,
 *                       tickers, Roman numerals, names - each case carrying the
 *                       exact spoken form a competent newsreader would produce
 *
 * The suite is voiced but NOT graded here. Grading needs an ASR pass, which is
 * a separate job with its own dependencies; this writes the audio and the
 * expected forms side by side so that job has something to read.
 *
 * Usage:
 *   MODEL=kokoro-fp32 node benchmark-model.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cpus, totalmem, platform, arch } from "node:os";
import { adapterFor, enabledModels } from "./adapters.mjs";
import { summariseRun } from "./metrics.mjs";
import { splitIntoChunks } from "../../backend/utilities/measurement-recorder.mjs";

const MODEL = process.env.MODEL;
const MAX_WORDS_A_CHUNK = Number(process.env.MAX_WORDS_A_CHUNK ?? 40);
const REPEATS = Number(process.env.REPEATS ?? 1);

if (!MODEL) {
  console.error(`MODEL must be one of: ${enabledModels().join(", ")}`);
  process.exit(1);
}

const CORPUS_PATH = new URL("../onnx-runtime-comparison/real-summaries/summaries.json", import.meta.url);
const SUITE_PATH = new URL("../onnx-runtime-comparison/verbalization-suite.json", import.meta.url);
const RESULT_DIR = fileURLToPath(new URL(`./results/${MODEL}/`, import.meta.url));

function encodeWav(samples, sampleRate) {
  const bytesASample = 2;
  const buffer = Buffer.alloc(44 + samples.length * bytesASample);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples.length * bytesASample, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesASample, 28);
  buffer.writeUInt16LE(bytesASample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * bytesASample, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * bytesASample);
  }
  return buffer;
}

function concatenate(pieces) {
  const total = pieces.reduce((sum, p) => sum + p.length, 0);
  const joined = new Float32Array(total);
  let offset = 0;
  for (const piece of pieces) {
    joined.set(piece, offset);
    offset += piece.length;
  }
  return joined;
}

/** Peak resident memory, which decides whether a model is deployable at all. */
function peakMemoryMb() {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));
const suite = JSON.parse(readFileSync(SUITE_PATH, "utf8"));

mkdirSync(`${RESULT_DIR}summaries/`, { recursive: true });
mkdirSync(`${RESULT_DIR}verbalization/`, { recursive: true });

let adapter;
try {
  adapter = adapterFor(MODEL);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(`model ${MODEL}`);
console.log(`  runtime ${adapter.runtime}   weights ${adapter.modelId} (${adapter.dtype})`);
console.log(`  voice ${adapter.voice}   accent ${adapter.accent}${adapter.accentKnown ? "" : " (unverified)"}`);

const loadStarted = Date.now();
await adapter.load();
const modelLoadMs = Date.now() - loadStarted;
console.log(`  loaded in ${(modelLoadMs / 1000).toFixed(1)}s\n`);

let peakMb = peakMemoryMb();

/** Voice one text, chunked, returning samples plus exact per-chunk timings. */
async function voice(text) {
  const chunks = splitIntoChunks(text, MAX_WORDS_A_CHUNK);
  const clocks = [];
  let pieces = [];
  let sampleRate = 24000;

  for (let repeat = 0; repeat < REPEATS; repeat += 1) {
    const started = Date.now();
    pieces = [];
    for (const chunk of chunks) {
      const spoken = await adapter.speak(chunk);
      pieces.push(spoken.samples);
      sampleRate = spoken.sampleRate;
    }
    clocks.push(Date.now() - started);
    peakMb = Math.max(peakMb, peakMemoryMb());
  }

  const timings = [];
  let running = 0;
  for (let i = 0; i < chunks.length; i += 1) {
    timings.push({
      text: chunks[i],
      startSeconds: Number((running / sampleRate).toFixed(3)),
      endSeconds: Number(((running + pieces[i].length) / sampleRate).toFixed(3)),
    });
    running += pieces[i].length;
  }

  const sorted = [...clocks].sort((a, b) => a - b);
  return {
    samples: concatenate(pieces),
    sampleRate,
    chunks: chunks.length,
    chunkTimings: timings,
    wallClockMs: sorted[Math.floor(sorted.length / 2)],
    wallClockRepeatsMs: clocks,
  };
}

// --- arm one: the real summaries ------------------------------------------

console.log("summaries:");
const clips = [];
for (const sample of corpus.summaries) {
  const out = await voice(sample.text);
  const audioSeconds = out.samples.length / out.sampleRate;
  const fileName = `${sample.id}.wav`;
  writeFileSync(`${RESULT_DIR}summaries/${fileName}`, encodeWav(out.samples, out.sampleRate));

  clips.push({
    id: sample.id,
    text: sample.text,
    words: sample.words,
    hazards: sample.hazards ?? [],
    sourceName: sample.sourceName ?? null,
    vertical: sample.vertical ?? null,
    clip: fileName,
    chunks: out.chunks,
    chunkTimings: out.chunkTimings,
    audioSeconds: Number(audioSeconds.toFixed(2)),
    wallClockMs: out.wallClockMs,
    wallClockRepeatsMs: out.wallClockRepeatsMs,
    realTimeFactor: Number((out.wallClockMs / 1000 / audioSeconds).toFixed(3)),
    wordsAMinute: Number(((sample.words / audioSeconds) * 60).toFixed(1)),
    bytes: 44 + out.samples.length * 2,
  });
  console.log(`  ${sample.id}  ${String(sample.words).padStart(4)}w  ${audioSeconds.toFixed(1)}s`);
}

// --- arm two: the verbalization suite -------------------------------------

/* Voiced, not graded. Grading needs an ASR pass with its own dependencies; this
   writes the audio beside the expected spoken form so that job can read both. */
console.log("\nverbalization suite:");
const cases = [];
for (const testCase of suite.cases) {
  const out = await voice(testCase.text);
  const audioSeconds = out.samples.length / out.sampleRate;
  const fileName = `${testCase.id}.wav`;
  writeFileSync(`${RESULT_DIR}verbalization/${fileName}`, encodeWav(out.samples, out.sampleRate));

  cases.push({
    id: testCase.id,
    category: testCase.category,
    text: testCase.text,
    expectedSpoken: testCase.expectedSpoken,
    acceptableAlternatives: testCase.acceptableAlternatives,
    trap: testCase.trap,
    clip: fileName,
    audioSeconds: Number(audioSeconds.toFixed(2)),
    chunkTimings: out.chunkTimings,
    wallClockMs: out.wallClockMs,
    graded: false,
  });
  console.log(`  ${testCase.id.padEnd(8)} ${testCase.category.padEnd(20)} ${audioSeconds.toFixed(1)}s`);
}

// --- the reading -----------------------------------------------------------

const manifest = {
  schemaVersion: "2026-09-13",
  generatedAt: new Date().toISOString(),
  model: MODEL,
  name: adapter.name,
  modelId: adapter.modelId,
  accent: adapter.accent,
  accentKnown: adapter.accentKnown,
  licence: adapter.licence,
  commercialUse: adapter.commercialUse,
  params: adapter.params,
  architecture: adapter.architecture,
  sizeGb: adapter.sizeGb,
  modelSlug: MODEL,
  quantisation: adapter.dtype,
  runtime: adapter.runtime,
  voice: adapter.voice,
  sampleRate: clips[0]?.sampleRate ?? 24000,
  maxWordsAChunk: MAX_WORDS_A_CHUNK,
  corpus: { name: "real", sampledFrom: corpus.sampledFrom ?? null },
  shard: { index: 0, total: 1, repeats: REPEATS },
  modelLoadMs,
  peakMemoryMb: peakMb,
  host: {
    isCi: Boolean(process.env.CI),
    platform: platform(),
    arch: arch(),
    cpuModel: cpus()[0]?.model?.trim() ?? "unknown",
    cpuCount: cpus().length,
    totalMemoryGb: Number((totalmem() / 1024 ** 3).toFixed(1)),
    nodeVersion: process.version,
  },
  clips,
  verbalization: cases,
};

manifest.totals = {
  clipCount: clips.length,
  words: clips.reduce((s, c) => s + c.words, 0),
  audioSeconds: Number(clips.reduce((s, c) => s + c.audioSeconds, 0).toFixed(2)),
  wallSeconds: Number((clips.reduce((s, c) => s + c.wallClockMs, 0) / 1000).toFixed(1)),
  bytes: clips.reduce((s, c) => s + c.bytes, 0),
};
manifest.totals.realTimeFactor = Number(
  (manifest.totals.wallSeconds / manifest.totals.audioSeconds).toFixed(4),
);
manifest.totals.wordsAMinute = Number(
  ((manifest.totals.words / manifest.totals.audioSeconds) * 60).toFixed(1),
);
manifest.metrics = summariseRun(manifest);

writeFileSync(`${RESULT_DIR}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const m = manifest.metrics;
console.log(`\n--- ${MODEL} ---`);
console.log(`  real-time factor   ${m.realTimeFactor.toFixed(4)}  (${m.speedMultiplier.toFixed(2)}x real time)`);
console.log(`  speaking rate      ${m.speakingRate.toFixed(1)} wpm, +/-${(m.rateStability.coefficientOfVariation * 100).toFixed(1)}%`);
console.log(`  median speed       ${m.medianCharactersASecond.toFixed(1)} char/s`);
console.log(`  long-form drift    ${m.drift ? m.drift.medianDriftPercent.toFixed(1) + "%" : "n/a"}`);
console.log(`  peak memory        ${peakMb} MB`);
console.log(`  model load         ${(modelLoadMs / 1000).toFixed(1)}s`);
