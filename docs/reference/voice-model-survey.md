# Voice model survey

**Last Updated**: 2026-09-13

Every text-to-speech model researched for this project, what was found, and what
remains unknown. The vocabulary used here - RTF, autoregressive, GGUF - is
defined in
[../concepts/model-formats-and-inference.md](../concepts/model-formats-and-inference.md).

**Nothing in this table has been run.** The only voice model this project has
measured is Kokoro, the reference model. Every figure for the four candidates is
an estimate, labelled as one, with the method that produced it stated so it can
be checked or thrown out.

## The candidates

| Model | Params | Architecture | Licence | Commercial use | GGUF | ONNX |
| --- | --- | --- | --- | --- | --- | --- |
| [Step-Audio-EditX](https://huggingface.co/stepfun-ai/Step-Audio-EditX) | 3B | AR + CosyVoice flow + HiFi-GAN | **Apache-2.0** | **permitted** | no | no (see note) |
| [Breeze-TTS-2](https://huggingface.co/BreezeBlue/Breeze-TTS-2) | 3.5B | AR + 15-step depth decoder, Mimi codec 12.5 Hz | BreezeBlue Research | no | yes, 7 quants | no |
| [Voxtral-4B-TTS](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603) | 4B | AR + 16-NFE flow matching, 12.5 Hz | CC-BY-NC-4.0 | no | yes, 2 ports | no |
| [Fish S2-Pro](https://huggingface.co/fishaudio/s2-pro) | 4.56B | Dual-AR, 10 codebooks, 21 Hz | Fish Audio Research | separate licence | yes | no |
| **Kokoro-82M** (incumbent) | 82M | **feed-forward**, StyleTTS2 lineage | Apache-2.0 | permitted | no | **yes** |

Note on Step-Audio's ONNX tag: Hugging Face labels the repository `onnx`, but
only two auxiliary files are ONNX - `campplus.onnx` (speaker embedding) and
`speech_tokenizer_v1.onnx` (the CosyVoice tokeniser). The 3B core is a 7 GB
safetensors file and the flow and vocoder are `.pt`. The tag is misleading.

## Vendor-published speed, and why none of it transfers

| Model | Published | Hardware | Memory bandwidth |
| --- | --- | --- | --- |
| Fish S2-Pro | RTF 0.195 | NVIDIA H200 | ~4,800 GB/s |
| Breeze-TTS-2 | RTF 0.32 | NVIDIA H100 | ~3,350 GB/s |
| Breeze q8_0 | ~1.2x real time | RTX 3060 | ~360 GB/s |
| Voxtral Q4 | RTF 1.24 at 4 Euler steps | DGX Spark GB10 | ~273 GB/s |
| Step-Audio-EditX | not published | - | - |
| **Target** | - | **ubuntu-latest, 4 vCPU, no GPU** | **~24 GB/s effective** |

Every published figure was taken on a GPU. None was taken on a CPU, and the
target has no GPU at all.

## Estimating the runner, from a measurement rather than a ratio

An earlier pass estimated these by scaling the GPU figures by the memory
bandwidth ratio and produced numbers 30 to 70 times over budget. **Those
estimates were wrong and are withdrawn.** They assumed the GPU runs were
bandwidth-saturated, which they are not, so the ratio overstated the penalty
badly.

The honest anchor is a measurement this family of projects already owns.
`yen-idhazh` runs `Qwen3-8B-Q4_K_M.gguf` - **4.7 GB of weights** - on exactly
this runner at a measured **5.05 decode tokens a second** across four workers
(2026-08-24, run `32742672105`). A decode step reads the whole model once, so:

```
effective bandwidth = 4.7 GB x 5.05 steps/s = 23.7 GB/s
```

That is the number to estimate with. For a voice model it gives a step rate per
component, and the frame rate says how many steps a second of audio needs.

| Model | Backbone size | Backbone steps/s | Per second of audio | **Est. RTF** |
| --- | --- | --- | --- | --- |
| Voxtral 4B Q4 | 2.67 GB | 8.9 | 12.5 backbone + 3 flow NFE | **~1.7** |
| Breeze-TTS-2 q8_0 | 3.5 GB | 6.8 | 12.5 backbone + 187 depth | **~2.6** |
| Fish S2-Pro q4_k_m | 3.4 GB | 7.0 | 21 slow AR + 210 fast AR | **~5.7** |
| Step-Audio-EditX | no GGUF | - | - | not estimable |

**These are still estimates.** They ignore prefill, the codec decoder, cache
effects and the possibility that a given runtime is simply inefficient. They are
an order-of-magnitude check, not a reading. But they are anchored to a real
measurement on the real hardware, which the withdrawn figures were not.

## Measured, 2026-09-13 - and the estimates above were wrong in both directions

Six voices ran on the production runner with speed and verbalization accuracy
taken together. The record is
[2026-09-13 - Six voices graded](benchmarks/2026-09-13-six-voices-graded.md).

| Model | Licence | RTF | Verbalization | Peak MB |
| --- | --- | --- | --- | --- |
| **Supertonic M1** | OpenRAIL-M | **0.084-0.100** | **48.2%** | 639 |
| Supertonic F1 | OpenRAIL-M | 0.100 | 40.7% | 657 |
| MMS-TTS eng | CC-BY-NC | 0.210-0.255 | 0-7.4% | 721 |
| **Kokoro fp32** | Apache-2.0 | 0.359-0.453 | 29.6% | 1451 |
| Kokoro q8 | Apache-2.0 | 0.996-1.011 | 29.6% | 1222 |
| Chatterbox multilingual | MIT | ran, untimed | ungraded | **5792** |

**The bandwidth estimates above were too pessimistic, and the naturalness
rankings were beside the point.** Supertonic is four times faster than the
incumbent, not marginally so - and it wins on words as well. Meanwhile the
figure nobody had estimated at all turned out to be the one that decides
everything: **no model reads news copy correctly more than half the time.**

**Chatterbox settles the autoregressive question.** A 0.5B AR model loads in 60
seconds and voices on 4 vCPU at 5.8 GB peak. The architecture is not the
blocker, which means Qwen3-TTS at 1.5 GB is worth wiring.

## What that means against the budget

With the sharding the pipeline already uses, the picture is far better than the
withdrawn estimates suggested - and the incumbent now clears the single-runner
budget on its own, so the rows below are headroom rather than a requirement.

| Model | Est. RTF | 1 runner (0.707) | 4 runners (2.83) | 8 runners (5.66) |
| --- | --- | --- | --- | --- |
| **Kokoro-82M fp32** | **0.359-0.453 measured** | **fits** | fits | fits |
| Voxtral 4B | ~1.7 | busts | **fits** | fits |
| Breeze-TTS-2 | ~2.6 | busts | **marginal** | fits |
| Fish S2-Pro | ~5.7 | busts | busts | **marginal** |

So the earlier conclusion - "all four are far too slow" - **does not survive
contact with the shard count.** On the arithmetic, Voxtral and Breeze are
plausibly inside a four-runner budget and Fish inside an eight.

## The real blocker is the runtime, not the speed

Speed was the wrong objection. The actual risk is that **none of these models
runs in software this project could defend depending on.**

| Model | Runtime needed | State |
| --- | --- | --- |
| Breeze-TTS-2 | `HoppouAI/Breeze-TTS-2.cpp` | third-party C++ reimplementation, no tagged release, 315 KB repo, last push 2026-09-01. GGUF **will not load in llama.cpp**. |
| Voxtral | `TrevorS/voxtral-mini-realtime-rs` (Rust/Burn) or `CrispStrobe/CrispASR` (C++/ggml) | two independent implementations, which is the strongest signal of the four - but neither is a mainstream dependency |
| Fish S2-Pro | `rodrigomatta/s2.cpp` | self-described **"ALPHA - EXPERIMENTAL ... not production-ready"** |
| Step-Audio-EditX | PyTorch or vLLM | no CPU-oriented runtime at all; would need ONNX conversion of a 3B AR model plus a flow decoder and HiFi-GAN |
| **Kokoro-82M** | `kokoro-js` / `onnxruntime` | mainstream, already measured on the runner |

`yen-idhazh` pins llama.cpp to a specific build and checks its SHA256 before
running it. None of the four runtimes above could be pinned with that confidence
today. That, not the arithmetic, is why none is a candidate yet.

## Known quality hazards

| Model | Hazard |
| --- | --- |
| Breeze `-dd` quants | output "drifts progressively muffled and thin past roughly 45 seconds of continuous generation", and the failure is gradual rather than obvious. The mean summary is 41.8 s of audio - right at that edge. |
| Voxtral | natively generates up to 2 minutes; longer needs interleaving |
| Breeze, Fish | vocal-event tags need CFG scale 2-4 to fire, which costs a second forward pass per step and would roughly double the estimates above |
| All four | trained for expressive multi-speaker work; this project reads fixed copy in one voice |

## The systematic search, 2026-09-12

The four models above were handed to this project one at a time and evaluated as
they arrived. That is compliance with a request, not service of an intent, and it
never asked the question that matters: **what is the best voice for reading fixed
English news copy on a 4 vCPU CPU runner?** A systematic sweep of Hugging Face,
the TTS Arena V2 leaderboard and 2026 arxiv answered it differently.

### Kokoro is the best openly-licensed model there is

**TTS Arena V2, read live 2026-09-12: Kokoro v1.0 is rank 30 of 39, Elo 1477
+/-23, 1033 votes - and it is the highest-rated model on the board flagged
`open: true`.** The ranking is settled, being well past the 300-vote preliminary
threshold. Everything above it is a proprietary API.

Two corrections to widely repeated claims:

- **The "Kokoro is #1" claim is stale and from a different arena.** It refers to
  v0.19 in December 2024, in the smaller TTS Spaces Arena, self-reported on the
  model's own card. It is not the current standing.
- **There is no Kokoro paper and no published MOS.** An arxiv search returns one
  result and it is a different model that borrows the recipe. The Elo is the only
  hard quality number that exists.

### The candidates the earlier pass never looked at

| Model | Params | Arch | Licence | ONNX | Evidence |
| --- | --- | --- | --- | --- | --- |
| **KittenTTS nano 0.8** | **15M** | feed-forward, **same StyleTTS2 + ISTFTNet family as Kokoro** | **Apache-2.0** | native | won a blind listening test at 71.2 percent; best intelligibility of the compact set at 3.06 percent WER |
| **Inflect-Micro-v2** | 9.36M | feed-forward VITS | **Apache-2.0** | verified fp32 export | highest UTMOS22 of the compact set at 4.395; publishes a 4-thread CPU RTF of 0.1593 |
| KittenTTS mini 0.8 | 80M | feed-forward | Apache-2.0 | native | **size-matched to Kokoro and benchmarked nowhere** |
| Supertonic 3 | ~99M | feed-forward flow-matching | OpenRAIL-M | native | best WER at 2.81 percent, and needs **no G2P at all** - but the repository is **archived** and the licence carries use restrictions |
| Piper | ~15M | feed-forward VITS | **GPL-3.0**, "personal use and research only" | native | fastest measured of all - and licence-blocked |

**KittenTTS nano is the strongest challenger**: same architecture family as the
incumbent, so it is a like-for-like swap in the existing onnxruntime path, at a
fifth of the parameters and a permissive licence.

### Traps confirmed

Almost every high-profile 2026 release - Qwen3-TTS, VoxCPM2, MOSS-TTS-Nano,
Higgs, Orpheus, Sesame CSM, Dia, Zonos, IndexTTS - is autoregressive and
publishes no CPU real-time factor. MOSS-TTS-Nano self-describes as "pure
autoregressive" despite marketing itself for CPU and browser. Separately,
`facebook/mms-tts-eng`, XTTS-v2, F5-TTS, E2-TTS and OuteTTS are all
non-commercial licences.

No 2026 arxiv paper ships English open weights that beat Kokoro on a
CPU-RTF-against-quality basis. StellarTTS claims 83M at RTF 0.08 but released no
weights.

## What would change the verdict

In order. The first two are cheap and change everything; the rest only matter if
those two fail.

1. **Stop using `q8`.** Measured 2026-09-12, `q8` is **2.16 times slower than
   `fp32`** on identical audio - every voice figure this project holds was taken
   on the slowest of three available quantisations
   ([record](benchmarks/2026-09-12-quantisation-was-costing-not-saving.md)).
   Applying the ratio puts the runner at about **0.47**, below the
   single-runner budget of 0.692. This is a config change, not a model change.
2. **Judge the incumbent's quality.** Kokoro is the highest-rated open model on
   TTS Arena V2. If it sounds good enough, the search is over and everything
   below is wasted work. 24 real clips exist, hazard-tagged, and nobody has
   listened to one.
3. **Benchmark KittenTTS nano 0.8 against it.** Same architecture family, a
   fifth of the parameters, Apache-2.0, native ONNX, and it won a blind
   listening test against the compact field. Benchmark **fp32**, never the int8
   build, which upstream itself warns about.
4. **Add an automated intelligibility gate.** An ASR round-trip - transcribe the
   generated audio with `faster-whisper`, score against the normalised source
   with `jiwer` - is cheap, runs on CPU, needs no reference audio, and catches
   the failure that matters most here: a proper noun read wrongly, or a chunk
   silently dropped.
5. **Only then consider an AR candidate.** Voxtral has the strongest runtime
   story of the four, but every runtime is a third-party reimplementation and
   the incumbent has not yet been shown to be insufficient.

## A silent failure mode worth knowing about

Kokoro's G2P front-end, `misaki`, falls back to `espeak-ng` for words outside
its lexicon. When espeak is unavailable it logs `EspeakFallback not Enabled: OOD
words will be skipped` and **drops those words from the audio** rather than
failing. For a news corpus full of unfamiliar proper nouns, that is a data-loss
path that produces a clip which sounds fine and is missing a name.

`misaki` handles `$`, `£`, `€`, `%`, cardinals, ordinals, years and acronyms. It
does **not** handle Roman numerals or unit abbreviations - an open issue reports
`II` read as "ai ai" and `10 m` as separate letters. The escape hatch is inline
IPA via markdown-link syntax, `[word](/ipa/)`, which makes a curated
pronunciation dictionary for recurring names the cheapest available quality win.

## Rejected

- **F5-TTS.** Ships only `.pt` and `.safetensors`, no ONNX, and no community
  conversion was found. Rejected 2026-09-12 before the survey proper.

## See also

- [../concepts/model-formats-and-inference.md](../concepts/model-formats-and-inference.md) - RTF, AR vs feed-forward, GGUF vs ONNX, and where 0.707 comes from.
- [measurements.md](measurements.md) - the figure in force for each quantity.
- [benchmarks/2026-09-12-kokoro-on-a-ci-runner.md](benchmarks/2026-09-12-kokoro-on-a-ci-runner.md) - the one voice model this project has measured.
- [../../test/voice-evaluation/README.md](../../test/voice-evaluation/README.md) - the harness any candidate would be judged in.
- [../../CLAUDE.md](../../CLAUDE.md) - Guardrail #10 (measured, not estimated).
