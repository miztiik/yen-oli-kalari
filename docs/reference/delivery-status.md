# Delivery status

**Last Updated**: 2026-09-13

Everything asked for, and what state it is in. Grouped by the thing it belongs
to rather than by the order it was asked, because a request list read back in
order tells you nothing about what is safe to build on.

**Four states, and the difference matters.** *Done* means it runs and has
produced a figure. *Partial* means the instrument exists and nobody has used it -
which is honest, not a failure, because a listening test is a person's time.
*Not done* means it is wired for but unbuilt. *Will not do* means it was tried
and the reason it failed is worth keeping.

## Models

| Request | State | Detail |
| --- | --- | --- |
| Kokoro | **Done** | Three arms: fp32 `bm_george`, fp32 `bf_emma`, q8. RTF 0.3591 to 0.9993, 29.6% verbalization. |
| Supertonic | **Done** | Two arms, M1 and F1. **Best measured**: RTF 0.0965, 44.4% verbalization, 639 MB. |
| MMS-TTS | **Done** | Control arm. RTF 0.21, 7.4% verbalization - the harness works, the model does not. |
| Chatterbox multilingual | **Partial** | Runs on the runner: 6 clips, 60 s load, 5.8 GB peak. **Settles that a 0.5B autoregressive model is feasible on 4 vCPU.** Its arm records no per-clip timings, so RTF is unknown and it is ungraded. |
| Chatterbox Turbo / nano | **Not done** | Only the ONNX export is wired. Turbo and nano are PyTorch-only and pin `torch==2.6.0` and `gradio==6.8.0` for ~3 GB of dependencies before any weights. |
| Qwen3-TTS 0.6B and 1.7B | **Not done** | Config rows carry the real sizes - 1.50 GB and 3.4 GB at `cpu_int4`, not the 21 GB and 46 GB the repositories report across six variants. They need the same multi-graph loop Chatterbox now has, so the pattern is proven and the wiring is not. |
| Higgs v3 4B | **Not done** | 3.59 GB at `cpu_int4`. Non-commercial licence, so the least valuable of the three to unblock. |
| KittenTTS Mini and Nano | **Blocked** | Ships `kitten_config.json` and `voices.npz` but **no `tokenizer.json`**, which `kokoro-js` fetches unconditionally. Needs an adapter over raw `onnxruntime` plus a phonemiser. |
| CosyVoice 2.0 | **Will not do** | Not pip-installable, and not an ONNX model: 3.3 GB of PyTorch with three ONNX helpers around it. Needs `pynini`, which builds OpenFst from source. |
| Parler GGUF | **Will not do** | Needs TTS.cpp built against a **patched ggml fork**, with zero prebuilt releases and a README warning it is macOS-only. Its own author measures RTF 1.112 on an M1 Max and recommends Kokoro instead. |

## The listening page

| Request | State | Detail |
| --- | --- | --- |
| Model panel, left | **Done** | Every run with parameters, architecture, licence, RTF, pace, and its verdict and thumb counts. |
| Results per model, nothing overwritten | **Done** | `results/<model-id>/` with `summaries/` and `verbalization/` beside a manifest. |
| Comparison charts across models | **Done** | RTF and pace run-against-run, plus RTF by summary length within one. The cross-run chart **says when arms came off different machines**, because wall clock is a property of the host. |
| A/B listening | **Done** | Blind by default. Pairwise because "which of these two" is more reliable than scoring one clip out of context - which is how TTS Arena ranks, and why a mean-opinion score cannot be compared across experiments. |
| Thumbs up and down | **Done** | The fast first pass: two dozen clips on one axis in the time four scales take for six. |
| Word highlighting as spoken | **Done, with a stated bound** | Chunk boundaries are **exact** and free, because each chunk is its own inference call. Within a chunk it is **interpolated by character position** - the ONNX export publishes `waveform` as its only output, so word-level timing would need the model re-exported from PyTorch with `pred_dur`. The page says so rather than implying a precision it does not have. |
| Waveform scrubber | **Done** | 64 peaks computed at build time, ~500 bytes. Decoding client-side would mean downloading the whole clip before the first pixel and inflating it about sixtyfold in memory. |
| Metrics in IndexedDB, with export | **Done** | localStorage caps near 5 MB and this accumulates thousands of small writes; IndexedDB with a localStorage fallback, quota reporting, and debounced writes. |
| Run readout | **Done** | Median characters a second, real-time factor, real-time speed, processing time, total characters, voice. Both real-time conventions shown together because vendors publish each. |
| Exaggeration and CFG controls | **Not done** | Chatterbox exposes both. They are **generation-time** parameters, so a slider on the page cannot change them - each setting is a re-voice, which makes them config rows rather than controls. |
| Published to a URL | **In progress** | [`publish-listening-page.yml`](../../.github/workflows/publish-listening-page.yml) voices on the runner, encodes to opus, deploys to Pages. |

## The twelve metrics

Full detail in [`evaluation-coverage.md`](evaluation-coverage.md).

| # | Metric | State |
| --- | --- | --- |
| 1 | Verbalization accuracy | **Done** - 28 cases, ASR-graded, per category |
| 2 | Pronunciation accuracy | **Done** - same suite, four categories |
| 3 | Text fidelity / WER | **Done** - token Levenshtein against normalised source |
| 4 | Long-form prosody | **Partial** - pace drift measured; pause and emphasis need a listener |
| 5 | Continuity / seams | **Partial** - boundaries marked and scoreable, nobody has scored one |
| 6 | Intelligibility | **Partial** - scale built, unjudged |
| 7 | Naturalness | **Partial** - pairwise built, unjudged; UTMOS not wired |
| 8 | Speaking-rate stability | **Done** - mean, median, spread, coefficient of variation |
| 9 | Audio defects | **Partial** - reportable with timestamps, nothing detects them |
| 10 | RTF / cost | **Done** - six voices on the production runner |
| 11 | Memory / CPU | **Done** - peak resident set per arm |
| 12 | Time to first byte | **Will not do** - everything is built ahead and served static |

## Infrastructure

| Request | State | Detail |
| --- | --- | --- |
| Runner-only execution | **Done** | Every benchmark on GitHub Actions. Local is syntax checks only - a wall clock read on a laptop may not be compared against a job cap. |
| Stream weights, never commit them | **Done** | Hugging Face cache on the runner, memory-mapped, gone with the runner. **The repository carries zero weights**, so what bounds the number of comparable models is runner RAM rather than repository size. The ceiling is stated: 16 GB and 4 vCPU, so roughly 9-10 GB. |
| Config-driven, one input set | **Done** | [`voices.config.json`](../../test/voice-evaluation/voices.config.json) - a model is a row carrying its runtime, licence, real size and, where it cannot run, the verified reason. |
| British voices | **Done** | `bm_george` and `bf_emma`. Supertonic publishes F1-F5 and M1-M5 with **no accent labels**, so those rows carry `accentKnown: false` rather than a guess. |

## What is genuinely left

1. **Listen.** Every instrument is built and running. None replaces a person with
   headphones on, and nobody has heard a clip.
2. **An owner ruling on Supertonic.** It wins on speed and accuracy and is
   OpenRAIL-M with an archived upstream. Either that licence is acceptable, or
   the field narrows to Kokoro.
3. **Chatterbox's real-time factor.** It runs; its arm does not yet record what
   that cost.
4. **Qwen3-TTS.** The most plausible unwired candidate at 1.5 GB, and the loop it
   needs is the one Chatterbox proved.

## See also

- [`benchmarks/2026-09-13-six-voices-graded.md`](benchmarks/2026-09-13-six-voices-graded.md) - the run behind every figure here.
- [`evaluation-coverage.md`](evaluation-coverage.md) - the twelve metrics in detail.
- [`voice-model-survey.md`](voice-model-survey.md) - every model considered.
- [`../getting-started/where-the-project-stands.md`](../getting-started/where-the-project-stands.md) - the state of play in one page.
