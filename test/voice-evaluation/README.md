# Voice evaluation

**Last Updated**: 2026-09-12

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
npm run build-clips     # synthesises the corpus and writes the page manifest
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
| `build-evaluation-clips.mjs` | Synthesises one WAV a summary and writes `clips/manifest.json`. |
| `build-page-manifest.mjs` | Turns that manifest into `page/manifest.js` for a page with no server. |
| `serve.mjs` | Static server with range support, for browser checks only. |
| `evaluation-schema.json` | The shape a downloaded evaluation takes. |
| `page/` | The listening surface. No framework, no build step. |
| `clips/` | Generated audio and its manifest. Not committed. |

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
