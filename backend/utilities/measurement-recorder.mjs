/**
 * Shared measurement recorder for the ONNX runtime comparison.
 *
 * Both arms import this so their output has identical shape. That is what makes
 * a diff of the two measurement files a diff of the libraries and of nothing
 * else - the parity oracle the comparison depends on.
 *
 * Nothing here knows which library is being measured. An arm supplies its own
 * name and a synthesise function; this module does the timing, the arithmetic
 * and the writing.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import os from "node:os";

const SENTENCE_BOUNDARY = /(?<=[.!?])\s+(?=[A-Z"'(])/;

const MILLISECONDS_A_SECOND = 1000;
const BYTES_A_MEGABYTE = 1024 * 1024;

/**
 * Split text at sentence boundaries, then bound each piece by word count.
 *
 * A voice model has a context limit, and text past it is silently truncated -
 * the model returns audio for what it read and says nothing about the rest.
 * Chunking is therefore not an optimisation, it is what makes the measurement
 * honest: every word of the input has to reach the synthesiser.
 *
 * Splitting on sentences rather than on a raw token count keeps the prosody
 * intact. A cut mid-clause is audible.
 */
export function splitIntoChunks(text, maxWords) {
  const sentences = text.split(SENTENCE_BOUNDARY);
  const chunks = [];
  let current = [];

  const flush = () => {
    if (current.length) {
      chunks.push(current.join(" "));
      current = [];
    }
  };

  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;

    if (current.length + words.length > maxWords) flush();

    if (words.length > maxWords) {
      // One sentence longer than the budget: break it on the word boundary
      // nearest the limit rather than let the model truncate it unseen.
      for (let i = 0; i < words.length; i += maxWords) {
        chunks.push(words.slice(i, i + maxWords).join(" "));
      }
      continue;
    }
    current.push(...words);
  }
  flush();
  return chunks.length ? chunks : [text];
}

export function describeRunner() {
  const cpus = os.cpus();
  return {
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    cpuModel: cpus.length ? cpus[0].model.trim() : "unknown",
    cpuCount: cpus.length,
    totalMemoryMb: Math.round(os.totalmem() / BYTES_A_MEGABYTE),
  };
}

export function measurePeakMemoryMb() {
  return Math.round(process.memoryUsage().rss / BYTES_A_MEGABYTE);
}

export function computeRealTimeFactor(wallClockMs, audioSeconds) {
  if (!audioSeconds) return null;
  return wallClockMs / MILLISECONDS_A_SECOND / audioSeconds;
}

export function summarise(values) {
  const present = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!present.length) return null;
  const ordered = [...present].sort((a, b) => a - b);
  const at = (fraction) => ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))];
  return {
    median: at(0.5),
    p90: at(0.9),
    max: ordered[ordered.length - 1],
    min: ordered[0],
  };
}

/**
 * Run one arm over the sample corpus and write its measurement file.
 *
 * @param {object} arm
 * @param {string} arm.library      - the library under measurement
 * @param {string} arm.model        - the model held constant across arms
 * @param {Function} arm.loadModel  - async, returns a handle; timed separately
 * @param {Function} arm.synthesise - async (handle, text) -> {audioSeconds, bytes}
 * @param {object[]} samples        - the committed corpus entries
 * @param {string} outputPath       - where to write the measurement file
 */
export async function runComparisonArm(
  { library, model, loadModel, synthesise, maxWordsAChunk = 40 },
  samples,
  outputPath,
) {
  const startedAt = new Date().toISOString();

  const loadStartedMs = Date.now();
  const handle = await loadModel();
  const loadWallClockMs = Date.now() - loadStartedMs;

  const clips = [];
  for (const sample of samples) {
    const chunks = splitIntoChunks(sample.text, maxWordsAChunk);
    const clipStartedMs = Date.now();
    let audioSeconds = 0;
    let bytes = 0;
    for (const chunk of chunks) {
      const piece = await synthesise(handle, chunk);
      audioSeconds += piece.audioSeconds;
      bytes += piece.bytes;
    }
    const wallClockMs = Date.now() - clipStartedMs;
    const wordsASecond = audioSeconds ? sample.words / audioSeconds : 0;
    clips.push({
      id: sample.id,
      words: sample.words,
      chunks: chunks.length,
      audioSeconds: Number(audioSeconds.toFixed(3)),
      wallClockMs,
      realTimeFactor: Number(computeRealTimeFactor(wallClockMs, audioSeconds).toFixed(4)),
      wordsAMinute: Number((wordsASecond * 60).toFixed(1)),
      bytes,
      peakMemoryMb: measurePeakMemoryMb(),
    });
    console.log(
      `  ${sample.id}  ${String(sample.words).padStart(4)} words  ` +
        `${String(chunks.length).padStart(2)} chunk(s)  ` +
        `${audioSeconds.toFixed(1)}s audio  ${String(wallClockMs).padStart(6)}ms  ` +
        `RTF ${clips[clips.length - 1].realTimeFactor.toFixed(3)}  ` +
        `${clips[clips.length - 1].wordsAMinute} wpm`,
    );
  }

  const totalAudioSeconds = clips.reduce((sum, c) => sum + c.audioSeconds, 0);
  const totalWallClockMs = clips.reduce((sum, c) => sum + c.wallClockMs, 0);

  const measurement = {
    schemaVersion: "2026-09-12",
    library,
    model,
    startedAt,
    runner: describeRunner(),
    modelLoad: { wallClockMs: loadWallClockMs },
    chunking: { maxWordsAChunk, totalChunks: clips.reduce((sum, c) => sum + c.chunks, 0) },
    clips,
    totals: {
      clipCount: clips.length,
      words: clips.reduce((sum, c) => sum + c.words, 0),
      audioSeconds: Number(totalAudioSeconds.toFixed(2)),
      wallClockMs: totalWallClockMs,
      bytes: clips.reduce((sum, c) => sum + c.bytes, 0),
      peakMemoryMb: Math.max(...clips.map((c) => c.peakMemoryMb)),
    },
    realTimeFactor: summarise(clips.map((c) => c.realTimeFactor)),
    wordsAMinute: summarise(clips.map((c) => c.wordsAMinute)),
    aggregateRealTimeFactor: Number(
      computeRealTimeFactor(totalWallClockMs, totalAudioSeconds).toFixed(4),
    ),
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(measurement, null, 2)}\n`, "utf8");
  console.log(`\nwrote ${outputPath}`);
  const totalWords = measurement.totals.words;
  console.log(
    `aggregate real-time factor ${measurement.aggregateRealTimeFactor} ` +
      `(${measurement.totals.audioSeconds}s of audio in ${(totalWallClockMs / 1000).toFixed(1)}s)`,
  );
  console.log(
    `measured speaking pace ${((totalWords / totalAudioSeconds) * 60).toFixed(1)} words a minute ` +
      `- the assumed figure is 150`,
  );
  return measurement;
}
