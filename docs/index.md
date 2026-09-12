# Documentation

**Last Updated**: 2026-09-12

Every page in `docs/`, and where the project currently stands. Start at the top;
the rest is a map.

---

# Start here: where the voice decision stands

**One sentence: the incumbent model is good enough on speed, was being run in
its slowest configuration, and nobody has yet listened to it.**

## Settled

| Question | Answer | Record |
| --- | --- | --- |
| How fast does the voice run on the production runner? | **RTF 1.0112** at `q8` | [Kokoro on a CI runner](reference/benchmarks/2026-09-12-kokoro-on-a-ci-runner.md) |
| How fast does it speak? | **126.7 words a minute**, measured on real published text | [Real text and shard arithmetic](reference/benchmarks/2026-09-12-real-text-and-shard-arithmetic.md) |
| Is `q8` the right quantisation? | **No. It is 2.16x slower than `fp32` on identical audio.** | [The quantisation was costing](reference/benchmarks/2026-09-12-quantisation-was-costing-not-saving.md) |
| Does the busiest day fit a 6 h job? | At `q8` on one runner, no. **On four runners, yes - 2.19 h.** At `fp32` it may fit on one. | [Real text and shard arithmetic](reference/benchmarks/2026-09-12-real-text-and-shard-arithmetic.md) |
| Is there a better open model? | **No.** Kokoro is the highest-rated open-licensed model on TTS Arena V2 (rank 30, Elo 1477). | [Voice model survey](reference/voice-model-survey.md) |
| Is storage a problem? | **No.** The prune holds the repository size; the cap sets a retention window, not a limit. | [Pipeline loop](concepts/pipeline-loop.md) |

## Open

| Question | Why it is still open |
| --- | --- |
| **Is the audio good enough to publish?** | 24 real clips exist, hazard-tagged. **Nobody has listened to one.** This is the only question that can still kill the design. |
| Does `fp32` hold up on the runner? | The 2.16x ratio was measured on a laptop. The ratio transfers; the absolute figure does not. |
| Does sharding work in practice? | The four-runner figure is arithmetic. `measure-voice.yml` exists and has never been dispatched. |
| Is a 15M model as good? | KittenTTS nano 0.8 is the same architecture family at a fifth the size, Apache-2.0, and won a blind listening test. Unbenchmarked here. |

## Next action

**Switch to `fp32` and dispatch `.github/workflows/measure-voice.yml`.** One
config change. It confirms the quantisation finding on real hardware and
probably removes the only compute constraint the design has.

Then run `npm run build-clips` in `test/voice-evaluation` and listen.

## What is built, and what is not

- **Built**: the measurement harness, the listening page, the corpus builders,
  the sharded workflow, the budget calculator.
- **Not built**: the pipeline itself. No stage of the daily loop exists in code -
  no read, no synthesise, no publish, no prune. The Listen and Console surfaces
  are specified and not written.

---

# The map

## Concepts - what a term means

| Page | The question it answers |
| --- | --- |
| [vision.md](concepts/vision.md) | What is this project for, and who for? |
| [principles.md](concepts/principles.md) | What does it refuse to do, and why? |
| [pipeline-loop.md](concepts/pipeline-loop.md) | What does the daily job do, stage by stage? |
| [model-formats-and-inference.md](concepts/model-formats-and-inference.md) | What is RTF? What is GGUF versus ONNX? Why is autoregressive slow on a CPU? Where does the shard budget come from? |
| [ui-shell.md](concepts/ui-shell.md) | What are the two surfaces, and what states must a row handle? |
| [design-system.md](concepts/design-system.md) | Which tokens, frames and colours may a surface use? |

## Reference - the exact value

| Page | The question it answers |
| --- | --- |
| [measurements.md](reference/measurements.md) | **What figure is in force right now for each quantity?** |
| [voice-model-survey.md](reference/voice-model-survey.md) | Which text-to-speech models were considered, and what is known about each? |
| [repository-layout.md](reference/repository-layout.md) | Which directory holds what? |
| [documentation-structure.md](reference/documentation-structure.md) | Where does a new page go, and what must it contain? |
| [agent-notes.md](reference/agent-notes.md) | Which tool or shell quirk makes a command lie about its result? |

## Benchmarks - a frozen record of one run

Newest first. A record is never edited after the fact; when a later run
supersedes it, the figure moves to `measurements.md` and the record stays.

| Record | What it measured |
| --- | --- |
| [2026-09-12 - The quantisation was costing, not saving](reference/benchmarks/2026-09-12-quantisation-was-costing-not-saving.md) | `fp32` against `q8` against `q4` on one machine |
| [2026-09-12 - Real text and the shard arithmetic](reference/benchmarks/2026-09-12-real-text-and-shard-arithmetic.md) | The speaking pace on real published summaries, and the budget by shard count |
| [2026-09-12 - Kokoro on a CI runner](reference/benchmarks/2026-09-12-kokoro-on-a-ci-runner.md) | The first voice model run on the production runner |
| [2026-09-11 - Input volume and the price of audio](reference/benchmarks/2026-09-11-input-volume-and-audio-cost.md) | How many items a day, how many words, and what that costs |

## How-to - running a procedure

| Page | The task |
| --- | --- |
| [run-the-gates.md](how-to/run-the-gates.md) | What to run before claiming a change is done |
| [ship-a-pr.md](how-to/ship-a-pr.md) | Branch, transfer, PR, cleanup |
| [ship-to-github-pages.md](how-to/ship-to-github-pages.md) | Getting a surface onto the published site |
| [author-a-plan.md](how-to/author-a-plan.md) | Writing a plan document |
| [distill-a-plan.md](how-to/distill-a-plan.md) | Cutting a plan down |
| [execute-a-plan.md](how-to/execute-a-plan.md) | Working through a plan |
| [handle-scope-change.md](how-to/handle-scope-change.md) | What to do when the work changes shape mid-flight |

## Harnesses - code with its own README

| Directory | What it does |
| --- | --- |
| [`test/voice-evaluation/`](../test/voice-evaluation/README.md) | Generates clips and serves the listening page where a person judges them |
| [`test/onnx-runtime-comparison/`](../test/onnx-runtime-comparison/README.md) | Times one model across runtimes and quantisations, and builds the corpora |

## Agents and contract

| Page | What it governs |
| --- | --- |
| [`CLAUDE.md`](../CLAUDE.md) | The engineering contract: guardrails, naming, definition of done |
| [`AGENTS.md`](../AGENTS.md) | The short pointer version for coding agents |
| [agents/bootstrap.md](agents/bootstrap.md) | The ritual an agent runs at session start |
| [agents/guardrails.md](agents/guardrails.md) | The guardrails, restated for agents |

## Archive

| Page | Why it is here |
| --- | --- |
| [2026-09-11 - Listen and Console design ruling](archive/2026-09-11-listen-and-console-design-ruling.md) | Superseded design discussion, kept for its rejected alternatives |

---

## How to keep this page true

Every page in `docs/` appears exactly once in the map above. A new page that is
not listed here is a page nobody will find, so adding it to this index is part
of writing it, not a follow-up.

**"Start here" carries verdicts, never detail.** The figure lives in
[measurements.md](reference/measurements.md) and the reasoning lives in the
record behind it. When a record supersedes a verdict, this page changes in the
same commit - a stale summary is worse than no summary, because it is read first
and trusted most.

## See also

- [`../README.md`](../README.md) - what the project is, for somebody who has not seen it before.
- [reference/documentation-structure.md](reference/documentation-structure.md) - the routing rules this map obeys.
