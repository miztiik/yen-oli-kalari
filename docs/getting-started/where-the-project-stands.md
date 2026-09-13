# Where the project stands

**Last Updated**: 2026-09-12

What has been decided about the voice, what is still open, and the one thing to
do next. **Verdicts only** - every figure lives in
[`../reference/measurements.md`](../reference/measurements.md) and every reason
lives in the benchmark record linked beside it.

To find a page rather than a verdict, use
[`../reference/documentation-map.md`](../reference/documentation-map.md).

## In one sentence

The incumbent has been beaten on speed and accuracy at once by a model whose
licence forbids shipping it, and no voice measured reads news copy correctly
more than half the time.

## The measured field, 2026-09-13

| Model | Licence | RTF | Verbalization | Verdict |
| --- | --- | --- | --- | --- |
| Supertonic M1 | OpenRAIL-M | **0.0965** | **44.4%** | best measured, **cannot ship** |
| Kokoro fp32 `bm_george` | Apache-2.0 | 0.3591 | 29.6% | **the shippable option** |
| Kokoro q8 | Apache-2.0 | 0.9993 | 29.6% | superseded - 2.78x slower for identical audio |
| MMS-TTS | CC-BY-NC | 0.2100 | 7.4% | control only |
| Chatterbox multilingual | MIT | ran, unscored | - | AR on CPU is feasible: 6 clips, 5.8 GB peak |

Full record: [2026-09-13 - Six voices graded](../reference/benchmarks/2026-09-13-six-voices-graded.md).



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
| **Is the audio good enough to publish?** | Six voices are now measured and graded. **Nobody has listened to one.** No figure here says whether any of it is pleasant to hear. |
| Can the project use the best model it measured? | Supertonic wins on speed and accuracy and is OpenRAIL-M with an archived upstream. Kokoro is Apache-2.0 and maintained. This is an owner ruling, not a measurement. |
| How fast is Chatterbox? | It ran on the runner - 6 clips, 5.8 GB peak - so an autoregressive model is feasible here. Its arm recorded no per-clip timings, so the real-time factor is unknown. |
| Can any voice read news copy correctly? | The best measured gets 44.4 percent. Nobody clears half, and the failures are specific: currency units, clocks, initialisms, fiscal quarters. |

## Next action

**Listen.** The published page is at
[miztiik.github.io/yen-oli-kalari](https://miztiik.github.io/yen-oli-kalari/) -
six voices, the same 24 summaries, an A/B tab that plays two of them against
each other blind. Every instrument this project owns is built and running, and
none of them replaces a person with headphones on.

The second thing is an owner ruling rather than a measurement: **Supertonic wins
and cannot ship.** Either the licence is acceptable for this use, or the field
narrows to Kokoro and whatever the blocked runtimes turn out to be worth.

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
