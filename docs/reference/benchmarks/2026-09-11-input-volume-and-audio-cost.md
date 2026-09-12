# 2026-09-11 - Input volume and the price of audio

**Last Updated**: 2026-09-11

What one day of yen-idhazh output costs to voice. This run settles whether
every item can carry audio. It cannot.

## Conditions

- Measured 2026-09-11 on a local checkout of `miztiik/yen-idhazh` at `main`,
  22 committed days (`frontend/public/digest/*/*/*/digest.json`).
- Tools: `backend/utilities/measure_input.py`, `backend/utilities/calculate_audio_budget.py`.
- Ceilings are GitHub's, not ours: 1 GB published Pages site, 6 h a job.
- Speaking pace is an assumption, declared: 150 words a minute, a normal
  news-read pace. Everything downstream of it is an estimate, not a measurement.

## What one day holds

| Quantity | Value |
| --- | --- |
| Days measured | 22 |
| Items | 8,772 |
| Summary words | 790,964 |
| Items a day, median | 370 |
| Items a day, max | 731 |
| Words a summary, mean | 90.2 |
| Words a summary, p90 | 132 |
| Words a summary, max | 242 |

A 90-word summary is about 36 seconds of speech. A median day is **222 minutes
of audio** - 3.7 hours.

## What it costs to store

Megabytes a day, by how many items get a voice:

| Scope | Items | Minutes a day | opus@16k | opus@24k | opus@32k | mp3@64k |
| --- | --- | --- | --- | --- | --- | --- |
| Every item | 370 | 222.5 | 26.7 | 40.0 | 53.4 | 106.8 |
| Top 50 | 50 | 30.1 | 3.6 | 5.4 | 7.2 | 14.4 |
| Top 20 | 20 | 12.0 | 1.4 | 2.2 | 2.9 | 5.8 |
| Top 10 | 10 | 6.0 | 0.7 | 1.1 | 1.4 | 2.9 |

Days until a 1 GB site is full, at opus@24k:

| Scope | Days | Years |
| --- | --- | --- |
| Every item | **26** | 0.07 |
| Top 50 | 189 | 0.52 |
| Top 20 | 473 | 1.30 |
| Top 10 | 946 | 2.59 |

## What it costs to generate

Wall-clock against the 6 h job cap, by real-time factor:

| Scope | RTF 0.1 | RTF 0.3 | RTF 1.0 | RTF 3.0 |
| --- | --- | --- | --- | --- |
| Every item | 0.37 h | 1.11 h | 3.71 h | **11.12 h - busts** |
| Top 50 | 0.05 h | 0.15 h | 0.50 h | 1.50 h |
| Top 20 | 0.02 h | 0.06 h | 0.20 h | 0.60 h |
| Top 10 | 0.01 h | 0.03 h | 0.10 h | 0.30 h |

## What this settles

**Voicing every item is not affordable, and storage is the binding constraint
rather than compute.** At 40 MB a day the published site is full in 26 days,
and no retention window fixes that without throwing away the archive the
project exists to keep. Compute only fails at RTF 3.0 and above, so a fast
model does not rescue the design - the bytes do the killing.

**So a selection step is load-bearing, not a nicety.** Something has to decide
which items get a voice before any model runs. That decision is the first
contract this project owes.

## What it does not settle

- The speaking pace is assumed, not measured. A model that speaks at 130 words
  a minute moves every figure here by 15 percent.
- No model has been run yet on the target runner, so every RTF column is a
  what-if rather than a reading.
- Opus bitrate for speech at acceptable quality is untested here.

## See also

- `backend/utilities/measure_input.py` - the item and word census.
- `backend/utilities/calculate_audio_budget.py` - the storage and wall-clock model.
