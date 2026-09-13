# 2026-09-13 - Six voices graded, and the incumbent is beaten

**Last Updated**: 2026-09-13

The first run where speed and correctness were measured together on the
production hardware. It unseats the incumbent on both axes at once, and the
model that wins cannot be used.

## Conditions

- GitHub-hosted `ubuntu-latest`, AMD EPYC, 4 vCPU, 16 GB, no GPU. Run
  [34724777558](https://github.com/miztiik/yen-oli-kalari/actions/runs/34724777558).
- Seven arms in parallel, one runner each. Weights streamed from Hugging Face
  into the runner cache and dropped with the runner - the repository carries no
  model.
- Corpus: 24 real published summaries, 1,935 words. Verbalization: 28 cases from
  [`verbalization-suite.json`](../verbalization-suite.json), graded by
  `faster-whisper` against the exact expected spoken form each carries.
- One repeat, so **no spread**. Every figure is a single reading.

## What was measured

| Model | Licence | RTF | x real time | **Verbalization** | wpm | Peak MB |
| --- | --- | --- | --- | --- | --- | --- |
| **Supertonic M1** | OpenRAIL-M | **0.0965** | **10.4x** | **44.4%** | 125.4 | 639 |
| **Supertonic F1** | OpenRAIL-M | 0.0979 | 10.2x | **44.4%** | 125.9 | 657 |
| MMS-TTS eng | CC-BY-NC | 0.2100 | 4.8x | 7.4% | 138.2 | 721 |
| **Kokoro fp32 `bm_george`** | Apache-2.0 | 0.3591 | 2.8x | 29.6% | 126.6 | 1451 |
| Kokoro fp32 `bf_emma` | Apache-2.0 | 0.4336 | 2.3x | 29.6% | 126.4 | 1424 |
| Kokoro q8 `bm_george` | Apache-2.0 | 0.9993 | 1.0x | 29.6% | 126.7 | 1222 |
| Chatterbox multilingual | MIT | ran, 6 clips | - | not graded | - | 5792 |

## What this settles

**Supertonic beats the incumbent on both axes at once.** Three times faster and
half again as accurate on verbalization - 44.4 percent against 29.6 - at 44
percent of the memory. That is not a trade-off; it is a straight loss for
Kokoro on the two things that were being measured.

**And it cannot be used.** Supertonic is OpenRAIL-M, which carries use-based
restrictions, and its upstream repository is archived - no issues, no pull
requests, no fixes. Kokoro is Apache-2.0 and maintained. **The best model
measured is the one this project may not ship**, which is the sort of result
that only appears when licence and performance are measured in the same table.

**Quantisation is confirmed as pure cost on this model.** fp32 reads 0.3591
against q8's 0.9993 - **2.78 times faster for byte-identical audio** and
identical verbalization. Every figure this project took before 2026-09-12 was on
the slowest of the three available quantisations.

**Nobody clears 50 percent on verbalization.** The best voice measured gets fewer
than half the currency amounts, quarters, clocks and initialisms right. Reading
news copy correctly is unsolved by every model here, and the failures are
specific: `GBP 8.75m` as "8.75 bps", `08:30` as "0.830", `AI/ML` as "AML",
`Q3 FY26` as "Q3FI26".

**A 0.5B autoregressive model runs on this hardware.** Chatterbox loaded in 60
seconds and voiced six summaries, peaking at 5.8 GB against the runner's 16.
That settles the open question of whether an AR model is feasible here at all -
it is, and the remaining question is whether it is fast enough, which needs the
per-clip figures its arm did not yet record.

**The British voices are indistinguishable on these metrics.** `bm_george` and
`bf_emma` differ by 0.07 in real-time factor and not at all in verbalization, so
the choice between them is a listening judgement rather than a measured one.

## What it does not settle

- **One repeat.** A GitHub runner is shared hardware and no spread was taken.
- **Nobody has listened.** Verbalization accuracy is not naturalness, and no
  figure here says whether any of this is pleasant to hear.
- **Chatterbox is unscored.** It ran, and its arm wrote no metrics and no
  verbalization audio, so its real-time factor is unknown.
- **Supertonic's accent is unverified.** Its voices are labelled F1-F5 and M1-M5
  with no accent given, so the preference for British English is unmet and
  unmeasurable without a listener.
- **The grader is generous by construction.** A case passes when the expected
  tokens are present in any order, which tolerates how a transcriber arranges
  them and would not catch a model that said the right words in the wrong order.

## How the run was made honest

The first graded pass reported 18.5 percent for Supertonic. Most of those
failures were the grader's own: **Whisper re-normalises spoken numbers back into
digits**, so a model correctly saying "twelve point five billion euros" was
transcribed as "EUR 12.5 billion" and then failed for not matching the expected
spoken form. Both sides are now normalised toward words, and order is not
required because a currency symbol is written first and spoken last. The score
moved to 44.4 percent, and seven behaviours are pinned in
[`../../../tests/test_verbalization_grader.py`](../../../tests/test_verbalization_grader.py).

## See also

- [`../evaluation-coverage.md`](../evaluation-coverage.md) - which of the twelve metrics are measured and which are not.
- [`../voice-model-survey.md`](../voice-model-survey.md) - every model considered, and what blocks the ones not here.
- [`../measurements.md`](../measurements.md) - the figure now in force for each quantity.
- [`2026-09-12-quantisation-was-costing-not-saving.md`](2026-09-12-quantisation-was-costing-not-saving.md) - the earlier run this confirms on real hardware.
