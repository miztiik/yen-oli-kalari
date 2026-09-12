# 2026-09-12 - Kokoro on a CI runner, and the first real speaking pace

**Last Updated**: 2026-09-12

The first time this project ran a voice model on the hardware that will have to
run it. It settles the speaking pace, which had been an assumption since the
design began, and it shows the busiest day does not fit the job.

## Conditions

- Run on a GitHub-hosted `ubuntu-latest`: AMD EPYC 7763, 4 cores, no GPU.
  [Run 34660147513](https://github.com/miztiik/yen-oli-kalari/actions/runs/34660147513).
- Library `kokoro-js` 1.2.1, model `onnx-community/Kokoro-82M-v1.0-ONNX` at `q8`,
  voice `af_heart`.
- Input: the committed 12-summary corpus, 1,154 words, spanning 20 to 242 words
  a summary - real upstream summaries sampled across the measured length
  distribution.
- One repeat. **Spread is not measured here**, so every figure is a single
  reading on shared hardware.
- Kokoro is the reference model for the library comparison, not a production
  candidate.

## What was measured

| Summary | Words | Chunks | Audio | Wall clock | Real-time factor | Words a minute |
| --- | --- | --- | --- | --- | --- | --- |
| sample-01 | 20 | 1 | 9.5 s | 11.4 s | 1.199 | 126.6 |
| sample-02 | 54 | 2 | 26.0 s | 26.4 s | 1.016 | 124.7 |
| sample-03 | 62 | 2 | 29.2 s | 29.4 s | 1.006 | 127.4 |
| sample-04 | 68 | 2 | 28.9 s | 28.9 s | 1.000 | 141.1 |
| sample-05 | 73 | 3 | 37.3 s | 37.7 s | 1.011 | 117.4 |
| sample-06 | 80 | 3 | 39.3 s | 39.3 s | 1.002 | 122.2 |
| sample-07 | 89 | 3 | 43.1 s | 43.2 s | 1.002 | 123.9 |
| sample-08 | 100 | 3 | 45.8 s | 45.5 s | 0.995 | 131.1 |
| sample-09 | 111 | 4 | 51.2 s | 51.3 s | 1.003 | 130.1 |
| sample-10 | 121 | 5 | 54.9 s | 56.0 s | 1.019 | 132.1 |
| sample-11 | 134 | 5 | 63.3 s | 63.6 s | 1.005 | 127.1 |
| sample-12 | 242 | 9 | 106.4 s | 108.0 s | 1.015 | 136.5 |

**Aggregate: 534.75 s of audio in 540.7 s of compute - a real-time factor of
1.0112, and a speaking pace of 129.5 words a minute.**

## What this settles

**The speaking pace is no longer an assumption.** The design has carried 150
words a minute as a declared assumption since the input-volume benchmark, and
every byte and hour figure downstream of it inherited that. The measured figure
is **129.5 words a minute, 13.7 percent slower**, so the same text takes 15.8
percent longer to say than every estimate assumed.

| Quantity | Estimated at 150 wpm | Measured at 129.5 wpm |
| --- | --- | --- |
| Median day, 370 items | 222.5 min of audio | **257.7 min** |
| Busiest day, 731 items | 439.6 min | **509.2 min** |
| Median day at opus@24k | 40.0 MB | **46.4 MB** |

**A median day fits the job. The busiest day does not.** At a real-time factor
of 1.0112, a median day of 370 items costs **4.34 h of wall clock against the
6 h job cap - 72 percent of it**. The busiest day observed in the upstream
archive, 731 items, costs **8.58 h, which is 143 percent of the cap.** It does
not finish.

**So the design needs one of four things, and this run does not choose between
them.** To fit the busiest day inside one job, the pipeline needs a real-time
factor of **0.707 or better - 1.43 times faster than measured**. The options are
a faster library (which the sibling arm of this comparison exists to test), a
faster model, splitting a day across parallel jobs, or accepting that a heavy
day spills into the next run.

**Compute is a real constraint after all.** The input-volume benchmark concluded
that compute had slack and only a real-time factor of 3.0 or worse would bust
the cap. That was arithmetic on an assumed pace with no model in hand. With a
measured model on the target hardware, the busiest day busts the cap at a
real-time factor of 1.0.

## What it does not settle

- **One repeat, so there is no spread.** A GitHub runner is shared hardware and
  a second run may differ. The figures here are a single reading.
- **This is one library and one model.** The comparison's other arm,
  `@huggingface/transformers` over the same weights, has not been run. Neither
  has any production candidate.
- **Quality is not measured.** Nothing here says whether the audio is good
  enough to publish, whether names and numbers are pronounced correctly, or
  whether chunk boundaries are audible.
- **Chunking is not tuned.** 40 words a chunk was chosen to stay clear of the
  context limit, not because it is optimal. Chunk count rises with length and
  each chunk pays a fixed cost, which is the likeliest explanation for
  sample-01's outlying real-time factor of 1.199.
- **The pace is model-specific.** 129.5 words a minute is this model at this
  speed setting. Another voice will differ, and the figure must be re-measured
  rather than carried across.

## How the run was made honest

The first attempt at this measurement produced a flat real-time factor of 0.97
across every input size and looked healthy. It was wrong. Every summary above
about 55 words produced the same 27 seconds of audio, because the model
truncates at its context limit and reports nothing about what it dropped - 54,
80, 134 and 242 words all landed within a second of each other. The work was
constant, so the figure was constant.

The recorder now splits a summary at sentence boundaries into chunks of at most
40 words and sums the audio across them, which is what the daily pipeline will
have to do anyway. The tell that the fix worked is in the table above: audio
duration now rises with word count, from 9.5 s to 106.4 s.

## See also

- [`../measurements.md`](../measurements.md) - the figure now in force for each quantity.
- [`2026-09-11-input-volume-and-audio-cost.md`](2026-09-11-input-volume-and-audio-cost.md) - the earlier run this one corrects, which priced the design on the assumed pace.
- [`../../../test/onnx-runtime-comparison/README.md`](../../../test/onnx-runtime-comparison/README.md) - the harness, the corpus and how to add an arm.
- [`../../../CLAUDE.md`](../../../CLAUDE.md) - Guardrail #2 (the runner is the production target) and Guardrail #10 (measured, not estimated).
