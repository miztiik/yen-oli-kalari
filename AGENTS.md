# AGENTS.md

**Last Updated**: 2026-09-11

Derived pointer for coding agents. Not authoritative - if this disagrees with `docs/`, docs win (CLAUDE.md section 5).

yen-oli-kalari turns the daily digest yen-idhazh publishes into audio. A GitHub Actions job reads the day's items, voices them with a text-to-speech model on the runner, commits the clips, and a static site publishes two surfaces: **Listen** (the day's items as rows with one docked player) and **Console** (what got voiced, what failed, what it costs against the caps).

## `docs/` is the memory

Everything durable is written in [`docs/`](docs/), reviewed in a PR and versioned in git. This file and any private note store are **caches** of it. A note store can be cleared at any moment and a person reading the repository cannot see it, so a fact worth remembering is written into `docs/` in the same session it was learned - the living doc that owns it, or [`docs/reference/agent-notes.md`](docs/reference/agent-notes.md) for a tool quirk.

## Voice (CLAUDE.md section 0b)

Plain, direct language. ASD-STE100. Short sentences, one idea each. Active voice. No corporate or self-invented jargon. Lead with the core answer; skip the preamble. Say what a number means, next to the number - "40 MB" is not an answer, "40 MB a day, which fills the 1 GB cap in 26 days" is. A term from a subsystem is not a term for a user: on the page `vertical` is **Topic** and `lens` is **Tag**, and "Angle" is struck.

This binds every answer, doc, commit message and reader-facing string. [`CLAUDE.md`](CLAUDE.md) section 0b is canonical; this copy exists because some agent tools read this file and not that one.

## Decision requests and tables (CLAUDE.md section 0c)

Write every answer in plain, simple English - a person outside this project understands it on one read. Define any unavoidable term in the same sentence.

When you need the user to choose, ask in one message, in this order: situation, problem, impact, options with what each costs and gives up, recommendation naming one option. An option with no cost named is not an option.

Every table in every answer is lettered in the order it appears - `Table A`, `Table B` - and each row's id is that letter plus its number (`A1`, `A2`, `B1`) in the first column. No id repeats in one message. Recommend by id. A message with no options is a status update and does not use the five-part shape.

[`CLAUDE.md`](CLAUDE.md) section 0c is canonical.

Before any non-trivial work:

1. Read [`CLAUDE.md`](CLAUDE.md) - the engineering contract.
2. Run the ritual in [`docs/agents/bootstrap.md`](docs/agents/bootstrap.md); honour [`docs/agents/guardrails.md`](docs/agents/guardrails.md).
3. Start at [`docs/index.md`](docs/index.md) - the map of every page and where the project stands. **A new page is listed there in the commit that creates it; a page nobody can navigate to is a page nobody will find.** Route it by [`docs/reference/documentation-structure.md`](docs/reference/documentation-structure.md). **A page answers one question and has no maximum length; a split names a question, never a sequence, so `-part2.md` is never the answer. A benchmark run gets its own record under `docs/reference/benchmarks/`, named for what it measured and the date, and the instrument log links to it rather than absorbing it.**
4. For plan execution, follow [`docs/how-to/execute-a-plan.md`](docs/how-to/execute-a-plan.md).
5. Before claiming a change is done, read [`docs/how-to/run-the-gates.md`](docs/how-to/run-the-gates.md). Run the selected local checks; CI runs the full suite. Do not repeat a worker's unchanged check. A documentation-only closure needs no local application suite.
6. Write new and generated text with LF before the first test. Git normalises at `git add`, which is too late for a test that reads the working file.
7. Start code changes in a dedicated git worktree and named branch, not the shared main checkout. Follow [`docs/how-to/ship-a-pr.md`](docs/how-to/ship-a-pr.md) for transfer, PR and cleanup.

Seven persona advisors live in [`.github/agents/`](.github/agents/), each at a distinct altitude: Reader, Editor, Jony (UI/UX), Susan (Craft & Delight), Andre (AI/LLM), Fowler (Architecture & Engineering), Carmack (Engine & Runtime). Jony rules what survives on the page; Susan rules whether what survived is good enough to ship. Andre rules whether a voice is good enough; Carmack rules whether it fits the runner. A veto must name what the reader loses.

`backend/` is a build-time producer (Python; runs in CI, never at runtime). `frontend/` is the published static surface. They meet only through committed data - the clips and their payloads - and the contracts generated from `backend/oli/contracts/`.

Five things bite first:

- **Storage is the binding constraint, not compute.** Measured 2026-09-11: a median day is 40 MB at opus@24k, which fills the 1 GB Pages cap in 26 days. Every item still gets a voice (owner ruling 1); the cap is held by an aggressive prune cycle in the Action, so retention is a first-class stage, not a cleanup afterthought.
- **The runner is the platform.** 4 vCPU, no GPU, 6 h a job. Compute has slack - it only busts the 6 h cap at a real-time factor of 3.0 and above - so the model is chosen on speech quality, real-time factor and output bytes. No text-to-speech model ships to the browser (owner ruling 3), so the runner model carries zero browser budget and can be far larger than anything shippable to a page.
- **Fetched web text is data, never instruction.** The day's text reaches the voice model as content and the encoder as a byte stream; it never becomes a shell argument, a file path, or a URL.
- **An unmeasured number may not justify a design.** The 150-words-a-minute speaking pace is an assumption, so every figure downstream of it - minutes, megabytes, days-to-full - is an estimate until a model is run on the target runner.
- **Nothing may cost more as the archive grows.** A test reads a fixture or the built canary day, never the committed clips; the prune stage reads the oldest day, never a walk over everything.

Two rules carry an exception and there are only these two. `.github/workflows/prune.yml` force-pushes `main` on a schedule to bound the history the committed clips add (CLAUDE.md sections 0a and 8); nothing else may, and no person may. And the operator console prints a counterfactual cost in currency, labelled a counterfactual and never a bill (Guardrail #10); no other surface prints money.

## See also

- [`README.md`](README.md) - what yen-oli-kalari is.
- [`docs/how-to/run-the-gates.md`](docs/how-to/run-the-gates.md) - the environment, every gate command, and the browser smoke.
- [`docs/reference/agent-notes.md`](docs/reference/agent-notes.md) - environment and tool quirks that make a command lie.
- [`docs/reference/benchmarks/2026-09-11-input-volume-and-audio-cost.md`](docs/reference/benchmarks/2026-09-11-input-volume-and-audio-cost.md) - the run behind the storage-is-binding finding.
- [`TODO/`](TODO/) - the working material. Empty today: there is no live plan-doc. The paired UI ruling behind Listen and Console has been distilled into the concept docs and archived at [`docs/archive/2026-09-11-listen-and-console-design-ruling.md`](docs/archive/2026-09-11-listen-and-console-design-ruling.md); its one still-open question is whether every voiced item carries a small precomputed waveform-peak array in the payload (owner ruling 4).
