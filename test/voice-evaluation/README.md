# Voice evaluation

**Last Updated**: 2026-09-13

Keeps the audio a voice model produced, beside the text it was made from, so a
person can decide whether it is good enough to publish.

The speed harness in [`../onnx-runtime-comparison`](../onnx-runtime-comparison)
measures how fast a model runs and then throws the audio away. Speed is not
quality, and the CI-runner benchmark says so in writing: *"Quality is not
measured. Nothing here says whether the audio is good enough to publish, whether
names and numbers are pronounced correctly, or whether chunk boundaries are
audible."* This harness is the other half.

## Running it

```bash
npm install
npm run build-clips     # synthesises the corpus and writes the page index
```

Then open `page/index.html`. It needs no server: the manifest is emitted as a
script rather than fetched, because a browser reading a `file://` document
refuses `fetch` against a sibling JSON file.

If a URL is wanted instead - or an automated check, which browsers will not run
against `file://`:

```bash
npm run serve           # http://127.0.0.1:8791/page/index.html
```

Rebuilding the page without re-synthesising nine minutes of audio:

```bash
npm run build-page
```

### Pointing it at a different voice

```bash
MODEL_ID=onnx-community/Kokoro-82M-v1.0-ONNX VOICE=af_bella npm run build-clips
```

`MODEL_ID`, `QUANTISATION`, `VOICE` and `MAX_WORDS_A_CHUNK` are all read from the
environment. The manifest records whichever were used, so two evaluations of
different voices can be told apart after the fact.

That applies to `build-evaluation-clips.mjs`, which is the older
listen-and-judge path. **The benchmark path is different and stricter**: it
resolves its knobs through `run-config.mjs`, records all of them, and refuses to
measure more than one model in a run. Use `benchmark-model.mjs` and the
`benchmark one voice` workflow when the output is a figure rather than a clip.

## What the page asks

Four scores, and each one closes a question the benchmark left open rather than
being a generic audio-quality axis. Three is the pass mark.

| Score | The question it closes |
| --- | --- |
| Intelligibility | Could every word be made out without replaying? |
| Pronunciation | Names, numbers, acronyms. The corpus is news summaries, so proper nouns are the load-bearing case. |
| Prosody | Does it read like a person reading news, or like a list of words? |
| Seams | Are the chunk joins audible? The pipeline splits every summary over 40 words, so a seam is an artefact this project creates and therefore one it owns. |

A defect carries a timestamp, because a note saying "sounds a bit off" cannot be
acted on and `at 12.4s` can. The page marks each chunk boundary in the displayed
text, so a listener knows where to expect a seam before being asked whether they
heard one.

Scores persist to the browser's local storage as you work. **Download
evaluation** writes a JSON file shaped by [`evaluation-schema.json`](evaluation-schema.json).
It fetches every run's manifest first: the page is a shell that loads one run at
a time, so an export that only read what happened to be in memory would write a
partial record that looked complete.

## The manifest records its host, and that is not decoration

Audio duration and speaking pace are host-independent, because the model is
deterministic - the same corpus produced the same 534.75 s and the same 129.5
words a minute on both machines it has run on. Wall clock is not:

| Host | Real-time factor |
| --- | --- |
| GitHub `ubuntu-latest`, AMD EPYC 7763, 4 cores | **1.0112** |
| Local laptop, Intel i7-1265U | **2.576** |

The laptop is 2.55 times slower. Both figures are plausible-looking, which is
exactly the problem: a laptop reading compared against the runner's 0.707 budget
would price the design on hardware it will never run on. So the manifest carries
the host that timed it, and the page draws the budget line **only** when the
runner did the timing. Off the runner it says so and shows the real-time factor
without a budget it cannot be compared against.

## Files

| Path | What it is |
| --- | --- |
| `run-manifest.schema.json` | **The contract.** What a run manifest must contain, and why each field is there. Four producers write it; the collator, the page index and every benchmark record read it. |
| `run-config.mjs` | The single resolver. The only thing that may turn environment knobs into a run configuration or derive a `configSlug`. Run it with no arguments to see what a configuration resolves to. |
| `benchmark-model.mjs` | Voices the corpus and the verbalization suite on the node runtimes, and writes the manifest. |
| `benchmark_genai_model.py` | The same for multi-graph autoregressive models that need a generation loop. Reads its configuration from the resolver rather than keeping a second copy of the rules. |
| `merge-shards.mjs` | Puts the shards of ONE run back into one manifest. Refuses shards whose run ids differ. |
| `collate-benchmarks.mjs` | Ranks what finished, says what did not, and refuses to draw the job-cap table for an unisolated reading. |
| `build-evaluation-clips.mjs` | Synthesises one WAV a summary into `results/<model>/<quant>/`. Never overwrites another run. |
| `build-page-index.mjs` | Writes the small index the page fetches at runtime, naming each run and where its manifest lives. |
| `serve.mjs` | Static server with range support, for browser checks only. |
| `evaluation-schema.json` | The shape a downloaded listening evaluation takes. |
| `page/` | The listening surface. No framework, no build step. |
| `results/` | Generated audio and one manifest per run. Not committed. |

## One model, one configuration, one run

A benchmark figure is only comparable against another figure taken the same way,
so a run measures **one model at one configuration** with nothing else voicing.
The full reasoning, the knobs and how to tweak one at a time is in
[`../../docs/how-to/benchmark-a-voice.md`](../../docs/how-to/benchmark-a-voice.md).

The short version: every knob that changes a figure - chunk size, repeats,
threads, item ceiling, shard count - is resolved by `run-config.mjs`, flattened
into a `configSlug`, and written into the manifest as a `run` block:

```
kokoro-fp32-uk__c40-r1-t4-iall-s4
```

`run.config` is **closed** in the schema, so adding a knob without recording it
fails the contract test rather than silently producing a number nobody can
attribute. That is not hypothetical: the thread count was hardcoded in a
workflow and the item ceiling existed on one arm only, so neither was recorded
in any reading taken before the contract landed.

```powershell
# what does this configuration resolve to?
$env:MODEL = "kokoro-fp32-uk"; $env:SHARDS = "4"; node run-config.mjs
```

## It reuses the shell, it does not reinvent it

The page is a test surface, not the published Listen surface, but it speaks the
same component vocabulary so what is learned here transfers: one docked player
rather than one per row, the `ProgressTrack` groove with `peaks` null under the
2026-09-11 owner ruling, the wait drawn as a determinate buffer fill rather than
a spinner, and the inherited design tokens including the three audio tokens.

The charts are hand-rolled SVG rather than the inherited ECharts, because this
page must open from a file path with no bundle and twelve bars do not justify
197 KB. The panel chrome around them is the shape the Console will use.

## See also

- [`../onnx-runtime-comparison/README.md`](../onnx-runtime-comparison/README.md) - the speed harness and the shared corpus.
- [`../../docs/reference/benchmarks/2026-09-12-kokoro-on-a-ci-runner.md`](../../docs/reference/benchmarks/2026-09-12-kokoro-on-a-ci-runner.md) - the run that measured the pace and left quality open.
- [`../../docs/concepts/ui-shell.md`](../../docs/concepts/ui-shell.md) - the component vocabulary this page borrows.
- [`../../docs/concepts/design-system.md`](../../docs/concepts/design-system.md) - the tokens, and where the three audio tokens come from.

## Every run is kept, which is what makes a comparison possible

A run is one model at one quantisation, and it is written to
`results/<model-slug>/<quantisation>/`. Nothing is overwritten - two models
cannot be compared if only the most recent survives, and the first version of
this harness overwrote one manifest on every run, so the fp32, q8 and q4
readings of the same model ended up scattered across three different files.

The page reads every run it finds and puts them beside each other: a model panel
down the left, cross-run charts, and an A/B tab.

**A run is named by its configuration, not just its model.** Two readings of one
model at different chunk sizes are different readings, so each card carries the
knobs that differ from the other runs on the page, and one helper (`runLabel()`)
names a run everywhere it appears. A card also says when a reading is **not
isolated** or lost a shard, and the host note will not call an unisolated figure
the one the design is priced on. See
[`../../docs/how-to/benchmark-a-voice.md`](../../docs/how-to/benchmark-a-voice.md).

**A/B is there because pairwise beats absolute scoring.** "Which of these two is
better" is a more reliable judgement than scoring one clip out of context, which
is why TTS Arena ranks that way and why a mean-opinion score cannot be compared
between experiments at all. Blind is on by default, so a listener is not told
which run they are hearing until they have chosen.

## Follow-the-text is exact between chunks and interpolated within one

Each chunk is its own inference call, so where it begins in the finished clip is
known exactly and costs nothing to record. **Within a chunk the highlight is
interpolated by character position, not measured.** The ONNX export publishes
`waveform` as its only output, so the duration predictor inside the graph cannot
be reached; word-level timing would need the model re-exported from PyTorch with
`pred_dur` as a second output. The chunk boundary itself is exact, which matters
because it is the one place a seam can be heard.

## Publishing

`.github/workflows/publish-listening-page.yml` voices the corpus on the runner,
encodes the WAV to opus, and deploys to Pages. The clips are not committed - 24
summaries is 42 MB of WAV per run - so the publish job has to make them.

**The publish is not a benchmark**, and its manifests say so. It voices every
model in parallel on purpose, so the page builds in twenty minutes rather than
two hours; that means each arm's wall clock carries the other arms' contention.
Every manifest it writes is stamped `run.isolated: false` with the reason, and
`collate-benchmarks.mjs` will not draw the job-cap table for such a reading.

A comparable figure comes from `benchmark one voice`, which measures one model
at one configuration with nothing else voicing. Both workflows hold the
`voice-measurement` concurrency group, so a publish can never start while a
benchmark is being timed.