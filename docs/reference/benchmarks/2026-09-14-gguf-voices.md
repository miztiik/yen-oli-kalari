# 2026-09-14 - Three GGUF voices, and what the format does not tell you

**Last Updated**: 2026-09-14

Three text-to-speech models were put on the runner because all three publish
GGUF. Two produced readings. The third was stopped by something that has nothing
to do with speech, and the format itself turned out to be the least informative
fact about any of them.

## Conditions

- GitHub-hosted `ubuntu-latest`, 4 vCPU, 16 GB, no GPU. Final run
  [34790845502](https://github.com/miztiik/yen-oli-kalari/actions/runs/34790845502),
  with earlier readings from
  [34788657934](https://github.com/miztiik/yen-oli-kalari/actions/runs/34788657934)
  and
  [34790450859](https://github.com/miztiik/yen-oli-kalari/actions/runs/34790450859).
- Corpus: the first 3 summaries of `real-summaries/summaries.json`, 98 words.
  **These arms are autoregressive on a CPU, so the corpus is bounded rather than
  completed** - a real-time factor needs a fair reading, not a finished one.
- No Hugging Face token. Everything streamed anonymously.
- One repeat per run, but **two runs of each model exist**, so there is a spread
  and it is stated below rather than hidden behind a single decimal.

## What was measured

| Model | Licence | Commercial | RTF | x real time | wpm | Peak MB | Load |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **MagpieTTS Multilingual 357M** | NVIDIA Open Model | yes | **2.4159** | 0.41x | 117.3 | 1,217 | 42.6 s |
| **Orpheus 3B Q4_K_M** | Apache-2.0 | yes | **6.2596** | 0.16x | 130.0 | 4,780 | 3.2 s |
| NeuTTS Air Q4 | Apache-2.0 | yes | **did not run** | - | - | - | - |

Magpie's row is the 6-clip rerun and is the figure to quote.

**The spread, settled.** Magpie was rerun over six summaries specifically to
resolve a 23 percent gap between its first two readings. The per-clip figures are
**2.400, 2.407, 2.412, 2.416, 2.429, 2.443** - a span of **1.8 percent**, which
is the tightest thing this project has measured. The model is not variable; the
first reading was. Three run aggregates:

| Run | Clips | RTF |
| --- | --- | --- |
| 34788657934 | 3 | 1.9438 |
| 34790845502 | 3 | 2.3863 |
| **34830809854** | **6** | **2.4159** |

The last two agree to 1.2 percent and the first is the outlier. With within-run
variation at 1.8 percent, a 20 percent gap between runs cannot come from the
model - it is **runner-to-runner hardware variation**, which is worth knowing
because it is larger than most differences this table would otherwise report.
Orpheus showed the same effect more mildly: 6.0006 and 6.2596, 4 percent apart.

For scale, the incumbent Kokoro fp32 reads **0.3591** on the same hardware, and
the single-runner budget is **0.707**.

## What this settles

**Neither GGUF model is usable for the daily run, and it is not close.** Magpie
is 6.7 times slower than the incumbent and Orpheus is 17.4 times slower. Against
the 0.707 single-runner budget, Magpie is 3.4x over and Orpheus 8.9x over.
Orpheus does not fit even at four shards, where the budget relaxes to 2.83. The
busiest day - 509 minutes of audio - would cost Orpheus roughly 53 hours of
single-runner compute against a 6 hour job cap.

**This is the autoregressive tax, paid in the currency the runner is poorest
in.** Both models predict audio codec tokens one frame at a time, and on a CPU
each frame means streaming the weights out of RAM again. Nothing about 2 GB of
weights is slow until you have to read it hundreds of times in a row. The
`docs/concepts/model-formats-and-inference.md` prediction held exactly.

**Orpheus costs 4.8 GB of RAM to be the slowest thing measured.** That is nearly
a third of the runner for a model 17 times slower than an 82M feed-forward one.
Size is not the cause - the sequential dependency is - but the memory removes any
room to hide the latency in.

**Magpie is the surprise, and the only GGUF candidate that is not absurd.**
357M parameters, 542 MB on disk, a licence that permits commercial use, 12
languages, a quarter of Orpheus's memory, and a real-time factor that is stable
to 1.8 percent. Its figure **includes reloading the model for every chunk**,
because NeMo-Speech.cpp is a CLI that starts fresh each invocation - 42.6 seconds
of load inside a 316 second reading, which is 13 percent of the measurement spent
on something a resident process would pay once. `nemo-speech serve` exists and
was not measured. **That is the one number here worth chasing.**

## The finding that outlives these three models

**"It has a GGUF" tells you almost nothing.** Every model here is a codec
language model: the GGUF holds a backbone that emits integers, and a separate
neural codec decoder turns those integers into a waveform. That decoder is never
in the GGUF.

| Model | Backbone in the file | Decoder that is not | Runs under |
| --- | --- | --- | --- |
| Orpheus 3B | Llama-3.2-3B | SNAC 24 kHz, torch | llama.cpp |
| NeuTTS Air | Qwen2.5-0.5B | NeuCodec | llama.cpp |
| Magpie 357M | NeMo encoder-decoder | NanoCodec | **NeMo-Speech.cpp** |

Magpie is the clean proof. Its GGUF will not load in llama.cpp at all - it is an
encoder-decoder predicting 8 codebooks with frame stacking - and NVIDIA ships a
separate ggml-based runtime for it. **Supporting the container is not supporting
the architecture inside it**, which this project's vocabulary page asserted
before there was a measurement behind it. There is one now.

## Why NeuTTS Air did not run, in order of what was actually blocking

Five runs were spent narrowing this, and four of the five obstacles look like
the blocker and are not. Each was eliminated by a fix, not by an argument.

| # | Obstacle | Status |
| --- | --- | --- |
| 1 | Neuphonic gates its weights and its codec - 401 anonymously | **Not the blocker.** Ungated requants and mirrors serve 200. |
| 2 | Published Q4 is `Q4_0`, the ungated mirror is `Q4_K_M` | **Not the blocker.** A recorded substitution, 502 MB against 569 MB. |
| 3 | `neucodec` and `torchtune` demand incompatible `torchao` | **Fixed.** See below - the window is two releases wide. |
| 4 | The phonemiser could not infer a language from a local path | **Fixed.** The row names the eSpeak voice. |
| 5 | The codec **encoder** refuses every substitute | **This is the blocker.** |

**The torchao window, which is two releases wide.** `neucodec` requires
`torchao>=0.12.0` at every version it has ever published, and also imports
`torchtune`, whose code does `from torchao.dtypes.nf4tensor import NF4Tensor` -
a module present in 0.12.0 and 0.13.0 and **removed in 0.14.0**.

| torchao | neucodec floor (>=0.12) | torchtune's import | Result |
| --- | --- | --- | --- |
| 0.11.0 | no | yes | pip: `ResolutionImpossible` |
| **0.12.0 - 0.13.0** | yes | yes | **works** |
| 0.14.0+ | yes | no | `ModuleNotFoundError` |

An unpinned install lands above the window and the obvious "pin it back" lands
below it. torchtune is archived upstream, so this will not self-heal.

**The blocker, and it is one credential.** NeuTTS is a cloning model, so the
reference clip must be encoded to codes once before anything is voiced. The ONNX
decoder is decoder-only, and `neucodec` refuses every alternative **by name
rather than by content** - its `_from_pretrained` opens with

```python
assert model_id in ["neuphonic/neucodec", "neuphonic/distill-neucodec"]
```

Both are gated. No mirror can stand in, because the check never looks at the
weights. **What is needed is a Hugging Face read token** - scope "Read access to
contents of all public gated repos" - as the `HF_TOKEN` repository secret, on an
account that has accepted the terms at `huggingface.co/neuphonic/neucodec`. The
workflow already passes `HF_TOKEN` through, so adding the secret and flipping
`enabled` is the whole remaining step.

## What the harness learned, which cost five runs

Every one of these was a silent failure that looked like a model result.

- **The prebuilt "CPU" wheels for `llama-cpp-python` are musl-linked.** They are
  named `linux_x86_64` and will not load on a glibc runner. PyPI publishes no
  manylinux wheel at all, only an sdist, so the arm compiles llama.cpp.
- **`neucodec` drags in CUDA `torchaudio`** unless torch AND torchaudio are both
  pre-installed from the CPU index. `libcudart.so.13` on a machine with no card.
- **A retry loop with no `exit` is not a retry loop.** Three attempts failed, the
  loop fell through, and the benchmark ran against a half-installed environment -
  then reported `No module named 'snac'` as though it were a model failure.
- **`RUSAGE_SELF` is the wrong memory reading for an arm that shells out.** The
  Magpie parent process reported 48 MB for a 542 MB model.
- **`start_of_ai` is not a stop token.** It is the first token Orpheus is
  supposed to emit. Treating low-numbered tokens as terminators stopped
  generation on the first token every time, and the arm reported empty clips
  rather than wrong ones - which is the better failure, but only because
  `voice_the_corpus` refuses to write a zero-length wav.

## See also

- [../../concepts/model-formats-and-inference.md](../../concepts/model-formats-and-inference.md) - the GGUF/ONNX vocabulary this run tested.
- [2026-09-13-six-voices-graded.md](2026-09-13-six-voices-graded.md) - the incumbent's 0.3591 and the verbalization scores these were not graded against.
- [../voice-model-survey.md](../voice-model-survey.md) - the candidate list.
- [../measurements.md](../measurements.md) - the figure in force for each quantity.
