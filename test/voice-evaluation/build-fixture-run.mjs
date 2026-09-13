/**
 * Build a run that looks real enough to check the page against, without a model.
 *
 * The page cannot be checked in a browser without audio, and making real audio
 * needs a 310 MB model, a short path and several minutes. Neither of those is a
 * property of the SURFACE, so this writes a run of synthesised tones instead:
 * real WAV files a browser will play, a real manifest, and a real peak envelope
 * computed by the same code the benchmark uses.
 *
 * It is a development aid for the browser smoke, NOT a benchmark and NOT a
 * fixture any test asserts against. Every figure it writes is invented, so the
 * manifest is stamped `isolated: false` and says so in `notIsolatedBecause` -
 * a file that could be mistaken for a reading is worse than no file.
 *
 * Usage:
 *   node build-fixture-run.mjs
 *   node build-page-index.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RESULT_DIR = fileURLToPath(new URL("./results/fixture-tones/", import.meta.url));
const SAMPLE_RATE = 24000;
const WAVEFORM_BUCKETS = 256;

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

function peaksOf(samples, buckets = WAVEFORM_BUCKETS) {
  const width = Math.floor(samples.length / buckets) || 1;
  const peaks = [];
  for (let b = 0; b < buckets; b += 1) {
    let peak = 0;
    const start = b * width;
    const end = Math.min(samples.length, start + width);
    for (let i = start; i < end; i += 1) {
      const magnitude = Math.abs(samples[i]);
      if (magnitude > peak) peak = magnitude;
    }
    peaks.push(Number(peak.toFixed(2)));
  }
  return peaks;
}

/* Speech-shaped rather than a steady tone: syllable-rate bursts with gaps and a
   varying envelope. A sine wave produces a flat rectangle, which would make the
   waveform look correct no matter how few peaks were sampled - exactly the bug
   this file exists to let somebody see. */
function speechLikeTone(seconds, seed) {
  const total = Math.floor(seconds * SAMPLE_RATE);
  const samples = new Float32Array(total);
  let phase = 0;
  for (let i = 0; i < total; i += 1) {
    const t = i / SAMPLE_RATE;
    const syllable = Math.max(0, Math.sin(t * 2 * Math.PI * (3.4 + (seed % 3) * 0.6)));
    const phrase = 0.55 + 0.45 * Math.sin(t * 2 * Math.PI * 0.11 + seed);
    const breath = t % (4 + (seed % 2)) < 0.35 ? 0.05 : 1;
    const pitch = 110 + 35 * Math.sin(t * 2 * Math.PI * 0.7 + seed);
    phase += (2 * Math.PI * pitch) / SAMPLE_RATE;
    const harmonics = Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase);
    samples[i] = 0.42 * harmonics * Math.pow(syllable, 1.6) * phrase * breath;
  }
  return samples;
}

const TEXTS = [
  "The central bank held its policy rate at 4.25 percent, the ninth meeting without a change.",
  "Shares in the group fell 12 percent after it cut its full-year guidance for the second time.",
  "The agency said the outage began at 02:40 UTC and was resolved within three hours.",
  "Regulators opened a review of the merger, citing overlap in two regional markets.",
  "The report found emissions fell 3.1 percent last year while output rose slightly.",
  "A spokesperson said the terms of the settlement would remain confidential.",
];

mkdirSync(`${RESULT_DIR}summaries/`, { recursive: true });

const clips = [];
let audioSeconds = 0;

TEXTS.forEach((text, index) => {
  const seconds = 9 + (index % 4) * 3.5;
  const samples = speechLikeTone(seconds, index);
  const id = `fix-${String(index + 1).padStart(3, "0")}`;
  writeFileSync(`${RESULT_DIR}summaries/${id}.wav`, encodeWav(samples, SAMPLE_RATE));

  const words = text.split(/\s+/).length;
  const duration = samples.length / SAMPLE_RATE;
  audioSeconds += duration;

  clips.push({
    id,
    text,
    words,
    hazards: index % 2 === 0 ? ["percent", "bigNumber"] : ["date"],
    sourceName: ["Reuters", "The Hindu BusinessLine", "Le Monde English"][index % 3],
    clip: `${id}.wav`,
    chunks: 1,
    chunkTimings: [{ text, startSeconds: 0, endSeconds: duration }],
    peaks: peaksOf(samples),
    audioSeconds: Number(duration.toFixed(2)),
    wallClockMs: Math.round(duration * 900),
    realTimeFactor: 0.9,
    wordsAMinute: Number(((words / duration) * 60).toFixed(1)),
    bytes: 44 + samples.length * 2,
  });
});

const manifest = {
  schemaVersion: "2026-09-13",
  generatedAt: new Date().toISOString(),
  model: "fixture-tones",
  modelId: "fixture/tones",
  name: "Fixture tones",
  runtime: "kokoro-js",
  voice: "none",
  quantisation: "none",
  sampleRate: SAMPLE_RATE,
  maxWordsAChunk: 40,
  run: {
    runId: "fixture-tones__c40-r1-t4-iall-s1",
    model: "fixture-tones",
    configSlug: "c40-r1-t4-iall-s1",
    isolated: false,
    notIsolatedBecause:
      "these are synthesised tones, not a voice model - every figure in this file is invented and none of it may be compared with a reading",
    config: { maxWordsAChunk: 40, repeats: 1, threads: 4, maxItems: 0, shards: 1 },
    notes: "a development fixture for the browser smoke",
  },
  host: { isCi: false, cpuModel: "not a measurement", cpuCount: 0 },
  clips,
  totals: {
    clipCount: clips.length,
    words: clips.reduce((n, c) => n + c.words, 0),
    audioSeconds: Number(audioSeconds.toFixed(2)),
    wallSeconds: Number((audioSeconds * 0.9).toFixed(2)),
    realTimeFactor: 0.9,
    wordsAMinute: 120,
  },
  metrics: {
    totalCharacters: clips.reduce((n, c) => n + c.text.length, 0),
    totalWords: clips.reduce((n, c) => n + c.words, 0),
    audioSeconds: Number(audioSeconds.toFixed(2)),
    processingSeconds: Number((audioSeconds * 0.9).toFixed(2)),
    charactersASecond: 13,
    medianCharactersASecond: 13,
    speakingRate: 120,
    realTimeFactor: 0.9,
    speedMultiplier: 1.11,
    rateStability: { mean: 120, median: 120, min: 110, max: 130, spread: 20, standardDeviation: 7, coefficientOfVariation: 0.058 },
    drift: null,
    notMeasuredHere: ["intelligibility", "pronunciation", "prosody", "seams"],
  },
};

writeFileSync(`${RESULT_DIR}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const bytes = Buffer.byteLength(JSON.stringify(clips.map((c) => c.peaks)));
console.log(
  `wrote results/fixture-tones - ${clips.length} clips, ${audioSeconds.toFixed(1)} s of audio, ` +
    `${WAVEFORM_BUCKETS} peaks a clip (${(bytes / clips.length / 1024).toFixed(2)} KB a clip)`,
);
console.log("run `node build-page-index.mjs` next, then `npm run serve`");
