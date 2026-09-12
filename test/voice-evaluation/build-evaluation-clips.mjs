/**
 * Voice a corpus with one model at one quantisation, and keep the audio.
 *
 * The speed harness in ../onnx-runtime-comparison measures how fast a model
 * runs and then throws the audio away. Speed is not quality, and nothing in
 * this project can yet say whether a voice is good enough to publish. This
 * script keeps the audio, beside the text it was made from, so the judgement
 * can be made by a person with headphones on.
 *
 * Results are written per model and per quantisation, so a second run never
 * overwrites a first. That is the point: two models cannot be compared if only
 * the most recent one survives.
 *
 *   results/<model-slug>/<quantisation>/
 *     manifest.json
 *     <clip-id>.wav
 *
 * Usage:
 *   npm run build-clips
 *   MODEL_ID=... QUANTISATION=fp32 npm run build-clips
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cpus, totalmem, platform, arch } from "node:os";
import { KokoroTTS } from "kokoro-js";
import { splitIntoChunks } from "../../backend/utilities/measurement-recorder.mjs";

const MODEL_ID = process.env.MODEL_ID ?? "onnx-community/Kokoro-82M-v1.0-ONNX";
const QUANTISATION = process.env.QUANTISATION ?? "q8";
const VOICE = process.env.VOICE ?? "af_heart";
const MAX_WORDS_A_CHUNK = Number(process.env.MAX_WORDS_A_CHUNK ?? 40);
const SAMPLE_RATE = 24000;

/* Which corpus to voice. `real` is summaries pulled off the published site by
   ../onnx-runtime-comparison/build-real-corpus.mjs and is the one that matters:
   a hand-picked sample can quietly avoid the tickers, currency amounts and
   acronyms that are exactly what a news voice gets wrong. `sample` is the
   earlier hand-picked set, kept so an old reading can be reproduced. */
const CORPUS = process.env.CORPUS ?? "real";
const CORPUS_PATHS = {
  real: "../onnx-runtime-comparison/real-summaries/summaries.json",
  sample: "../onnx-runtime-comparison/sample-summaries/summaries.json",
};
if (!CORPUS_PATHS[CORPUS]) {
  console.error(`unknown CORPUS "${CORPUS}" - expected one of: ${Object.keys(CORPUS_PATHS).join(", ")}`);
  process.exit(1);
}

/** A directory name from a model id: `onnx-community/Kokoro-82M-v1.0-ONNX` -> `kokoro-82m-v1-0-onnx`. */
function slugify(modelId) {
  return modelId.split("/").pop().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const MODEL_SLUG = slugify(MODEL_ID);
const CORPUS_PATH = new URL(CORPUS_PATHS[CORPUS], import.meta.url);
const RESULT_DIR = fileURLToPath(new URL(`./results/${MODEL_SLUG}/${QUANTISATION}/`, import.meta.url));

/** Write mono 16-bit PCM samples as a WAV file a browser can play. */
function encodeWav(samples, sampleRate) {
  const bytesASample = 2;
  const buffer = Buffer.alloc(44 + samples.length * bytesASample);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples.length * bytesASample, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
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

function concatenateSamples(pieces) {
  const total = pieces.reduce((sum, p) => sum + p.length, 0);
  const joined = new Float32Array(total);
  let offset = 0;
  for (const piece of pieces) {
    joined.set(piece, offset);
    offset += piece.length;
  }
  return joined;
}

const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));
mkdirSync(RESULT_DIR, { recursive: true });

/* Sharding, so a day can be split across runners. Every summary is independent,
   so N shards cut wall clock by N - a shard is a whole runner with its own 4
   vCPU, not a slice of one machine's cores. Round-robin rather than contiguous
   blocks, because the corpus is sorted by length and the run costs its slowest
   shard. */
const SHARD_INDEX = Number(process.env.SHARD_INDEX ?? 0);
const SHARD_TOTAL = Number(process.env.SHARD_TOTAL ?? 1);
const REPEATS = Number(process.env.REPEATS ?? 1);

const slice = corpus.summaries.filter((_, i) => i % SHARD_TOTAL === SHARD_INDEX);

console.log(`model ${MODEL_ID} (${QUANTISATION})   voice ${VOICE}   corpus ${CORPUS}`);
console.log(`writing results/${MODEL_SLUG}/${QUANTISATION}/`);
if (SHARD_TOTAL > 1) {
  console.log(`shard ${SHARD_INDEX} of ${SHARD_TOTAL}: ${slice.length} of ${corpus.summaries.length} summaries`);
}
console.log(`${slice.reduce((s, x) => s + x.words, 0)} words, ${REPEATS} repeat(s)\n`);

const modelLoadStarted = Date.now();
const tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: QUANTISATION, device: "cpu" });
const modelLoadMs = Date.now() - modelLoadStarted;

const entries = [];
for (const sample of slice) {
  const chunks = splitIntoChunks(sample.text, MAX_WORDS_A_CHUNK);

  /* Repeats give the spread. A GitHub runner is shared hardware, so one reading
     is a single sample of a noisy process. The audio is kept from the last
     repeat because every repeat produces identical audio - the model is
     deterministic; only the clock differs. */
  const wallClocks = [];
  let pieces = [];
  for (let repeat = 0; repeat < REPEATS; repeat += 1) {
    const startedMs = Date.now();
    pieces = [];
    for (const chunk of chunks) {
      const audio = await tts.generate(chunk, { voice: VOICE });
      pieces.push(audio.audio ?? audio.data);
    }
    wallClocks.push(Date.now() - startedMs);
  }

  /* Where each chunk starts in the finished clip, in seconds. This is EXACT and
     costs nothing: every chunk is its own inference call, so its sample count
     is known before the pieces are joined. It is what makes follow-the-text
     highlighting possible at all - the ONNX export publishes `waveform` as its
     only output, so the duration predictor inside the graph cannot be reached,
     and word-level timing would need the model re-exported from PyTorch with
     `pred_dur` as a second output. Within a chunk the page interpolates by
     character position, and says on screen that it is doing so. */
  const chunkTimings = [];
  let runningSamples = 0;
  for (let i = 0; i < chunks.length; i += 1) {
    chunkTimings.push({
      text: chunks[i],
      startSeconds: Number((runningSamples / SAMPLE_RATE).toFixed(3)),
      endSeconds: Number(((runningSamples + pieces[i].length) / SAMPLE_RATE).toFixed(3)),
    });
    runningSamples += pieces[i].length;
  }

  const samples = concatenateSamples(pieces);
  const audioSeconds = samples.length / SAMPLE_RATE;
  const fileName = `${sample.id}.wav`;
  writeFileSync(`${RESULT_DIR}${fileName}`, encodeWav(samples, SAMPLE_RATE));

  const sortedClocks = [...wallClocks].sort((a, b) => a - b);
  const medianWallClockMs = sortedClocks[Math.floor(sortedClocks.length / 2)];

  entries.push({
    id: sample.id,
    text: sample.text,
    words: sample.words,
    hazards: sample.hazards ?? [],
    sourceName: sample.sourceName ?? null,
    vertical: sample.vertical ?? null,
    clip: fileName,
    chunks: chunks.length,
    chunkTimings,
    audioSeconds: Number(audioSeconds.toFixed(2)),
    wallClockMs: medianWallClockMs,
    wallClockRepeatsMs: wallClocks,
    realTimeFactor: Number((medianWallClockMs / 1000 / audioSeconds).toFixed(3)),
    wordsAMinute: Number(((sample.words / audioSeconds) * 60).toFixed(1)),
    bytes: 44 + samples.length * 2,
  });

  const spread =
    REPEATS > 1
      ? `  (${Math.min(...wallClocks) / 1000}-${Math.max(...wallClocks) / 1000}s over ${REPEATS})`
      : "";
  console.log(
    `  ${sample.id}  ${String(sample.words).padStart(4)} words  ` +
      `${String(chunks.length).padStart(2)} chunk(s)  ${audioSeconds.toFixed(1)}s  -> ${fileName}${spread}`,
  );
}

const audioSeconds = entries.reduce((s, e) => s + e.audioSeconds, 0);
const words = entries.reduce((s, e) => s + e.words, 0);
const wallSeconds = entries.reduce((s, e) => s + e.wallClockMs, 0) / 1000;

const manifest = {
  schemaVersion: "2026-09-13",
  generatedAt: new Date().toISOString(),
  modelId: MODEL_ID,
  modelSlug: MODEL_SLUG,
  quantisation: QUANTISATION,
  model: `${MODEL_ID} (${QUANTISATION})`,
  voice: VOICE,
  sampleRate: SAMPLE_RATE,
  maxWordsAChunk: MAX_WORDS_A_CHUNK,
  corpus: { name: CORPUS, sampledFrom: corpus.sampledFrom ?? null, note: corpus.note ?? null },
  shard: { index: SHARD_INDEX, total: SHARD_TOTAL, repeats: REPEATS },
  modelLoadMs,
  /* The host is part of the reading, not a footnote. Audio duration and
     speaking pace are host-independent because the model is deterministic; wall
     clock is not. Measured 2026-09-12 the same corpus ran at a real-time factor
     of 2.576 on a laptop and 1.0112 on the CI runner. */
  host: {
    isCi: Boolean(process.env.CI),
    platform: platform(),
    arch: arch(),
    cpuModel: cpus()[0]?.model?.trim() ?? "unknown",
    cpuCount: cpus().length,
    totalMemoryGb: Number((totalmem() / 1024 ** 3).toFixed(1)),
    nodeVersion: process.version,
  },
  totals: {
    clipCount: entries.length,
    words,
    audioSeconds: Number(audioSeconds.toFixed(2)),
    wallSeconds: Number(wallSeconds.toFixed(1)),
    realTimeFactor: Number((wallSeconds / audioSeconds).toFixed(4)),
    wordsAMinute: Number(((words / audioSeconds) * 60).toFixed(1)),
    bytes: entries.reduce((s, e) => s + e.bytes, 0),
  },
  clips: entries,
};
writeFileSync(`${RESULT_DIR}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`\nwrote ${entries.length} clips and manifest.json`);
console.log(
  `${manifest.totals.audioSeconds}s of audio, ` +
    `${(manifest.totals.bytes / 1024 / 1024).toFixed(1)} MB as WAV, ` +
    `RTF ${manifest.totals.realTimeFactor}, ${manifest.totals.wordsAMinute} wpm`,
);
