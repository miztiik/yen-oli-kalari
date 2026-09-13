/**
 * The metrics a newscast pipeline is actually judged on, computed from one run.
 *
 * Twelve were named as mattering, in priority order, and they do not all cost
 * the same to get. This module computes the ones that are FREE - arithmetic on
 * what voicing already produced - and states plainly which ones need a second
 * instrument, so a dashboard never implies it measured something it did not.
 *
 *   free here            verbalization needs an ASR pass (see verbalization-suite.json)
 *   ------------------   ------------------------------------------------------
 *   speaking rate        verbalization accuracy   (1)
 *   rate stability       pronunciation accuracy   (2)
 *   long-form drift      text fidelity / WER      (3)
 *   characters a second  intelligibility          (6)
 *   real-time factor     naturalness / MOS        (7)
 *   speed multiplier     audio defects            (9)
 *   processing time      memory and CPU           (11)
 *
 * Long-form drift is the one worth explaining. A model that starts a paragraph
 * well and loses pace by the end sounds fine in a five-second sample and wrong
 * in a newscast, and the only way to see it is to compare the first third of a
 * clip against the last. Chunk timings make that free, because each chunk is
 * its own inference call with a known sample count.
 */

/** Words a minute, from a word count and a duration. */
export function speakingRate(words, audioSeconds) {
  if (!audioSeconds) return 0;
  return (words / audioSeconds) * 60;
}

/** Characters a second of audio produced - the figure a dashboard shows first. */
export function charactersASecond(text, audioSeconds) {
  if (!audioSeconds) return 0;
  return text.length / audioSeconds;
}

/** Compute seconds divided by audio seconds. Lower is better; 1.0 is real time. */
export function realTimeFactor(wallClockMs, audioSeconds) {
  if (!audioSeconds) return 0;
  return wallClockMs / 1000 / audioSeconds;
}

/**
 * How many times faster than real time, which is the reciprocal of the factor.
 *
 * Both are published and they are trivially confusable - a vendor card claiming
 * "RTF 0.32, about 3.1x real time" is stating one number twice. A dashboard
 * that shows both side by side makes the relationship obvious instead of
 * leaving a reader to guess which convention is in play.
 */
export function speedMultiplier(realTimeFactorValue) {
  if (!realTimeFactorValue) return 0;
  return 1 / realTimeFactorValue;
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * How steady the speaking rate is across a corpus.
 *
 * Priority 8 of the twelve. A model whose pace wanders is hard to listen to for
 * twenty minutes and makes every byte and hour estimate downstream less
 * trustworthy, because those all rest on one pace figure. The coefficient of
 * variation is the right statistic: a standard deviation in words a minute
 * means nothing without knowing the mean it varies around.
 */
export function rateStability(clips) {
  const rates = clips.map((c) => c.wordsAMinute).filter((r) => r > 0);
  if (rates.length < 2) return { mean: rates[0] ?? 0, spread: 0, coefficientOfVariation: 0 };
  const mean = rates.reduce((s, r) => s + r, 0) / rates.length;
  const variance = rates.reduce((s, r) => s + (r - mean) ** 2, 0) / (rates.length - 1);
  const deviation = Math.sqrt(variance);
  return {
    mean,
    median: median(rates),
    min: Math.min(...rates),
    max: Math.max(...rates),
    spread: Math.max(...rates) - Math.min(...rates),
    standardDeviation: deviation,
    coefficientOfVariation: mean ? deviation / mean : 0,
  };
}

/**
 * Whether pace holds from the start of a clip to its end.
 *
 * Priority 4 and 5 of the twelve, and the failure a short sample cannot show.
 * Each chunk's duration is exact, so its rate is exact; comparing the first
 * third of the chunks against the last third says whether the model drifted.
 *
 * Returns null for a clip with fewer than three chunks, because a comparison
 * between two chunks is a difference rather than a trend and would report noise
 * as drift.
 */
export function longFormDrift(clip) {
  const timings = clip.chunkTimings;
  if (!timings || timings.length < 3) return null;

  const rates = timings.map((chunk) => {
    const seconds = chunk.endSeconds - chunk.startSeconds;
    const words = chunk.text.trim().split(/\s+/).filter(Boolean).length;
    return seconds > 0 ? (words / seconds) * 60 : 0;
  });

  const third = Math.max(1, Math.floor(rates.length / 3));
  const opening = rates.slice(0, third);
  const closing = rates.slice(-third);
  const meanOf = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const openingRate = meanOf(opening);
  const closingRate = meanOf(closing);

  return {
    chunks: rates.length,
    openingRate,
    closingRate,
    driftPercent: openingRate ? ((closingRate - openingRate) / openingRate) * 100 : 0,
    rates,
  };
}

/**
 * What the corpus was, in the shape a manifest records it.
 *
 * A function rather than an object literal inside the benchmark script, because
 * the literal version shipped a defect that no test could see: it wrote
 * `days: corpus.days`, and `corpus.days` is a LIST of per-day records rather
 * than a count, so every manifest carried a nested array where the contract
 * required an integer. That only surfaced on a real CI run, twenty minutes of
 * voicing after it could first have been caught.
 *
 * The count, not the array: `sampledFrom` already names every url, so copying
 * the per-day records would duplicate the corpus header into each manifest for
 * no reader's benefit.
 */
export function corpusProvenance(corpus, name = "real") {
  return {
    name,
    sampledFrom: corpus.sampledFrom ?? null,
    /* A one-day corpus makes a figure a property of that day's news, so the
       span is provenance a reader needs rather than trivia. */
    days: Array.isArray(corpus.days) ? corpus.days.length : (corpus.days ?? null),
    /* How many published items it was drawn FROM, against how many it kept.
       The ratio is what says whether the sample is a sample. */
    poolSize: corpus.poolSize ?? null,
  };
}

/** Every free metric for one run, in the shape a dashboard reads. */
export function summariseRun(run) {
  const clips = run.clips;
  const totalCharacters = clips.reduce((s, c) => s + c.text.length, 0);
  const audioSeconds = clips.reduce((s, c) => s + c.audioSeconds, 0);
  const wallClockMs = clips.reduce((s, c) => s + c.wallClockMs, 0);
  const words = clips.reduce((s, c) => s + c.words, 0);

  const factor = realTimeFactor(wallClockMs, audioSeconds);
  const drifts = clips.map(longFormDrift).filter(Boolean);

  return {
    totalCharacters,
    totalWords: words,
    audioSeconds,
    processingSeconds: wallClockMs / 1000,

    charactersASecond: charactersASecond({ length: totalCharacters }, audioSeconds),
    medianCharactersASecond: median(clips.map((c) => charactersASecond(c.text, c.audioSeconds))),
    speakingRate: speakingRate(words, audioSeconds),
    realTimeFactor: factor,
    speedMultiplier: speedMultiplier(factor),

    rateStability: rateStability(clips),
    drift: drifts.length
      ? {
          clipsMeasured: drifts.length,
          medianDriftPercent: median(drifts.map((d) => d.driftPercent)),
          worstDriftPercent: drifts.reduce(
            (worst, d) => (Math.abs(d.driftPercent) > Math.abs(worst) ? d.driftPercent : worst),
            0,
          ),
        }
      : null,

    /* Named, not computed. A dashboard that silently omits these reads as
       though the model passed them. */
    notMeasuredHere: [
      "verbalization accuracy",
      "pronunciation accuracy",
      "text fidelity / WER",
      "intelligibility",
      "naturalness",
      "audio defects",
      "peak memory",
    ],
  };
}
