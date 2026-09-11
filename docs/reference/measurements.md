# Measurements

**Last Updated**: 2026-09-11

The instrument log: the figure now in force for each quantity the audio design
rests on, with the date it was taken, what took it, and a link to the record
behind it. [../../CLAUDE.md](../../CLAUDE.md) Rule #10 in one line: **an
unmeasured number is labelled an estimate and may not justify a design.**

Three rules govern this page:

- **A benchmark run is not appended here.** A run is written up as its own
  frozen record under `benchmarks/`, named for what it measured and the date;
  this page carries the one figure in force and links to it. The naming rule is
  in [documentation-structure.md](documentation-structure.md).
- **A figure that rests on the speaking-pace assumption is an estimate, and its
  row says so.** The whole audio-cost model hangs off 150 words a minute, which
  is an assumption and not a measurement. A model that speaks at 130 words a
  minute moves every estimate below by about 15 percent.
- **No model has run on the target runner**, so every real-time-factor figure is
  a what-if and not a reading.

There is exactly one record today:
[2026-09-11 - Input volume and the price of audio](benchmarks/2026-09-11-input-volume-and-audio-cost.md).
Every figure below comes from it. The measured counts were taken over 22
committed yen-idhazh digest days on a developer machine; a count of items, words
or bytes travels and names no machine, so none is stated.

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

## Estimated - audio duration and storage

Arithmetic on the counts above plus the assumed pace, from
[`price_audio.py`](../../backend/utilities/price_audio.py). The codec in force is
opus@24k and the scope in force is every item, because the owner ruled every item
gets a voice and the 1 GB cap is held by an aggressive prune cycle rather than by
voicing fewer items (2026-09-11, see the record). **Every row here is an estimate
that rests on the 150-words-a-minute assumption.**

| Quantity | In force | Basis | Date |
| --- | --- | --- | --- |
| Speaking pace | 150 words/minute | **assumption, not measured** - the load-bearing input | 2026-09-11 |
| Speech, one mean 90-word item | about 36 seconds | estimate on the 150 wpm assumption | 2026-09-11 |
| Speech, a median day (370 items) | 222 minutes (3.7 hours) | estimate on the 150 wpm assumption | 2026-09-11 |
| Storage, every item at opus@24k | 40.0 MB a day | estimate on the 150 wpm assumption | 2026-09-11 |
| Days to fill the 1 GB Pages cap, every item at opus@24k | 26 days | estimate; **the binding constraint** | 2026-09-11 |

Storage is the binding constraint, not compute: at 40 MB a day the published
site is full in 26 days, which is why the prune cycle is load-bearing. The record
holds the same figures for the other codecs (opus@16k, opus@32k, mp3@64k) and the
narrower scopes (top 50, 20, 10); those are alternatives the owner ruling did not
take, so the log carries only the in-force scope and codec.

## Compute - a what-if until the runner speaks

Wall-clock against the 6 h job cap, from
[`price_audio.py`](../../backend/utilities/price_audio.py). No text-to-speech
model has run on `ubuntu-latest`, so the real-time factor is chosen, not read.
**Every row here is a what-if, and also rests on the 150 wpm assumption.**

| Quantity | In force | Basis | Date |
| --- | --- | --- | --- |
| Wall-clock, every item at RTF 1.0 | 3.71 h - under the 6 h cap | what-if; no runner reading | 2026-09-11 |
| Wall-clock, every item at RTF 3.0 | 11.12 h - busts the 6 h cap | what-if; the only scope and factor that busts | 2026-09-11 |
| Real-time factor on the runner | unmeasured | no model has run on `ubuntu-latest` | 2026-09-11 |

## Still unmeasured

Each line names the measurement that would settle it. Nothing here may justify a
design decision.

| Quantity | Current basis | What settles it |
| --- | --- | --- |
| Speaking pace of a real voice model | assumed 150 wpm | run the chosen text-to-speech model and time its output against the word count |
| Real-time factor on `ubuntu-latest` | unmeasured; RTF figures above are what-ifs | run the model on the runner and read wall-clock against audio seconds produced |
| Bytes per clip from a real encoder | modelled as bitrate times duration | encode real speech at opus@24k and measure the file |
| Opus bitrate for acceptable speech quality | untested | encode and listen at 16k, 24k, 32k |
| Steady-state site size under every-item plus prune | not built | run the prune cycle over several published days and weigh the tree |

## How to add a row here

Run the measurement, then record the quantity, the value, the unit, what took
it, and the date, and link the record behind it. A figure that arrives without a
measurement is an estimate: label it one in its own row, name the assumption it
rests on, and move it to "Still unmeasured" if nothing measures it yet. When a
run supersedes a figure, replace the number in the same commit and leave the
record where it is.

## See also

- [2026-09-11 - Input volume and the price of audio](benchmarks/2026-09-11-input-volume-and-audio-cost.md) - the one record behind every figure here.
- [documentation-structure.md](documentation-structure.md) - why a run gets its own record and never the log's name.
- [../how-to/run-the-gates.md](../how-to/run-the-gates.md) - how to re-run the two scripts that took these figures.
- [repository-layout.md](repository-layout.md) - where the caps these numbers measure are enforced.
- [../concepts/pipeline-loop.md](../concepts/pipeline-loop.md) - the prune cycle that holds the 1 GB cap the storage figures size.
- [../../CLAUDE.md](../../CLAUDE.md) - Rule #2 (the runner is the architecture) and Rule #10 (measured, not estimated).
