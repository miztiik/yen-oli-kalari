# ONNX runtime comparison

**Last Updated**: 2026-09-12

Two ONNX inference libraries, one voice model, one committed corpus, one runner.
The question this answers is narrow on purpose: **does the choice of library
change how fast this project can voice a day, and by how much?**

The model is held constant so a difference between the arms is attributable to
the library and to nothing else. An experiment that varied the model and the
library together would produce a number nobody could act on.

This is a measurement, not a foundation. Nothing here is production code, and
production code never imports from this directory. What is genuinely shared -
the timing, the arithmetic and the output shape - lives in
[`../../backend/utilities/measurement-recorder.mjs`](../../backend/utilities/measurement-recorder.mjs)
so both arms cannot drift apart in how they measure.

## The arms

| Arm | Library | What it is |
| --- | --- | --- |
| `kokoro-js/` | `kokoro-js` | A purpose-built wrapper over ONNX Runtime for one model family |
| `transformers-js/` | `@huggingface/transformers` | The general-purpose pipeline library, running the same weights |

Both load `onnx-community/Kokoro-82M-v1.0-ONNX` at `q8` by default. Kokoro is
**not** a production candidate here - it is the reference model, chosen because
both libraries can run the same weights, which is the whole point.

## What is measured

Per clip: words in, seconds of audio out, wall-clock, real-time factor, bytes
and peak memory. Per run: model load time, totals, and the real-time factor
median, p90, max and aggregate.

**Real-time factor is the comparable unit** - seconds of compute for one second
of audio. A factor of 0.3 means a minute of speech costs eighteen seconds of
runner time. It is used instead of tokens a second because a non-autoregressive
voice model emits a waveform in one pass and has no tokens to count, so the
figure would be undefined for one of the arms.

The figure that matters downstream is whether a median day - about 370 items and
222 minutes of speech, per
[`../../docs/reference/measurements.md`](../../docs/reference/measurements.md) -
fits inside the 6 h job cap. At a real-time factor of 1.0 that day costs about
3.7 hours, which fits; at 3.0 it does not.

## The corpus

[`sample-summaries/summaries.json`](sample-summaries/summaries.json) holds 12
real upstream summaries spanning 20 to 242 words, sampled across the measured
length distribution and committed so every arm and every future run reads
identical text. Rebuild it with:

```
python backend/utilities/build_sample_summaries.py <upstream-checkout>
```

Sampling across the distribution matters because real-time factor is not flat
in input length: model load and text front-end costs are paid per clip, so a
corpus of only long items would flatter a slow loader.

## Running it

In CI, trigger either workflow by hand -
[`compare-kokoro-js.yml`](../../.github/workflows/compare-kokoro-js.yml) or
[`compare-transformers-js.yml`](../../.github/workflows/compare-transformers-js.yml).
They take a quantisation and a repeat count, and upload the measurement files as
an artifact. **The two workflow files are deliberately near-identical** - they
differ in five lines, all of them the arm name. Keep them in step: a difference
that is not the library under measurement makes the comparison say nothing.

Locally, in either arm directory:

```
npm install
npm run measure
```

Expect a model download of roughly a hundred megabytes on the first run.

## Adding a third arm

1. Create a directory named after the library being measured, never after its
   position in a list. `stack-3` is not a name - see the naming convention in
   [`../../CLAUDE.md`](../../CLAUDE.md) section 1a.
2. Write a `synthesize-corpus.mjs` that supplies `loadModel` and `synthesise` to
   `runComparisonArm`. Do not write your own timing: the shared recorder is what
   keeps the arms comparable.
3. Copy a workflow, change only the arm name, and check the diff against its
   sibling is nothing else.

## What this cannot settle

- **It measures a library, not a voice.** Nothing here says whether the audio is
  good enough to publish. That is a separate instrument and it does not exist
  yet.
- **A raw ONNX Runtime binding was considered as an arm and rejected**: a voice
  model needs a text front-end - tokenisation and phonemisation - which the raw
  binding does not provide, so that arm would have measured how well we wrote a
  phonemiser rather than how fast the runtime is.
- **A GitHub runner is shared hardware.** Repeats give spread, and the spread is
  reported rather than averaged away.

## See also

- [`../../docs/reference/measurements.md`](../../docs/reference/measurements.md) - the figure in force for each quantity.
- [`../../docs/reference/benchmarks/2026-09-11-input-volume-and-audio-cost.md`](../../docs/reference/benchmarks/2026-09-11-input-volume-and-audio-cost.md) - what one day of input costs to voice.
- [`../../CLAUDE.md`](../../CLAUDE.md) - Guardrail #10 (measured, not estimated) and the naming convention in section 1a.
- [`../../TODO/20260911-stack-and-guardrails-plan.md`](../../TODO/20260911-stack-and-guardrails-plan.md) - row 2, which this directory implements.
