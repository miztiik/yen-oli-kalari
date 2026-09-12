/**
 * Generate audio clips from the sample corpus so a person can listen to them.
 *
 * The speed harness in ../onnx-runtime-comparison measures how fast a model
 * runs and then throws the audio away. Speed is not quality, and nothing in
 * this project can yet say whether a voice is good enough to publish. This
 * script keeps the audio, beside the text it was made from, so the judgement
 * can be made by a person with headphones on.
 *
 * It writes one WAV a summary, plus a manifest pairing each clip with its
 * source text - which is the thing a listener has to check against.
 *
 * Usage:
 *   npm install
 *   npm run build-clips
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

const CORPUS_PATH = new URL(CORPUS_PATHS[CORPUS], import.meta.url);
const CLIP_DIR = fileURLToPath(new URL("./clips/", import.meta.url));
const MANIFEST_PATH = fileURLToPath(new URL("./clips/manifest.json", import.meta.url));

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
mkdirSync(CLIP_DIR, { recursive: true });

/* Sharding, so a day can be split across runners. Every summary is independent,
   so N shards cut wall clock by N - a shard is a whole runner with its own 4
   vCPU, not a slice of one machine's cores.

   Round-robin rather than contiguous blocks: the corpus is sorted by length, so
   giving shard 0 the first quarter would hand it every short summary and shard
   3 every long one, and the shards would finish at wildly different times. The
   run costs its slowest shard, so balance is the whole point. */
const SHARD_INDEX = Number(process.env.SHARD_INDEX ?? 0);
const SHARD_TOTAL = Number(process.env.SHARD_TOTAL ?? 1);
const REPEATS = Number(process.env.REPEATS ?? 1);

const slice = corpus.summaries.filter((_, i) => i % SHARD_TOTAL === SHARD_INDEX);

console.log(`model ${MODEL_ID} (${QUANTISATION})   voice ${VOICE}   corpus ${CORPUS}`);
if (SHARD_TOTAL > 1) {
  console.log(`shard ${SHARD_INDEX} of ${SHARD_TOTAL}: ${slice.length} of ${corpus.summaries.length} summaries`);
}
console.log(`${slice.reduce((s, x) => s + x.words, 0)} words, ${REPEATS} repeat(s)\n`);

const tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: QUANTISATION, device: "cpu" });

const entries = [];
for (const sample of slice) {
  const chunks = splitIntoChunks(sample.text, MAX_WORDS_A_CHUNK);

  /* Repeats give the spread. A GitHub runner is shared hardware, so one reading
     is a single sample of a noisy process - the 2026-09-12 record names the
     absence of spread as its own first limitation. The audio is kept from the
     last repeat because every repeat produces identical audio (the model is
     deterministic); only the clock differs. */
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

  const samples = concatenateSamples(pieces);
  const audioSeconds = samples.length / SAMPLE_RATE;
  const fileName = `${sample.id}.wav`;
  writeFileSync(`${CLIP_DIR}${fileName}`, encodeWav(samples, SAMPLE_RATE));

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
    chunkBoundaries: chunks.slice(0, -1).map((c) => c.slice(-40)),
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

const manifest = {
  schemaVersion: "2026-09-12",
  generatedAt: new Date().toISOString(),
  model: `${MODEL_ID} (${QUANTISATION})`,
  corpus: { name: CORPUS, sampledFrom: corpus.sampledFrom ?? null, note: corpus.note ?? null },
  shard: { index: SHARD_INDEX, total: SHARD_TOTAL, repeats: REPEATS },
  voice: VOICE,
  sampleRate: SAMPLE_RATE,
  maxWordsAChunk: MAX_WORDS_A_CHUNK,
  /* The host is part of the reading, not a footnote. Audio duration and
     speaking pace are host-independent because the model is deterministic, but
     wall clock is not: measured 2026-09-12 the same corpus ran at a real-time
     factor of 2.576 on a laptop and 1.0112 on the CI runner. A manifest that
     did not name its host would let a laptop timing be read against the
     runner's budget, which is how a design gets priced on the wrong number. */
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
    words: entries.reduce((s, e) => s + e.words, 0),
    audioSeconds: Number(entries.reduce((s, e) => s + e.audioSeconds, 0).toFixed(2)),
    bytes: entries.reduce((s, e) => s + e.bytes, 0),
  },
  clips: entries,
};
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`\nwrote ${entries.length} clips and manifest.json`);
console.log(
  `${manifest.totals.audioSeconds}s of audio, ` +
    `${(manifest.totals.bytes / 1024 / 1024).toFixed(1)} MB as WAV`,
);
