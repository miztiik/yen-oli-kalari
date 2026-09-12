# 2026-09-12 - Real published text, and the shard arithmetic

**Last Updated**: 2026-09-12

The first measurement taken on text nobody chose for the test. It moves the
speaking pace, and it corrects a budget that had been derived for a pipeline
shape this project does not use.

## Conditions

- Corpus: 24 summaries fetched from the live published site,
  `https://miztiik.github.io/yen-idhazh/digest/2026/09/11/digest.json` - a day
  holding 372 published items of 377 planned. Sampled across the day's length
  distribution, 20 to 136 words, 1,935 words total.
- Built by `test/onnx-runtime-comparison/build-real-corpus.mjs`, voiced by
  `test/voice-evaluation/build-evaluation-clips.mjs` with `CORPUS=real`.
- Library `kokoro-js` 1.2.1, model `onnx-community/Kokoro-82M-v1.0-ONNX` at `q8`,
  voice `af_heart`, chunked at 40 words.
- **Timed on a developer laptop (Intel i7-1265U), not the runner.** The pace and
  the audio durations below transfer because the model is deterministic; the
  wall clock does not, and no budget comparison is drawn from it.

## What the real text carries that the hand-picked sample did not

The first corpus was twelve summaries chosen by hand to span the length
distribution. That made the speed reading honest and left a different question
open: a hand-picked sample can quietly avoid the things that actually break a
news voice. The real day does not.

| Hazard | Summaries carrying it |
| --- | --- |
| Acronym | 15 of 24 |
| Hyphenated compound | 15 of 24 |
| Currency amount | 11 of 24 |
| Quoted speech | 9 of 24 |
| Large or decimal number | 8 of 24 |
| Percentage | 6 of 24 |
| Date or time | 5 of 24 |

Every summary is now tagged with the hazards it holds, so a listener can be sent
to the clips that will discriminate between two models rather than listening to
two dozen pleasant ones.

## What was measured

| Quantity | Hand-picked sample | **Real published text** |
| --- | --- | --- |
| Summaries | 12 | 24 |
| Words | 1,154 | 1,935 |
| Audio produced | 534.75 s | **916.24 s** |
| Speaking pace | 129.5 wpm | **126.7 wpm** |

**The pace is 126.7 words a minute on real text - 2.2 percent slower than the
hand-picked sample.** That direction is expected and worth keeping: real
summaries are denser in currency amounts, percentages and acronyms, and those
take longer to say per word than ordinary prose. "NT$1 million" is three words
and about a second and a half.

## What this settles

**The speaking pace in force is 126.7 wpm, and it was taken on text the pipeline
will really hand the model.** Every byte and hour figure downstream moves with
it: a median day is 263.4 minutes of audio rather than 257.7, and the busiest day
520.4 rather than 509.2.

**The 0.707 budget was derived for a pipeline shape this project does not use.**
It answers "what real-time factor fits the busiest day into one six-hour job",
and the answer only matters if one job has to carry the whole day. Summaries are
independent, so the work fans out - and the sibling project `yen-idhazh` already
does exactly this, four shards starting at the same instant and the run costing
its slowest shard rather than their sum (run `34680107844`: plan 2m12s, then
`work (0..3)` all starting 07:14:30, slowest finishing 48m later).

Re-derived at the measured pace, with `N` runners each carrying `1/N` of the day:

| Runners | Audio each carries | Budget RTF | Kokoro at 1.0112 |
| --- | --- | --- | --- |
| 1 | 520.4 min | **0.692** | 8.77 h - busts |
| 2 | 260.2 min | 1.38 | 4.39 h - fits |
| 4 | 130.1 min | **2.77** | 2.19 h - fits comfortably |
| 8 | 65.1 min | 5.53 | 1.10 h - fits easily |

**So the busiest day is not a problem, and never was one.** The previous record
concluded the design needed "a faster library, a faster model, splitting a day
across parallel jobs, or accepting that a heavy day spills". The third option is
not a compromise - it is what the sibling pipeline already does, and at four
shards the busiest day finishes in 2.19 h with 63 percent of the cap unused.

## What it does not settle

- **This was not timed on the runner.** The laptop read 1.7745, and the same
  laptop read 2.576 on the earlier corpus while a browser was running. That
  spread across two runs of the same machine is itself the argument for not
  trusting a developer clock: only the runner's figure may be compared to a cap.
- **The shard arithmetic is arithmetic.** Four shards have not been run.
  `.github/workflows/measure-voice.yml` does it and has not been dispatched.
- **Quality is still unjudged.** 24 clips now exist with their hazards tagged,
  and nobody has listened to one.
- **One repeat, so no spread.** The workflow takes a `repeats` input and reports
  a median; this run used one.
- **The pace is model-specific.** 126.7 wpm is this model at this speed setting
  and must be re-measured for any candidate, never carried across.

## See also

- [`2026-09-12-kokoro-on-a-ci-runner.md`](2026-09-12-kokoro-on-a-ci-runner.md) - the runner reading this run re-prices.
- [`../measurements.md`](../measurements.md) - the figure now in force for each quantity.
- [`../voice-model-survey.md`](../voice-model-survey.md) - the candidates this budget is used to judge.
- [`../../concepts/model-formats-and-inference.md`](../../concepts/model-formats-and-inference.md) - where the budget comes from and what RTF means.
- [`../../../test/voice-evaluation/README.md`](../../../test/voice-evaluation/README.md) - the harness that holds these clips.
