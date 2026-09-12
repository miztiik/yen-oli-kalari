# Evaluation coverage

**Last Updated**: 2026-09-13

What is measured, what is built but unrun, and what is not measured at all -
grouped by the question each metric answers rather than by the order they were
thought of.

**A dashboard that omits a metric reads as though the model passed it.** This
page exists so that nothing on the listening page can imply a measurement that
was never taken.

## Group A - Does it say the right words?

The hardest problem for a newscast, and the one standard TTS benchmarks
under-measure. They score naturalness on clean prose; news copy is dense with
currency, quarters, tickers and names, and a model that reads `EUR 12.5bn` as
"twelve point five bee en" is unusable however pleasant it sounds.

| # | Metric | State | Instrument |
| --- | --- | --- | --- |
| 1 | **Verbalization accuracy** - numbers, dates, decimals, currencies, units, symbols | **MEASURED** | [`verbalization-suite.json`](../../test/onnx-runtime-comparison/verbalization-suite.json) - 28 cases, graded by ASR in CI, reported per category |
| 2 | **Pronunciation accuracy** - acronyms, names, companies, URLs, initialisms | **MEASURED** | Same suite, categories `acronym-initialism`, `proper-noun`, `url-identifier`, `code-switching` |
| 3 | **Text fidelity / WER** - skipped, added or substituted words | **MEASURED** | `faster-whisper` transcribes, a token-level Levenshtein scores against the normalised source |

**Why the suite is deterministic rather than a listening task.** Every case
carries `expectedSpoken`, so it is graded against a ground truth instead of an
opinion - which is what lets an ASR pass grade it without a human, and what
makes a regression visible between two runs.

**One known failure is already documented and untested.** Kokoro's phoneme
front-end drops out-of-dictionary words from the audio when its fallback is
unavailable, logging rather than failing. Case `pro-01` exists to catch exactly
that: a clip that sounds perfect and is missing a surname.

## Group B - Does it hold together over a long read?

| # | Metric | State | Instrument |
| --- | --- | --- | --- |
| 4 | **Long-form prosody** - pauses, emphasis, rhythm | **Partly measured** | `longFormDrift()` in [`metrics.mjs`](../../test/voice-evaluation/metrics.mjs) compares the opening third of a clip against the closing third. Pace only - emphasis and pause placement still need a listener. |
| 5 | **Continuity** - consistency across chunks, no audible seams | **Instrument built, unjudged** | Chunk boundaries are exact and marked in the page text; the `seams` score is on every clip and nobody has filled one in |
| 8 | **Speaking-rate stability** | **Measured** | `rateStability()` - mean, median, spread and coefficient of variation across the corpus |

**Why drift needs its own metric.** A model that starts a paragraph well and
loses pace by the end sounds fine in a five-second sample and wrong in a
newscast. Chunk timings make the comparison free, because each chunk is its own
inference call with a known sample count.

## Group C - Is it pleasant to listen to?

| # | Metric | State | Instrument |
| --- | --- | --- | --- |
| 6 | **Intelligibility** | **Instrument built, unjudged** | Five-point score on every clip |
| 7 | **Naturalness** - MOS / UTMOS / preference | **Pairwise built, absolute deliberately not claimed** | A/B tab, blind by default. **Not a MOS**: P.800.2 forbids cross-experiment comparison and TTS Arena needs 100 votes before publishing a rating. UTMOS would add a predicted score and is not wired. |
| 9 | **Audio defects** - clicks, glitches, repetitions, truncation | **Reportable, not detected** | The defect log takes `artifact` and `truncation` with a timestamp; nothing finds them automatically |

**Truncation has bitten this project once already.** The first measurement run
reported a healthy flat real-time factor because every summary over about 55
words produced the same 27 seconds of audio - the model was voicing what fit and
silently discarding the rest. Chunking fixed it; the defect category remains
because the class of failure has not gone away.

## Group D - Can the pipeline afford it?

| # | Metric | State | Instrument |
| --- | --- | --- | --- |
| 10 | **RTF and cost** | **Measured on the production runner** | fp32 **0.4321**, q8 **1.0039** - [record](benchmarks/2026-09-12-quantisation-was-costing-not-saving.md) |
| 11 | **Memory and CPU** | **MEASURED** | Peak resident set around the voicing loop, reported per arm |
| 12 | **Time to first byte** | **Deliberately not measured** | Everything is built ahead of time and served as a static file. Latency to first audio is a property of a streaming service this project does not run. |

**The figure that matters and how it was nearly missed.** Every reading before
2026-09-12 was taken at `q8`, which is **2.32 times slower than `fp32` on
identical audio** on the runner. An 82M model at fp32 is roughly 330 MB and
never enters the memory-bandwidth-bound regime where quantisation pays; all q8
added was dequantise work. The tell was visible for a day - 1.0112 against the
0.03-0.25 published by comparable models - and went unexamined.

## What a run produces today

| Figure | Free? | Where |
| --- | --- | --- |
| Characters a second, median and total | free | `summariseRun()` |
| Real-time factor and speed multiplier | free | both published conventions, shown together because vendors confuse them |
| Processing time, total characters, total words | free | `summariseRun()` |
| Speaking rate and its stability | free | `rateStability()` |
| Long-form drift | free | `longFormDrift()` |
| Verbalization and pronunciation accuracy | **needs an ASR pass** | suite built, unrun |
| Peak memory | **needs a probe** | not built |

## The first graded result, and what it cost to trust

Supertonic, on the runner, 2026-09-13. **12.19x faster than real time** - and it
reads `GBP 8.75m` as "8.75 bps", `08:30` as "0.830", `AI/ML` as the single word
"AML", and `Q3 FY26` as "Q3FI26".

That is the finding the whole exercise was built for. **A voice can be an order
of magnitude faster than the incumbent and still be unusable**, and no amount of
naturalness compensates for a currency amount read as a different unit. Speed
was never the hard problem.

**The first grading run was itself wrong, and the reason is worth keeping.** It
reported 18.5 percent accuracy, and most of those failures were the grader's.
Whisper re-normalises spoken numbers back into digits: a model that correctly
says "twelve point five billion euros" is transcribed as "EUR 12.5 billion", and
comparing that against the expected spoken form fails a model that did exactly
the right thing. Both sides are now normalised toward words, and order is not
required because a currency symbol is written first and spoken last.

Seven behaviours are pinned in
[`../../tests/test_verbalization_grader.py`](../../tests/test_verbalization_grader.py) -
four where a model was right and three where it was wrong - because a grader
nobody grades is an opinion with a percentage sign.

## The next three things, in order

1. **Listen to one clip.** Every instrument above is built and running, and
   none of them replaces a person with headphones on. Nobody has heard one.
2. **Grade the incumbent.** Supertonic is graded; Kokoro is not yet, so there is
   no baseline to judge that 12x against.
3. **Unblock the remaining runtimes.** Qwen3-TTS at 1.5 GB is the most plausible
   autoregressive candidate on size, and KittenTTS needs an adapter over raw
   onnxruntime because it ships no tokenizer.json.

## See also

- [`measurements.md`](measurements.md) - the figure now in force for each quantity.
- [`voice-model-survey.md`](voice-model-survey.md) - the models these metrics are for judging.
- [`../../test/voice-evaluation/README.md`](../../test/voice-evaluation/README.md) - the harness and how to run it.
- [`../concepts/model-formats-and-inference.md`](../concepts/model-formats-and-inference.md) - what RTF means and why the two conventions differ.
