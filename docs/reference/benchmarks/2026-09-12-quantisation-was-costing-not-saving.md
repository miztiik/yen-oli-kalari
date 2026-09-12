# 2026-09-12 - The quantisation was costing, not saving

**Last Updated**: 2026-09-12

Every voice measurement this project has taken was on `q8`, chosen without ever
being compared to anything. It is the slowest of the three quantisations
available, by a factor of two.

## Why this was checked at all

A model survey turned up two independent reports of int8 degrading
StyleTTS2-family models, which is Kokoro's family: KittenTTS ships an int8 build
its own README warns about, and the LiteRT port of KittenTTS rejected int8 at a
log-mel correlation of 0.913 with altered durations.

The sharper signal was arithmetic. This project measured Kokoro `q8` at a
real-time factor of **1.0112** on the runner, while comparable compact models
publish **0.03 to 0.25** on similar CPU thread counts, and a published 82M
StyleTTS2 model on the Kokoro recipe reports **0.25** on ONNX CPU
([arXiv 2608.12814](https://arxiv.org/abs/2608.12814)). Being four times slower
than the closest published comparator is a fact that wants an explanation.

## Conditions

- 6 real published summaries stepped across the length distribution, 436 words,
  from `test/onnx-runtime-comparison/real-summaries/summaries.json`.
- 2 repeats per clip, median taken. `kokoro-js` 1.2.1,
  `onnx-community/Kokoro-82M-v1.0-ONNX`, voice `af_heart`, chunked at 40 words.
- Timed on a developer laptop (Intel i7-1265U), **not the runner**. The absolute
  figures do not transfer. **The ratio between two quantisations on one machine
  does**, and the ratio is the finding.
- Tool: `test/voice-evaluation/compare-quantisations.mjs`.

## What was measured

| Quantisation | RTF | Audio | Compute | Load time | Relative |
| --- | --- | --- | --- | --- | --- |
| **fp32** | **0.5474** | 213.05 s | 116.6 s | 42.3 s | **fastest** |
| q4 | 0.6624 | 215.02 s | 142.4 s | 24.3 s | 1.21x slower |
| **q8** | **1.1837** | 213.00 s | 252.1 s | 1.6 s | **2.16x slower** |

**`q8` is 2.16 times slower than `fp32` and produces audio of the same length.**
It is not trading quality for speed. It is not trading anything: it is slower
and identical.

## Why a smaller model can be slower

Quantisation reduces the bytes that must be read per inference step, which helps
when a machine is memory-bandwidth-bound - which is the usual case for a large
language model on a CPU. Kokoro is 82M parameters. At `fp32` that is roughly 330
MB, which fits in cache hierarchy and out of the bandwidth-bound regime
entirely. What `q8` adds is dequantisation arithmetic on every operator, paid on
a machine whose float units were never the constraint.

**The rule of thumb that quantisation is free speed comes from the 7B-and-up
world and does not transfer to an 82M model.** This project inherited the
assumption from a sibling that runs a 9B summariser, where it is correct.

## What this changes

The runner figure of 1.0112 was `q8`. Applying the measured ratio gives an
estimated **0.47** at `fp32` - which is below the **0.692** single-runner
budget.

| | q8 (measured) | fp32 (estimated at the measured ratio) |
| --- | --- | --- |
| RTF on the runner | 1.0112 | **~0.47** |
| Busiest day, 1 runner | 8.77 h - busts | **~4.06 h - fits** |
| Busiest day, 4 runners | 2.19 h | **~1.02 h** |

**So the busiest day may fit in a single job**, and the fan-out becomes headroom
rather than a requirement. That must be confirmed on the runner before it is
believed - the ratio transfers, the absolute figure does not.

## What this does not settle

- **Not measured on the runner.** The 0.47 above is the measured ratio applied
  to a measured runner figure, which is an estimate. `measure-voice.yml` should
  run all three quantisations.
- **Quality was not compared, only duration.** Identical audio length is
  necessary but not sufficient: `q8` could still differ in timbre or
  pronunciation. `q4` produced audio 0.92 percent longer, which means it is
  measurably not the same output and wants a listen before it is trusted.
- **`fp32` costs 42.3 s to load against 1.6 s for `q8`**, and roughly four times
  the bytes to download. Both are paid once per job, so across a 130-minute
  shard the load time is noise - but on a cold cache the download is not, which
  is what the model-weight cache in the workflow is for.
- **One machine, one thread count.** The ratio may differ on the runner's EPYC.

## See also

- [`2026-09-12-real-text-and-shard-arithmetic.md`](2026-09-12-real-text-and-shard-arithmetic.md) - the corpus this used and the budget it is judged against.
- [`2026-09-12-kokoro-on-a-ci-runner.md`](2026-09-12-kokoro-on-a-ci-runner.md) - the runner figure this re-prices.
- [`../voice-model-survey.md`](../voice-model-survey.md) - the survey that prompted the check.
- [`../measurements.md`](../measurements.md) - the figure now in force.
