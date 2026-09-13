# Voice evaluation

**Last Updated**: 2026-09-14

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
npm run vendor-d3        # once, and again whenever a d3 version moves
npm run build-clips      # synthesises the corpus and writes the page index
npm run serve            # http://127.0.0.1:8791/page/index.html
```

**Serve it rather than opening the file.** The page is a shell: it fetches
`index.json` at runtime and then one run manifest at a time, and a browser
reading a `file://` document refuses `fetch` against a sibling JSON file.

Rebuilding the page without re-synthesising the audio:

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

**A deep working copy cannot load the model at all** - the native loader is
bound by a path-length limit and reports it as `File doesn't exist`. The pattern
and the way round it are in
[`../../docs/reference/agent-notes.md`](../../docs/reference/agent-notes.md).

## What the page asks

Four scores, and each one closes a question the benchmark left open rather than
being a generic audio-quality axis. Three is the pass mark.

| Score | The question it closes |
| --- | --- |
| Intelligibility | Could every word be made out without replaying? |
| Pronunciation | Names, numbers, acronyms. The corpus is news summaries, so proper nouns are the load-bearing case. |
| Prosody | Does it read like a person reading news, or like a list of words? |
| Seams | Are the chunk joins audible? The pipeline splits every summary over 40 words, so a seam is an artefact this project creates and therefore one it owns. |

**A score is a rail with five stops, and no score is not a zero.** Click a stop,
click anywhere on the rail to jump to the nearest one, drag the handle, or press
`1` to `5` with the rail focused; `Backspace` clears it. The fill springs to the
stop and its colour walks the confidence ramp, so a judged clip reads at a
glance instead of as four numerals. The five stops are kept because a listener
working through twenty-four clips has to set an exact value in one action, and a
free-moving handle cannot be set in one action. **A rail with no handle has not
been scored** - it says "unrated" and counts as nothing, which is a different
fact from a 1.

A defect carries a timestamp, because a note saying "sounds a bit off" cannot be
acted on and `at 12.4s` can. The page marks each chunk boundary in the displayed
text, so a listener knows where to expect a seam before being asked whether they
heard one. Defects, the free-text note and the defect list sit behind one
**Add detail** disclosure, whose summary carries a count - most clips get a
thumb and a verdict, not a logged defect, and a row of twenty-eight controls at
one weight has no order to be worked in.

Scores persist to the browser's local storage as you work. **Download
evaluation** writes a JSON file shaped by [`evaluation-schema.json`](evaluation-schema.json).
It fetches every run's manifest first: the page is a shell that loads one run at
a time, so an export that only read what happened to be in memory would write a
partial record that looked complete.

## The catalogue is what is known, separate from what was measured

[`model-catalogue.json`](model-catalogue.json) holds what a model's own card and
licence claim - parameters, architecture, licence, voices, Arena standing, and
the URLs a reader follows to check any of it. A row here is a claim with a
source; a figure in `results/` is a measurement with a host, and keeping them
apart is what stops a vendor's number being read as ours.

Its shape is fixed by [`model-catalogue.schema.json`](model-catalogue.schema.json)
and held there by `tests/test_model_catalogue.py`. Three rules earn their place:

- **Rows are keyed by Hugging Face repository id**, which is what a manifest
  carries as `modelId`. Three runs of one model at two voices and two
  quantisations share one row. Keying on the results directory - a *run* id from
  `voices.config.json` - was the original mistake, and it meant every lookup
  missed silently.
- **A field nobody has a source for is written `null`, never omitted.** The page
  prints "not recorded" for a null and draws nothing for a missing key, and
  those are different facts: one says nobody measured it, the other says the
  page forgot.
- **`links` is a map, not two fixed keys.** The next model arrives with a paper
  or a demo, and that should cost one entry rather than a schema change and a
  new render branch.

Until 2026-09-14 none of this reached the browser: the page index carried no
catalogue at all, so `card` and `onnx` - the only URLs in the project that say
where a model came from - had never been on screen.

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
| `run-manifest.schema.json` | **The run contract.** What a run manifest must contain, and why each field is there. Four producers write it; the collator, the page index and every benchmark record read it. |
| `model-catalogue.schema.json` | **The catalogue contract.** What is known about a MODEL from its card, keyed by Hugging Face repository id, with a closed `links` map. |
| `model-catalogue.json` | The catalogue itself. A claim with a source, never a measurement. |
| `run-config.mjs` | The single resolver. The only thing that may turn environment knobs into a run configuration or derive a `configSlug`. Run it with no arguments to see what a configuration resolves to. |
| `benchmark-model.mjs` | Voices the corpus and the verbalization suite on the node runtimes, and writes the manifest. |
| `benchmark_genai_model.py` | The same for multi-graph autoregressive models that need a generation loop. Reads its configuration from the resolver rather than keeping a second copy of the rules. |
| `merge-shards.mjs` | Puts the shards of ONE run back into one manifest. Refuses shards whose run ids differ. |
| `collate-benchmarks.mjs` | Ranks what finished, says what did not, and refuses to draw the job-cap table for an unisolated reading. |
| `build-evaluation-clips.mjs` | Synthesises one WAV a summary into `results/<model>/<quant>/`. Never overwrites another run. |
| `build-page-index.mjs` | Writes the small index the page fetches at runtime: each run, where its manifest lives, and the catalogue rows for the models that actually ran. |
| `d3-entry.mjs` | The d3 surface the page is allowed to use. Widening the bundle means adding an export here, which is the moment to ask whether it is needed. |
| `vendor-d3.mjs` | Builds `page/vendor/d3-micro.js` from that entry and measures what it weighs into `page/vendor/d3-micro.json`. |
| `serve.mjs` | Static server with range support. The page is a shell, so it needs a URL rather than a file path. |
| `evaluation-schema.json` | The shape a downloaded listening evaluation takes. |
| `page/` | The listening surface. No framework and no build step - `vendor-d3.mjs` is built once and committed, like any other asset. |
| `results/` | Generated audio and one manifest per run. Not committed. |

## d3 is vendored, not fetched, and it is this page's only engine

The page must open without a bundler and may not call a third party at runtime
(`CLAUDE.md` Guardrail #1), which is what ruled out the site's inherited
charting engine and left three bar charts being built by string concatenation.
Once d3 was needed for the score rails anyway, it took the charts too.

It is **trimmed to the nine modules the page actually uses** - selection,
transition, ease, scale, array, shape, axis, drag, format - and committed as one
file. Measured 2026-09-14 by `vendor-d3.mjs` itself: **69.1 KB raw, 23.9 KB
gzipped**, against roughly 280 KB for the full distribution. The figure is
written to `page/vendor/d3-micro.json` at build time rather than quoted from
memory (Guardrail #10). Nothing about this changes what the published Console
will use.

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
rather than one per row, `ProgressTrack` drawn as ONE seek surface - the
waveform where a clip carries peaks, the plain groove where it does not, and
never both stacked - the wait drawn as a determinate buffer fill rather than a
spinner, and the inherited design tokens including the three audio tokens.

The dock is a raised card bounded by `--frame-reading` at every width, not a
strip glued to the viewport edge. It carries volume and a playback-speed pill,
which the published Listen surface will inherit; the speed pill turns amber at
any rate other than 1x, because prosody at 1.5x is not the prosody that ships.

## The page reads every run it finds, and one picker chooses between them

A run is one model at one quantisation, written to `results/<run-id>/`. Nothing
is overwritten - two models cannot be compared if only the most recent survives.

**The left panel is a picker and a spec sheet, not a stack of cards.** Each
option leads with the run's speed rank, so a seventh model costs one option
rather than nine more lines in a scrolling column, and the rank survives the
clipping a native select does to its own text. Below it every field the payload
carries is drawn as one row: the reading, the model, the configuration, and the
source URLs. **A field the run does not carry says "not recorded" rather than
disappearing** - a row that vanishes makes unknown and absent look identical.

**A run is named by its configuration, not just its model.** Two readings of one
model at different chunk sizes are different readings, so the picker carries the
knobs that differ from the other runs on the page, and one helper (`runLabel()`)
names a run everywhere it appears. The panel also says when a reading is **not
isolated** or lost a shard, and the host note will not call an unisolated figure
the one the design is priced on. See
[`../../docs/how-to/benchmark-a-voice.md`](../../docs/how-to/benchmark-a-voice.md).

## See also

- [`../onnx-runtime-comparison/README.md`](../onnx-runtime-comparison/README.md) - the speed harness and the shared corpus.
- [`../../docs/reference/benchmarks/2026-09-12-kokoro-on-a-ci-runner.md`](../../docs/reference/benchmarks/2026-09-12-kokoro-on-a-ci-runner.md) - the run that measured the pace and left quality open.
- [`../../docs/concepts/ui-shell.md`](../../docs/concepts/ui-shell.md) - the component vocabulary this page borrows.
- [`../../docs/concepts/design-system.md`](../../docs/concepts/design-system.md) - the tokens, and where the three audio tokens come from.

## Every run is kept, which is what makes a comparison possible

Nothing is overwritten. The first version of this harness overwrote one manifest
on every run, so the fp32, q8 and q4 readings of the same model ended up
scattered across three different files and none of them could be compared.

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