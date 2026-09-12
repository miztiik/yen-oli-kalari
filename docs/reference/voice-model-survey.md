# Voice model survey

**Last Updated**: 2026-09-12

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

## What that means against the budget

With the sharding the pipeline already uses, the picture is far better than the
withdrawn estimates suggested.

| Model | Est. RTF | 1 runner (0.707) | 4 runners (2.83) | 8 runners (5.66) |
| --- | --- | --- | --- | --- |
| **Kokoro-82M** | **1.0112 measured** | busts | **fits, 2.15 h** | fits, 1.07 h |
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

## What would change the verdict

In rough order of how much each would move it:

1. **Run Kokoro sharded on the runner and confirm the budget maths.** The
   4-runner figure of 2.15 h is arithmetic on a single-runner reading, not a
   sharded measurement. `.github/workflows/measure-voice.yml` does this.
2. **Judge Kokoro's quality.** If the incumbent is good enough, this whole survey
   is moot. The listening harness exists and has never been used.
3. **Measure one AR candidate rather than estimating it.** Voxtral has the
   strongest runtime story; building `CrispASR` and timing 24 real summaries
   would replace four estimates with one reading.
4. **Test whether Step-Audio-EditX converts to ONNX.** It is the only
   Apache-2.0 candidate, so it is the only one that survives a commercial
   question. A 3B AR backbone plus flow decoder plus HiFi-GAN is a substantial
   conversion, so this is worth attempting only if the licence matters.

## Rejected

- **F5-TTS.** Ships only `.pt` and `.safetensors`, no ONNX, and no community
  conversion was found. Rejected 2026-09-12 before the survey proper.

## See also

- [../concepts/model-formats-and-inference.md](../concepts/model-formats-and-inference.md) - RTF, AR vs feed-forward, GGUF vs ONNX, and where 0.707 comes from.
- [measurements.md](measurements.md) - the figure in force for each quantity.
- [benchmarks/2026-09-12-kokoro-on-a-ci-runner.md](benchmarks/2026-09-12-kokoro-on-a-ci-runner.md) - the one voice model this project has measured.
- [../../test/voice-evaluation/README.md](../../test/voice-evaluation/README.md) - the harness any candidate would be judged in.
- [../../CLAUDE.md](../../CLAUDE.md) - Guardrail #10 (measured, not estimated).
