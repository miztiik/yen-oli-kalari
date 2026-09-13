# Model formats and inference vocabulary

**Last Updated**: 2026-09-14

The words a voice-model decision is argued in. Every one of these was used
loosely somewhere in this project's research before it was defined here, and a
loose word is how a wrong number survives review.

## Real-time factor (RTF)

**RTF = compute time divided by the duration of audio produced.**

It is a ratio, so it has no units and it travels between machines badly - it is a
property of a model *on a machine*, never of a model alone.

| RTF | Means | One minute of audio costs |
| --- | --- | --- |
| 0.25 | four times faster than real time | 15 seconds |
| 0.5 | twice as fast as real time | 30 seconds |
| 1.0 | exactly real time | 60 seconds |
| 2.0 | twice as slow as real time | 2 minutes |

**Lower is better.** RTF 1.0 does not mean "fast enough" - it means the machine
spends a second of work for every second of speech, so a day holding four hours
of audio costs four hours of compute.

The confusing part: some vendors quote the reciprocal and call it "3.1x real
time" or "RTF 9.7x". Those are speed multipliers, not RTF. Breeze's card says
both in one paragraph - "a 0.32 real-time factor, generating audio at
approximately 3.1x real time" - and they are the same claim stated twice.

## The 0.707 budget, and why sharding moves it

This number had no derivation written down before now.

The busiest day the upstream archive has produced is **731 items**. At a mean of
**90.2 words** a summary and the measured pace of **129.5 words a minute**, that
is **509.2 minutes** - 8.49 hours - of audio to make.

A GitHub Actions job is capped at **6 hours**, which is 360 minutes. So on a
single runner:

```
budget RTF = 360 minutes of job / 509.2 minutes of audio = 0.707
```

**That is where 0.707 comes from, and it assumes one runner.** It is the answer
to a question nobody should have been asking, because summaries are independent
and the work fans out. With `N` runners each carrying `1/N` of the day:

| Runners | Audio each carries | Budget RTF | Kokoro fp32 at 0.45 |
| --- | --- | --- | --- |
| 1 | 509.2 min | **0.707** | 3.8 h - fits |
| 2 | 254.6 min | 1.41 | 1.9 h - fits |
| 4 | 127.3 min | **2.83** | 0.95 h - fits comfortably |
| 8 | 63.6 min | 5.66 | 0.48 h - fits easily |

**Measured 2026-09-13, the incumbent clears the single-runner budget on its own.**
Kokoro fp32 reads 0.359 to 0.453, against a budget of 0.707 - so one runner
voices the busiest day in under four hours and the fan-out is headroom rather
than a requirement. That was not true at q8, which reads about 1.0 and does not
fit, and it is the reason the quantisation finding mattered more than any model
choice.

The budget scales linearly with the shard count because the work is
embarrassingly parallel. **A shard is a whole runner, not a core**: each
`ubuntu-latest` runner has its own 4 vCPU, and the free tier allows 20 concurrent
jobs. Four shards is four machines and sixteen vCPU. Splitting one 4-vCPU box
four ways would make each quarter four times slower and buy nothing.

## Autoregressive versus feed-forward

This is the distinction that decides whether a voice model can run on a CPU at
all, and it matters far more than parameter count.

| | Feed-forward (Kokoro, Piper) | Autoregressive (Breeze, Voxtral, Fish, Step-Audio) |
| --- | --- | --- |
| How audio is made | one pass produces the whole utterance | one frame at a time, each conditioned on the last |
| Steps for 40 s of audio | **1** | **500 to 840** frames, each a full forward pass |
| Parallel across the utterance | yes | **no** - frame N needs frame N-1 |
| What it costs on CPU | one read of the weights | one read of the weights *per frame* |
| What it buys | speed, determinism | voice cloning, emotion, instruction following |

**Is autoregressive "bad" for audio? No - it is a trade, and the trade is
badly priced for this project specifically.**

AR models win on naturalness benchmarks precisely because conditioning each frame
on the last is what produces convincing long-range prosody. They also give voice
cloning from a reference clip and free-form style instructions, neither of which
is achievable feed-forward today.

But this project reads fixed news copy in one voice. It needs none of that, and
AR charges for all of it: a 12.5 Hz frame rate means 12.5 sequential forward
passes per second of speech, and on a CPU each pass must stream the model's
weights out of RAM. The sequential dependency is the problem, not the size -
nothing about a 4 GB model is slow until you have to read it 500 times in a row.

So the accurate statement is not "AR is bad for audio". It is: **AR buys
expressiveness this project does not need, and charges in exactly the currency
the runner is poorest in.**

## GGUF, GGML and ONNX

| | GGML | GGUF | ONNX |
| --- | --- | --- | --- |
| What it is | the old file format of the ggml library | the current file format of the ggml library | an interchange format from the ONNX consortium |
| Status | **deprecated** since Aug 2023 | current | current |
| Runs in | nothing modern | llama.cpp and the ggml family | ONNX Runtime, transformers.js |
| Carries metadata | no - needed external config | yes - tokeniser, arch, params in-file | yes |
| Quantisation | yes | yes, many schemes (Q4_K_M, Q8_0) | limited (int8, fp16) |
| Typical use here | none | LLM inference on CPU | Kokoro and the voice models |

**Yes, llama.cpp supports GGUF - GGUF is llama.cpp's native format.** The name
means "GGML Universal File", and it replaced GGML because the old format could
not carry its own metadata. llama.cpp does not read ONNX at all; the two are
separate ecosystems that happen to solve the same problem.

**Unsloth publishes GGUF, not GGML.** This project already depends on that: the
summarizer in `yen-idhazh` is `unsloth/Qwen3.5-9B-GGUF` at Q4_K_M. Anyone
publishing "GGML" files today is publishing something three years stale.

**A GGUF file is not automatically a llama.cpp file.** This trips up the voice
survey directly. `HoppouAI/Breeze-TTS-2.cpp` ships GGUF and says plainly that the
files "will not load in llama.cpp" - they need that project's own runtime,
because a TTS model has a codec and a depth decoder that llama.cpp has no
concept of. GGUF is a container; supporting the container is not supporting
the architecture inside it.

**Measured 2026-09-14, and the claim above now has proof rather than an
anecdote.** Three GGUF voices were run on the runner and every one of them was a
**codec language model**: the GGUF holds a backbone that emits integers, and a
separate neural codec decoder turns those integers into a waveform. That decoder
is never in the file.

| Model | Backbone in the GGUF | Decoder that is not | Runs under |
| --- | --- | --- | --- |
| Orpheus 3B | Llama-3.2-3B | SNAC 24 kHz, torch | llama.cpp |
| NeuTTS Air | Qwen2.5-0.5B | NeuCodec | llama.cpp |
| MagpieTTS 357M | NeMo encoder-decoder, 8 codebooks | NanoCodec | **NeMo-Speech.cpp** |

Magpie is the clean case: NVIDIA publishes the GGUF *and* a separate ggml-based
runtime for it, because it is an encoder-decoder with frame stacking and a local
transformer that llama.cpp cannot load at all.

**And the runtime's own wheels can lie about their platform.** The prebuilt
"CPU" wheels for `llama-cpp-python` are named `linux_x86_64` but are
**musl-linked**, so they fail to load on the glibc runner with
`libc.musl-x86_64.so.1: cannot open shared object file`. PyPI carries no
manylinux wheel for the package at all. There is no prebuilt path to this
runner, so the arm compiles llama.cpp from the sdist.

See [../reference/benchmarks/2026-09-14-gguf-voices.md](../reference/benchmarks/2026-09-14-gguf-voices.md)
for the figures: Magpie reads 2.3863 and Orpheus 6.2596, against the incumbent's
0.3591 and a single-runner budget of 0.707.

## transformers.js is not TrevorJS

Two names that look alike and share nothing.

| | `@huggingface/transformers` (transformers.js) | TrevorJS |
| --- | --- | --- |
| What it is | the official Hugging Face JavaScript library | a Hugging Face **username** - a person |
| Runs | ONNX, via onnxruntime-web | their own Rust project, `voxtral-mini-realtime-rs` |
| Framework | ONNX Runtime | Burn, with hand-written WGSL compute shaders |
| Format | ONNX | GGUF - but **not** via llama.cpp |
| Relevance here | the other arm of the runtime comparison | published the Voxtral Q4 GGUF conversion |

So "TrevorJS measured RTF 1.24" and "the transformers.js arm" are statements
about entirely unrelated software. The `JS` in the username is initials.

## Chunking, and why it costs

The pipeline splits any summary over 40 words at sentence boundaries and
synthesises each piece separately. This is not a tuning choice - it is forced.
Kokoro truncates silently at its context limit, and the first measurement run
was invalid because 54, 80, 134 and 242-word summaries all produced the same 27
seconds of audio with no error raised.

Each chunk pays a fixed setup cost, which is why the shortest sample in every run
has the worst RTF: `real-01` at 20 words is one chunk and carries the whole fixed
cost against 9.5 seconds of audio.

A chunk boundary is also where a seam can be heard, which is why the evaluation
page marks them in the displayed text.

## See also

- [../reference/voice-model-survey.md](../reference/voice-model-survey.md) - the candidate models these words were needed to argue about.
- [../reference/measurements.md](../reference/measurements.md) - the figure in force for each quantity.
- [../reference/benchmarks/2026-09-12-kokoro-on-a-ci-runner.md](../reference/benchmarks/2026-09-12-kokoro-on-a-ci-runner.md) - the run that measured the pace and the first real RTF.
- [pipeline-loop.md](pipeline-loop.md) - the loop the shard count applies to.
- [../../CLAUDE.md](../../CLAUDE.md) - Guardrail #2 (the runner is the architecture) and Guardrail #10 (measured, not estimated).
