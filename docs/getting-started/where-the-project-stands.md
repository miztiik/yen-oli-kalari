# Where the project stands

**Last Updated**: 2026-09-12

What has been decided about the voice, what is still open, and the one thing to
do next. **Verdicts only** - every figure lives in
[`../reference/measurements.md`](../reference/measurements.md) and every reason
lives in the benchmark record linked beside it.

To find a page rather than a verdict, use
[`../reference/documentation-map.md`](../reference/documentation-map.md).

## In one sentence

The incumbent voice model is good enough on speed, has been running in its
slowest configuration, and nobody has listened to it yet.

## Settled

| Question | Answer | Record |
| --- | --- | --- |
| How fast does the voice run on the production runner? | **RTF 1.0112** at `q8` | [Kokoro on a CI runner](../reference/benchmarks/2026-09-12-kokoro-on-a-ci-runner.md) |
| How fast does it speak? | **126.7 words a minute**, on real published text | [Real text and shard arithmetic](../reference/benchmarks/2026-09-12-real-text-and-shard-arithmetic.md) |
| Is `q8` the right quantisation? | **No. It is 2.16x slower than `fp32` on identical audio.** | [The quantisation was costing](../reference/benchmarks/2026-09-12-quantisation-was-costing-not-saving.md) |
| Does the busiest day fit a 6 h job? | At `q8` on one runner, no. **On four runners, yes - 2.19 h.** At `fp32` it may fit on one. | [Real text and shard arithmetic](../reference/benchmarks/2026-09-12-real-text-and-shard-arithmetic.md) |
| Is there a better open model? | **No.** Kokoro is the highest-rated open-licensed model on TTS Arena V2 (rank 30, Elo 1477). | [Voice model survey](../reference/voice-model-survey.md) |
| Is storage a problem? | **No.** The prune holds repository size; the cap sets a retention window, not a limit. | [Pipeline loop](../concepts/pipeline-loop.md) |

## Open

| Question | Why it is still open |
| --- | --- |
| **Is the audio good enough to publish?** | 24 real clips exist, hazard-tagged. **Nobody has listened to one.** This is the only question left that can still kill the design. |
| Does `fp32` hold up on the runner? | The 2.16x ratio was measured on a laptop. The ratio transfers; the absolute figure does not. |
| Does sharding work in practice? | The four-runner figure is arithmetic. `measure-voice.yml` exists and has never been dispatched. |
| Is a 15M model as good? | KittenTTS nano 0.8 is the same architecture family at a fifth the size, Apache-2.0, and won a blind listening test. Unbenchmarked here. |

## Next action

**Switch to `fp32` and dispatch
[`.github/workflows/measure-voice.yml`](../../.github/workflows/measure-voice.yml).**
One config change. It confirms the quantisation finding on real hardware and
probably removes the only compute constraint the design has.

Then run `npm run build-clips` in
[`test/voice-evaluation/`](../../test/voice-evaluation/README.md) and listen.

## What is built, and what is not

**Built** - the measurement harness, the listening page, the corpus builders, the
sharded workflow, the budget calculator, and the documentation-map test.

**Not built** - the pipeline itself. No stage of the daily loop exists in code:
no read, no synthesise, no publish, no prune. The Listen and Console surfaces are
specified in [`../concepts/ui-shell.md`](../concepts/ui-shell.md) and not
written.

## How to keep this page true

**A verdict here is a claim with a record behind it.** When a run supersedes one,
this page changes in the same commit as the log - a stale summary is worse than
no summary, because it is read first and trusted most.

**A figure does not belong here.** If a number appears in a row above, it is
there as the verdict's evidence and its home is still the instrument log. Two
homes for one number is the failure
[`../reference/documentation-structure.md`](../reference/documentation-structure.md)
exists to stop.

## See also

- [`../reference/documentation-map.md`](../reference/documentation-map.md) - every page, and the question each answers.
- [`../reference/measurements.md`](../reference/measurements.md) - the figure now in force for each quantity.
- [`../../README.md`](../../README.md) - what the project is, for somebody who has not seen it before.
- [`../concepts/vision.md`](../concepts/vision.md) - what it is for, and who for.
