# Measurements

**Last Updated**: 2026-09-13

The instrument log: the figure now in force for each quantity the audio design
rests on, with the date it was taken, what took it, and a link to the record
behind it. [../../CLAUDE.md](../../CLAUDE.md) Guardrail #10 in one line: **an
unmeasured number is labelled an estimate and may not justify a design.**

Three rules govern this page:

- **A benchmark run is not appended here.** A run is written up as its own
  frozen record under `benchmarks/`, named for what it measured and the date;
  this page carries the one figure in force and links to it. The naming rule is
  in [documentation-structure.md](documentation-structure.md).
- **The speaking pace is now measured, and the figures that rest on it are no
  longer estimates.** It was assumed at 150 words a minute until 2026-09-12,
  when a model read the corpus on the runner at **129.5**. Every byte and hour
  figure below was re-taken at the measured pace; the superseded values are in
  the earlier record, not here.
- **A real-time factor names the machine that read it.** Audio duration and pace
  are host-independent because the model is deterministic, but wall clock is
  not: the same corpus read at 1.0112 on the runner and 2.576 on a laptop. A
  factor without a host attached may not be compared against the job cap.

There are five records today:
[2026-09-11 - Input volume and the price of audio](benchmarks/2026-09-11-input-volume-and-audio-cost.md)
took the input census, and
[2026-09-12 - Kokoro on a CI runner](benchmarks/2026-09-12-kokoro-on-a-ci-runner.md)
took the pace and the first runner reading, and
[2026-09-12 - Real text and the shard arithmetic](benchmarks/2026-09-12-real-text-and-shard-arithmetic.md)
re-took the pace on text nobody chose for the test and corrected a budget that
had been derived for a single runner. [2026-09-13 - Six voices
graded](benchmarks/2026-09-13-six-voices-graded.md) put six voices on the runner
with speed and verbalization accuracy measured together, and unseated the
incumbent on both. The measured counts were taken over 22 committed yen-idhazh
digest days on a developer machine; a count of items, words or bytes travels and
names no machine, so none is stated.

## Measured - the input census

Counts over 22 committed yen-idhazh digest days, taken 2026-09-11 with
[`measure_input.py`](../../backend/utilities/measure_input.py). These are the
only figures on this page that are measurements.

| Quantity | In force | What took it | Date |
| --- | --- | --- | --- |
| Days measured | 22 days | `measure_input.py` over yen-idhazh `main` | 2026-09-11 |
| Items, total | 8,772 items | `measure_input.py` | 2026-09-11 |
| Summary words, total | 790,964 words | `measure_input.py` | 2026-09-11 |
| Items a day, median | 370 items | `measure_input.py` | 2026-09-11 |
| Items a day, max | 731 items | `measure_input.py` | 2026-09-11 |
| Words a summary, mean | 90.2 words | `measure_input.py` | 2026-09-11 |
| Words a summary, p90 | 132 words | `measure_input.py` | 2026-09-11 |
| Words a summary, max | 242 words | `measure_input.py` | 2026-09-11 |

## Measured - audio duration and storage

Arithmetic on the counts above plus the **measured** pace, from
[`calculate_audio_budget.py`](../../backend/utilities/calculate_audio_budget.py). The codec in force is
opus@24k and the scope in force is every item, because the owner ruled every item
gets a voice and the 1 GB cap is held by an aggressive prune cycle rather than by
voicing fewer items (2026-09-11, see the record).

| Quantity | In force | Basis | Date |
| --- | --- | --- | --- |
| Speaking pace | 126.7 words/minute | **measured on real published text** - the load-bearing input | 2026-09-12 |
| Speech, one mean 90-word item | about 42.7 seconds | measured pace | 2026-09-12 |
| Speech, a median day (370 items) | 263.4 minutes (4.4 hours) | measured pace | 2026-09-12 |
| Speech, the busiest day (731 items) | 520.4 minutes (8.7 hours) | measured pace | 2026-09-12 |
| Storage, every item at opus@24k | 47.4 MB a day | measured pace; modelled encoder | 2026-09-12 |
| Days to fill the 1 GB Pages cap, every item at opus@24k | 22 days | **the binding constraint** | 2026-09-12 |

Storage is the binding constraint: at 46 MB a day the published site is full in
22 days, which is why the prune cycle is load-bearing. The record holds the same
figures for the other codecs (opus@16k, opus@32k, mp3@64k) and the narrower
scopes (top 50, 20, 10); those are alternatives the owner ruling did not take, so
the log carries only the in-force scope and codec.

## Compute - one runner reading, no spread

Wall-clock against the 6 h job cap, from
[`calculate_audio_budget.py`](../../backend/utilities/calculate_audio_budget.py) at the measured
factor. **One repeat on shared hardware, so there is no spread**: these are
single readings, not a distribution.

| Quantity | In force | Basis | Date |
| --- | --- | --- | --- |
| Real-time factor, Kokoro **fp32** | **0.359 to 0.453** over four runs | `bm_george`, `ubuntu-latest`, AMD EPYC, 4 cores ([record](benchmarks/2026-09-13-six-voices-graded.md)) | 2026-09-13 |
| Real-time factor, Kokoro **q8** | **0.996 to 1.011** over four runs | same corpus and hardware | 2026-09-13 |
| Quantisation penalty, q8 against fp32 | **2.2x to 2.8x slower**, identical audio | the two rows above | 2026-09-13 |
| Real-time factor, **Supertonic** | **0.084 to 0.100** | the fastest measured; OpenRAIL-M, so it cannot ship | 2026-09-13 |
| Real-time factor, MMS-TTS | 0.210 to 0.255 | control arm only; CC-BY-NC | 2026-09-13 |
| **Verbalization accuracy, Supertonic** | **40.7% to 48.2%** | 27 graded cases, ASR round-trip | 2026-09-13 |
| **Verbalization accuracy, Kokoro** | **29.6%** (8 of 27) | stable across fp32 and q8 - quantisation changes speed, not words | 2026-09-13 |
| Verbalization accuracy, MMS-TTS | 0% to 7.4% | unusable for news copy | 2026-09-13 |
| Peak memory, Kokoro | 1222 to 1451 MB | per arm, resident set | 2026-09-13 |
| Peak memory, Supertonic | 639 to 657 MB | 44% of the incumbent's | 2026-09-13 |
| Peak memory, Chatterbox (0.5B, autoregressive) | **5792 MB** | of the runner's 16 GB - an AR model at this size is feasible | 2026-09-13 |

**The runner's own spread is now visible and it is not small.** Kokoro fp32 read
0.359, 0.433 and 0.453 on three runs of identical work - a 26 percent spread -
while q8 held between 0.996 and 1.011, a spread of 1.5 percent. A single reading
from a GitHub runner is one sample of a noisy process, and the faster the arm the
larger the proportional noise, because a shorter job spends more of its life
competing for a shared machine. **Two figures that differ by less than about a
quarter are not distinguishable on one run each.**
| Wall-clock, median day (370 items) | 4.44 h - 74% of the cap, fits | measured factor | 2026-09-12 |
| Wall-clock, busiest day (731 items) | 8.77 h - 146% of the cap, **busts** | measured factor | 2026-09-12 |
| Budget RTF, one runner | 0.692 | arithmetic on the two rows above | 2026-09-12 |
| Budget RTF, four runners | **2.767** | the shape the pipeline actually uses | 2026-09-12 |
| Busiest day on four runners | **2.19 h - 37% of the cap, fits** | measured factor, sharded | 2026-09-12 |
| Real-time factor on a developer laptop | 2.576 - **not comparable to the cap** | same model and corpus, Intel i7-1265U | 2026-09-12 |

The laptop row is here so it is never mistaken for a runner reading. It is 2.55
times slower on identical work, which is close enough to look plausible and far
enough to price the design on hardware it will never run on.

## Still unmeasured

Each line names the measurement that would settle it. Nothing here may justify a
design decision.

| Quantity | Current basis | What settles it |
| --- | --- | --- |
| Whether the audio is good enough to publish | unjudged | listen at [miztiik.github.io/yen-oli-kalari](https://miztiik.github.io/yen-oli-kalari/) - six voices, published |
| Spread on the runner real-time factor | **measured: 26% on fp32, 1.5% on q8** | more repeats would tighten it; four runs is enough to know a single reading cannot separate close arms |
| Chatterbox real-time factor | it ran, its arm recorded no per-clip timings | add timing to the python arm and re-run |
| Bytes per clip from a real encoder | modelled as bitrate times duration | encode real speech at opus@24k and measure the file |
| Opus bitrate for acceptable speech quality | untested | encode and listen at 16k, 24k, 32k |
| Steady-state site size under every-item plus prune | not built | run the prune cycle over several published days and weigh the tree |
| Naturalness, intelligibility, seams, defects | instruments built, unjudged | a person with headphones; no figure replaces it |
| Qwen3-TTS and Higgs | runtimes unwired | the multi-graph loop Chatterbox proved, applied to their graphs |

## How to add a row here

Run the measurement, then record the quantity, the value, the unit, what took
it, and the date, and link the record behind it. A figure that arrives without a
measurement is an estimate: label it one in its own row, name the assumption it
rests on, and move it to "Still unmeasured" if nothing measures it yet. When a
run supersedes a figure, replace the number in the same commit and leave the
record where it is.

## See also

- [2026-09-12 - Kokoro on a CI runner](benchmarks/2026-09-12-kokoro-on-a-ci-runner.md) - the run that measured the pace and the first runner factor.
- [2026-09-11 - Input volume and the price of audio](benchmarks/2026-09-11-input-volume-and-audio-cost.md) - the input census, and the derived figures the run above superseded.
- [../../test/voice-evaluation/README.md](../../test/voice-evaluation/README.md) - the listening harness that will settle whether the audio is good enough to publish.
- [documentation-structure.md](documentation-structure.md) - why a run gets its own record and never the log's name.
- [../how-to/run-the-gates.md](../how-to/run-the-gates.md) - how to re-run the two scripts that took these figures.
- [repository-layout.md](repository-layout.md) - where the caps these numbers measure are enforced.
- [../concepts/pipeline-loop.md](../concepts/pipeline-loop.md) - the prune cycle that holds the 1 GB cap the storage figures size.
- [../../CLAUDE.md](../../CLAUDE.md) - Guardrail #2 (the runner is the architecture) and Guardrail #10 (measured, not estimated).
