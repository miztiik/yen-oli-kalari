# Documentation map

**Last Updated**: 2026-09-12

Every page in `docs/`, and the question each one answers. A reader who arrives
holding a question finds the page here; a writer deciding where a **new** page
belongs uses
[`documentation-structure.md`](documentation-structure.md) instead, which is the
routing rule rather than the inventory.

For the state of the project rather than a page, see
[`../getting-started/where-the-project-stands.md`](../getting-started/where-the-project-stands.md).

## Getting started

| Page | The question it answers |
| --- | --- |
| [where-the-project-stands.md](../getting-started/where-the-project-stands.md) | What is settled, what is open, and what do I do next? |

## Concepts - what a term means

| Page | The question it answers |
| --- | --- |
| [vision.md](../concepts/vision.md) | What is this project for, and who for? |
| [principles.md](../concepts/principles.md) | What does it refuse to do, and why? |
| [pipeline-loop.md](../concepts/pipeline-loop.md) | What does the daily job do, stage by stage? |
| [model-formats-and-inference.md](../concepts/model-formats-and-inference.md) | What is RTF? What is GGUF versus ONNX? Why is autoregressive slow on a CPU? Where does the shard budget come from? |
| [ui-shell.md](../concepts/ui-shell.md) | What are the two surfaces, and what states must a row handle? |
| [design-system.md](../concepts/design-system.md) | Which tokens, frames and colours may a surface use? |

## Reference - the exact value

| Page | The question it answers |
| --- | --- |
| [measurements.md](measurements.md) | **What figure is in force right now for each quantity?** |
| [voice-model-survey.md](voice-model-survey.md) | Which text-to-speech models were considered, and what is known about each? |
| [evaluation-coverage.md](evaluation-coverage.md) | Which quality metrics are measured, which are built but unrun, and which are not measured at all? |
| [repository-layout.md](repository-layout.md) | Which directory holds what? |
| [documentation-structure.md](documentation-structure.md) | Where does a new page go, and what must it contain? |
| [documentation-map.md](documentation-map.md) | Which page answers my question? (this page) |
| [agent-notes.md](agent-notes.md) | Which tool or shell quirk makes a command lie about its result? |

## Benchmarks - a frozen record of one run

Newest first. A record is never edited after the fact; when a later run
supersedes it, the figure moves to [measurements.md](measurements.md) and the
record stays where it is.

| Record | What it measured |
| --- | --- |
| [2026-09-13 - Six voices graded, and the incumbent is beaten](benchmarks/2026-09-13-six-voices-graded.md) | Speed AND verbalization accuracy for six voices on the runner |
| [2026-09-12 - The quantisation was costing, not saving](benchmarks/2026-09-12-quantisation-was-costing-not-saving.md) | `fp32` against `q8` against `q4` on one machine |
| [2026-09-12 - Real text and the shard arithmetic](benchmarks/2026-09-12-real-text-and-shard-arithmetic.md) | The speaking pace on real published summaries, and the budget by shard count |
| [2026-09-12 - Kokoro on a CI runner](benchmarks/2026-09-12-kokoro-on-a-ci-runner.md) | The first voice model run on the production runner |
| [2026-09-11 - Input volume and the price of audio](benchmarks/2026-09-11-input-volume-and-audio-cost.md) | How many items a day, how many words, and what that costs |

## How-to - running a procedure

| Page | The task |
| --- | --- |
| [run-the-gates.md](../how-to/run-the-gates.md) | What to run before claiming a change is done |
| [ship-a-pr.md](../how-to/ship-a-pr.md) | Branch, transfer, PR, cleanup |
| [ship-to-github-pages.md](../how-to/ship-to-github-pages.md) | Getting a surface onto the published site |
| [author-a-plan.md](../how-to/author-a-plan.md) | Writing a plan document |
| [distill-a-plan.md](../how-to/distill-a-plan.md) | Cutting a plan down |
| [execute-a-plan.md](../how-to/execute-a-plan.md) | Working through a plan |
| [handle-scope-change.md](../how-to/handle-scope-change.md) | What to do when the work changes shape mid-flight |

## Agents and contract

| Page | What it governs |
| --- | --- |
| [`CLAUDE.md`](../../CLAUDE.md) | The engineering contract: guardrails, naming, definition of done |
| [`AGENTS.md`](../../AGENTS.md) | The short pointer version for coding agents |
| [bootstrap.md](../agents/bootstrap.md) | The ritual an agent runs at session start |

## Harnesses - code with its own README

| Directory | What it does |
| --- | --- |
| [`test/voice-evaluation/`](../../test/voice-evaluation/README.md) | Generates clips and serves the listening page where a person judges them |
| [`test/onnx-runtime-comparison/`](../../test/onnx-runtime-comparison/README.md) | Times one model across runtimes and quantisations, and builds the corpora |

## Archive

| Page | Why it is here |
| --- | --- |
| [2026-09-11 - Listen and Console design ruling](../archive/2026-09-11-listen-and-console-design-ruling.md) | Superseded design discussion, kept for its rejected alternatives |

## How to keep this page true

**Every page under `docs/` appears here exactly once, and adding the row is part
of writing the page rather than a follow-up.** A page nobody can navigate to is a
page nobody will find - this repository reached twenty-five documents with no map
at all before that was noticed.

[`../../tests/test_documentation_map.py`](../../tests/test_documentation_map.py)
enforces it: a new page that is not listed here fails the suite.

## See also

- [documentation-structure.md](documentation-structure.md) - the routing rules this inventory obeys, and where a new page belongs.
- [`../getting-started/where-the-project-stands.md`](../getting-started/where-the-project-stands.md) - the state of play rather than the index.
- [`../../README.md`](../../README.md) - what the project is, for somebody who has not seen it before.
