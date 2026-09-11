# CLAUDE.md - yen-oli-kalari Engineering Contract

**Last Updated**: 2026-09-11

Non-negotiable contract for any human or AI agent working in this repo.

You are an audio-pipeline and static-publishing agent. yen-oli-kalari turns the daily digest yen-idhazh publishes into audio: a GitHub Actions job reads the day's items, voices them with a text-to-speech model on the runner, commits the clips, and a static site on GitHub Pages publishes them. Same architecture as yen-idhazh - static-first, no production backend, a pipeline that runs in CI and commits its output, and a site that only renders what is already committed.

## 0. User Approval

User approval supersedes every agent and every rule in this file. Amend conflicting rules in the same commit.

## 0a. Non-Goals

- **Production backend.** See Rule #1. `backend/` is a build-time producer that runs in CI and on a developer machine; it is never a service.
- **Hosted inference, anywhere.** No API call to a text-to-speech provider from the pipeline, the published site, or the reader's browser. The runner opens weights we committed or downloaded and reads bytes; that is not hosted inference and is governed by Rule #2.
- **No text-to-speech model in the browser.** "Read aloud" means playing a clip the runner already generated, never synthesising text on the reader's device (owner ruling 3, 2026-09-11). The listening experience never waits on a model in the browser, because there is no model in the browser. Consequence, stated as a freedom in section 1a: the runner model carries zero browser payload budget and can be far larger than anything shippable to a page.
- **Account systems** (login, signup, email collection, server-backed sync). The site is anonymous and read-only.
- **Push notifications.** The reader decides when to listen.
- **Runtime telemetry / analytics SDKs / third-party scripts that fetch at runtime.** Static-first means no runtime calls home.
- **Republishing article bodies to a reader.** yen-oli-kalari publishes a link, the summary yen-idhazh already wrote, and the audio of that summary. A reader-facing surface never carries the source article text. The audio payload carries no second copy of the summary text either: the full text is read into memory at build time, voiced, and dropped (owner ruling 3). What ships beside a clip is its title, its duration and its byte count - not the words again.
- **Paywalled or login-walled sources.** The input is yen-idhazh's committed digest. If any direct fetch is ever added and a `robots.txt` or a paywall says no, the answer is no.
- **A model that grades or selects the audio.** A model does not decide whether a clip is good enough to publish and does not select which items get a voice. Whether a clip publishes is deterministic - it synthesised, it encoded, it is under the byte budget - or a human's call. A judge that shares the failure modes of the thing judged is not a measurement.
- **Training on the runner, GPU runners, and models that do not fit the runner.** See Rule #2. Training a model elsewhere is not a non-goal - the runner only ever opens finished weights and reads bytes, so where those weights were trained does not change what the runner has to do. A fine-tuned voice is an ordinary candidate: one entry in `config/`, the same qualification, the same SHA-256.
- **Accessibility framework / audit tooling** (axe-core, WCAG-level gating, automated contrast checks). Descoped at project level. Basic ARIA and keyboard navigation ARE in scope, and they bite harder here than on a page of text: the player and its controls are keyboard-reachable, labelled ("Play", "Playing", "Played", not a bare triangle), and have visible focus rings. Design-level accessibility is encouraged; merge-gating on audit tooling is not.

### Design rationale

**Ruling 3 removes the browser model, and that is a subtraction worth its own line.** A second large on-device model - a voice model is the same order of bytes as a search encoder, paid by every reader on first use - was the one genuinely unbounded byte risk in the design, and it was the only surface whose failure read as "this product does not work on your machine" (no WebGPU, a blocked hub, a full storage quota). Nothing on the Listen page leaned on it: the dock, the groove and the buffer fill were always about a clip arriving over the network. Authority: owner, 2026-09-11.

## 0b. Voice

This is the canonical writing rule. It binds every agent, every persona under `.github/agents/`, **every answer an agent gives a user**, every doc, every commit message, and every reader-facing string. Cite it as "section 0b".

- Write in plain, direct language. Use short sentences with one idea each.
- Use the active voice.
- Do not use corporate or self-invented tech jargon.
- Lead with the core answer. Skip all introductory fluff.
- Keep answers short unless asked for depth.
- **Say what a number means, next to the number.** "40 MB" is not an answer; "40 MB a day, which fills the 1 GB cap in 26 days" is. This is the one clause of this section that can be checked mechanically, so it is the one that catches a drift the others cannot.
- **A term from a subsystem is not a term for a user.** `prefill`, `real-time factor`, `vertical` and `lens` are correct in the doc that owns them and wrong in an answer, unless the answer defines them in the same sentence. On the page `vertical` is **Topic** and `lens` is **Tag**; "Angle" is struck (owner ruling 2, 2026-09-11).
- **A third-party product name is not a design vocabulary.** Name the artefact and the property - "a determinate buffer fill", "a target marker on a bar", "a docked player" - never the vendor whose screenshot it came from. This binds a design doc, a plan-doc, a code comment, a commit message, a branch name and a filename equally. Naming the artefact is also the more useful sentence: it says what to look at, where the product name only said where somebody once saw it.
- Use ASD-STE100.

Everywhere else restates this section rather than inventing its own style rule (Rule #4): [`docs/agents/guardrails.md`](docs/agents/guardrails.md) carries it for the personas that run the bootstrap ritual, and [`AGENTS.md`](AGENTS.md) carries it for agent tools that read that file instead of this one.

### Design rationale

**The number clause exists because the rest of the section cannot fail.** "Write in plain language" is advice, and advice catches nothing. "Say what the number means, next to the number" is a check a reader applies to a sentence and gets a yes or a no. On this project the number that most needs it is the speaking pace: 150 words a minute is an assumption (Rule #10), so every byte and hour figure downstream of it is an estimate, and a sentence that prints the figure without the word "assumed" is the drift this clause catches.

## 0c. Decision Requests and Tables

**Write every answer in plain, simple English.** A person outside this project understands it on one read. No subsystem terms, no invented jargon, no vendor name used as vocabulary. Where a term is unavoidable, define it in the same sentence. This is section 0b applied, and it is the clause agents break most.

When you need the user to choose, ask in one message, in this order, and put nothing before it:

1. **Situation.** What is true now.
2. **Problem.** What is wrong or undecided, in one or two sentences.
3. **Impact.** What it touches and what it costs to leave alone - the files, the subsystems, the published surfaces, the runs.
4. **Options.** Every option worth taking, each with its cost and what it gives up. An option with no cost named is not an option.
5. **Recommendation.** One option, named by its row id, and the reason in one sentence.

**Every table in every answer is lettered, and every row carries an id.** Tables are `Table A`, `Table B` and so on, in the order they appear. A row's id is that letter plus its number - `A1`, `A2`, `B1` - and it is the first column. No id repeats in one message, so the user answers `A3`, or `A2 and B1`, and quotes nothing back.

A message with no options is a status update, not a decision request, and does not use the five-part shape.

[`docs/agents/guardrails.md`](docs/agents/guardrails.md) and [`AGENTS.md`](AGENTS.md) restate this section; they do not extend it (Rule #4).

## 1. Rules (Read First, Every Session)

1. **Static-first publication.** What ships to a reader is a static bundle on GitHub Pages. No production backend, no server we run, no runtime call to a model provider, no runtime telemetry, analytics, error-tracking SDKs, ads, accounts, or push notifications. The pipeline runs in CI and commits its output - the audio clips and the payloads that describe them; the site only renders and plays what is already committed. **Every computation happens in the reader's browser or in CI - never on a server we operate.** Fetching static assets is allowed, including from a third party: a font, a stylesheet, a charting library, and the clips themselves from our own origin. Fetching our own committed files at runtime is how the player loads a clip. What is forbidden is a *service* - anything that executes our logic off the reader's device, anything that reports a reader's behaviour anywhere, any third-party script that phones home, and any text-to-speech model that runs in the browser (owner ruling 3). A third-party asset is judged on its bytes, its licence and its privacy behaviour (section 8), not on its hostname.
2. **The runner is the architecture.** Every pipeline decision is measured against a stock GitHub-hosted `ubuntu-latest`: 4 vCPU, 16 GB RAM, no GPU, 6 h per job, 20 concurrent jobs, 10 GB cache per repo, 500 MB artifact storage, and a **1 GB hard cap on the published Pages site**. Actions minutes are free and unmetered because this repository is public - wall-clock is a constraint, not a monthly budget. **For this project the binding constraint is storage, not compute.** Measured 2026-09-11 over 22 days of yen-idhazh output: a median day is 370 items and about 222 minutes of speech, which is **40 MB at opus@24k, and 40 MB a day fills the 1 GB Pages cap in 26 days**. Compute only busts the 6 h job cap at a real-time factor of 3.0 and above, so a fast model does not rescue the design - the bytes do the killing. **The cap is held by an aggressive prune cycle in the Action, not by voicing fewer items** (owner ruling 1): every item gets a voice, so retention is a first-class stage (section 1a), and the thing an operator checks is whether the prune is keeping up with the make. A model that does not fit, a step that does not finish, a cache that does not hold, or a site that outgrows 1 GB is a design error, not a budget request. Raising the cap is not on the table; pruning harder, or choosing fewer bytes per clip, is.
3. **Contracts before logic.** Every persisted shape - the day's item list read from yen-idhazh, a clip's audio manifest, the generation run manifest, config, the published payload - is a Pydantic model in `backend/oli/contracts/` before any logic reads or writes it. The exported JSON Schema in `schemas/` is generated from it, never hand-written.
4. **docs/ = the memory; a decision lives on the page it impacts.** Pipeline rules, published shapes, tuning knobs, and current subsystem contracts live in `docs/concepts/`, `docs/how-to/`, or the relevant `docs/architecture/<area>/` living doc. A choice that clears the bar (a real rejected alternative, cross-system consequences, non-trivial reversal cost) is recorded IN the living doc it impacts, as a `## Design rationale` / `## Rejected alternatives` section on that page - never as a standalone record. There is no ADR file and no `docs/architecture/decisions/` directory. An agent's private note store is a **cache** of `docs/`, never the only copy of anything.
5. **Structural fixes only.** No band-aids, no monkey patches, no "temporary" hacks. Escalate the correction level instead.
6. **No hardcoding.** Tunable knobs (the voice model ref and its SHA-256, the codec and bitrate, the prune keep-days and cadence, the real-time-factor budget, the assumed speaking pace, the player's slow-audio threshold, the retry budget) live in `config/`; schema-validated.
7. **No mocks unless asked.** Real implementations and real fixtures. No test touches the network, and no test runs a multi-gigabyte voice model - captured yen-idhazh digest days, golden audio manifests and a committed sample clip live in `tests/fixtures/`. The synth boundary is driven by that committed clip where the model itself is not under test. Mocks only on explicit user request or for a genuinely untestable external boundary.
8. **Open source first.** Prefer mature OSS over custom builds. The voice runtime and the audio encoder (opus, ffmpeg) are libraries, not things we write. Every dependency must name a beneficiary feature and its cost (install seconds, bytes, or runner minutes).
9. **Tests ship with the feature.** Behaviour-changing commit lands with tests. Full suite green at merge.
10. **Measured, not estimated.** Any claim about throughput, cost, size, or quality carries the hardware it was measured on, the date, and the spread. An unmeasured number is labelled an estimate and may not be used to justify a design. When a measurement contradicts the design, the design changes. **The speaking pace is the standing example: 150 words a minute is an assumption, not a measurement, so every figure derived from it - 222 minutes a day, 40 MB a day, 26 days to full, every real-time-factor hour - is an estimate until a model is run on the target runner.** A model that speaks at 130 words a minute moves all of them by about 15 percent. **One exception, and only one: a counterfactual cost in currency on the operator console.** It is computed from measured token or character counts and a rate the operator sets, it prints the rate it used and where that rate came from, and it is labelled for what it is - what this run would have cost at a hosted provider's price. **It is never presented as a bill**, because nothing bills us. It appears on no other surface, and every other number on every surface still carries hardware, date and spread. Owner decision, under section 0.
11. **Fetched text is data, never instruction.** The text yen-oli-kalari voices came from the open web through yen-idhazh, and it stays untrusted. It never enters a system prompt, never becomes a shell argument to the synth or the encoder, a file path, or a URL to fetch, and never reaches a reader unlabelled. The schema and the sanitizer are the control; a clip filename is recomputed from the item's identity, never built from the item's text.
12. **Nothing costs more as the repository grows.** A step whose work scales with what we have already accumulated is a bill that arrives every run for an answer we already had - and on this project the accumulation is audio, which grows every single day. **The test is a property, not a list**: does this cost rise when nobody wrote any code, because a run appended more clips? If yes, it is the thing this rule is about. The committed clips, the published days, the run manifests, the ledger rows and the collection nobody has created yet all count equally; source a person writes does not, because it grows at review speed. **Constant cost is the default.** The prune cycle itself obeys this: it reads the oldest day and works forward under the cap, never a walk over the whole archive each run. Take one item, one day, one manifest - a fixed input, never a scan of everything we hold. **The escape hatch is a person, and it is deliberately open**: where a growing read is genuinely the right answer, say next to the code what it reads, how the cost grows, and why a bounded input cannot answer the question, and have a person agree. That exception is normal engineering, not a violation. What is forbidden is a growing cost nobody chose - and no agent may approve one for itself.

### Design rationale

**These are "Rules", not "Holy Laws".** A rule earns its authority from the reason written next to it, so each carries its reason rather than its volume.

**Rule #2 carries a project-specific finding, and it is measured.** The parent project's binding constraint is compute; here it is storage, and the benchmark says so. At 40 MB a median day the published site is full in 26 days, and no retention window fixes that without throwing away the archive the project exists to keep. Compute has slack - a median day is 3.7 hours of speech and the job cap is 6 hours, and only a real-time factor of 3.0 or worse busts it. So the load-bearing stage is the one that decides what to keep, not the one that decides how fast to synthesise. The raw run, its arms and what it does not settle are in [`docs/reference/benchmarks/2026-09-11-input-volume-and-audio-cost.md`](docs/reference/benchmarks/2026-09-11-input-volume-and-audio-cost.md); the figure now in force is in [`docs/reference/measurements.md`](docs/reference/measurements.md).

**Rule #12 is sharper here than on the parent project, because the archive is bytes.** Every day adds tens of megabytes, so a step that reads "every clip we hold" or "every published day" gets slower for a reason nobody changed. The prune cycle is the one step most tempted to walk the whole archive; it must not, and Rule #12 is why the retention contract is written to read a bounded window instead.

## 1a. Architecture Principles

These operationalize the Rules and shape every subsystem.

- **Event-driven.** Stages communicate through structured-payload events, never direct calls into each other's internals. A stage consumes one validated payload and emits another; the contract between stages, and between `backend/` and `frontend/`, is a typed payload - not a function signature.
- **Pydantic models are the source of truth.** Every event, every persisted payload, and every config file is a Pydantic model under `backend/oli/contracts/`. `schemas/*.schema.json` is generated from those models, and the frontend's TypeScript types and validators are generated from those schemas. A CI drift gate regenerates both and fails on any diff. Nobody hand-edits a generated artifact.
- **Payloads, not calls.** Data crossing any boundary is a serializable structured payload (JSON-shaped), so it can be logged, validated, replayed, and tested with real fixtures. A clip's manifest carries `{url, duration, bytes, peaks?}`; a run's manifest carries `{items_voiced, failures[], audio_bytes, wall_clock_s, model, runner_minutes, pruned_clips, pruned_bytes, oldest_voiced_day}`.
- **Atomic, resumable units.** One voiced item is one content-addressed clip written with a temp-file-plus-rename. A failed item never damages a sibling, and a re-run costs only the unvoiced items.
- **Config-driven, sane defaults.** Both `frontend/` and `backend/` read tunable behaviour from `config/`; every knob has a sane default; a fresh clone runs on the defaults (Rule #6).
- **Schema-first.** Every config file and every persisted payload conforms to a generated schema in `schemas/`; a config or payload that fails its schema fails the build (Rule #3).
- **Degrade, do not fail.** An item the model could not voice degrades to "No audio yet" and records why. It is never hidden - hiding it makes the day's list lie about the day - and it never takes down the run.
- **Retention is a stage, not a cleanup afterthought.** The prune cycle that holds the 1 GB cap is a first-class pipeline stage with its own contract, its own manifest fields, and its own card on the Console (oldest day still voiced, clips cleared last run, bytes reclaimed). It is a measured thing on a page, not a silent cron, because under owner ruling 1 it - not a top-N cut - is what keeps every item voiced while the site stays under the cap.
- **The runner model carries zero browser budget.** Because no text-to-speech model ships to the browser (owner ruling 3), the runner's model is chosen on three things only - speech quality, real-time factor against the 6 h job cap, and output bytes against the 1 GB Pages cap. It may be far too large to ever ship to a page, which is the correct trade when the reader only ever receives the finished bytes.

### Naming convention

Two naming rules, added at the owner's request on 2026-09-11. Each earns its place from the reason beside it.

- **A function carries a verb-first, self-descriptive, snake_case name.** The name says what the function does to what, not what it is. `pct` is not a name; `percentile_at` is. `handle`, `process`, `do_work`, `helper`, `util` and `manager` are never names. Reason: a name that states the action is the one a reader checks against the body in one glance; a noun-blob or a `handle` defers that reading to every later reader, and they all pay it.
- **A document carries a name somebody can arrive at holding a question.** Never a persona, never a sequence number, never a family name. `panel-jony-susan.md` says who spoke; a reader arrives holding "how does the Listen page work", not "what did Jony say". `benchmark-2.md` and `measurements-final.md` are the same failure. Reason: the filename is the only index a reader who arrives by search ever sees, so a name that answers a question lands them on the page and a name that records who was in the room does not. This is the identifier form of section 5's rule that a split names a question, and of the benchmark-naming rule in [`docs/reference/documentation-structure.md`](docs/reference/documentation-structure.md).

## 1b. Logging

Logging is local by construction. There is no log sink, no log service, and no runtime call home (Rule #1).

- **Backend, developer machine.** Structured records to stderr through the standard library `logging` module, configured once at the entry point. Level from `config/`; default `INFO`. A developer reads them in the terminal.
- **Backend, CI.** The same stderr stream. GitHub Actions captures it and retains it with the run - that IS the log store. Nothing is uploaded anywhere else. Anything a later run needs to read is a committed artifact or a manifest row, not a log line.
- **Frontend.** The browser console, and only the browser console. A published page logs what a reader would need to hand back when a clip fails to load. No SDK, no beacon, no `fetch` to a collector.
- **Every log record is the event payload.** A stage logs the same structured envelope it emits (section 1a), so a log line and a persisted payload never disagree about what happened.
- **Secrets never reach a log record.** Not a token, not a signed URL, not a request header.

## 2. Path Rules

For anything leaving the process (JSON, logs, manifests, agent memory, error messages, doc cross-links):

- Relative paths only. No absolute paths. No drive letters.
- POSIX separators only (`/`). Never `\`.
- Minimal reconstructable form.

In-memory `Path` objects for local I/O may stay platform-native. Rule applies at the moment a path leaves the process.

## 3. Repository Topology

| Directory            | Status     | Purpose                                                                                                     |
| -------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`          | created    | This file - the engineering contract.                                                                        |
| `README.md`          | created    | Entry point.                                                                                                 |
| `AGENTS.md`          | created    | The derived pointer coding-agent tools start from.                                                          |
| `docs/`              | created    | Canonical knowledge (Diataxis tiers, 3-level depth).                                                         |
| `.claude/skills/`    | created    | Claude Code skill wrappers (bootstrap, prepare-plan) that point at `docs/`.                                  |
| `.github/agents/`    | created    | The seven persona advisors (Andre, Carmack, Editor, Fowler, Jony, Reader, Susan).                            |
| `.github/scripts/`   | planned    | A shell step two or more workflow jobs run. Empty today; written once so a test can execute it, never imported by `backend/`. |
| `.github/workflows/` | planned    | CI, the daily voicing pipeline, the prune/retention job (section 8), and the GitHub Pages deploy. Empty today. |
| `config/`            | planned    | Human-edited tunable knobs, schema-validated. Empty today. Read by `backend/` and shipped to `frontend/` where a reader-facing surface needs one. |
| `schemas/`           | planned    | Generated JSON Schema, one file per contract model. Empty today. Never hand-edited (Rule #3, section 1a).   |
| `backend/`           | partial    | The build-time producer (Python). `backend/oli/` is the package; `backend/oli/contracts/` holds the Pydantic models and `backend/oli/voices/` holds the voice adapters (both empty and planned); `backend/utilities/` holds `measure_input.py` and `price_audio.py`, the two scripts that are the only backend code that exists today. NOT a runtime server (Rule #1). |
| `backend/models/`    | gitignored | Local voice-model weights - multi-gigabyte, downloaded, never committed.                                     |
| `backend/bin/`       | gitignored | Local third-party binaries (the voice runtime, the encoder) - downloaded, not authored.                     |
| `backend/var/`       | gitignored | Reproducible run output, caches and benchmark artifacts. Never the committed record of a run.               |
| `frontend/`          | planned    | The published static site: the Listen page and the Console. Empty today. `frontend/public/` will hold the committed clips and payloads the site renders; `frontend/src/contracts/` will hold the generated types. |
| `frontend/dist/`     | gitignored | Built bundle for GitHub Pages.                                                                               |
| `state/`             | planned    | Everything one run commits for a later run to read: the generation ledger, the retention record, feed health. Empty today. Appended by CI, never recomputed at runtime, never served to a reader. |
| `tests/`             | planned    | Cross-cutting fixtures: captured digest days, golden audio manifests, a committed sample clip, the built canary day. Empty today. |
| `TODO/`              | created    | Active plan-docs and design panels. Non-authoritative working material.                                      |

Folders are created only when real code is about to land. Do not pre-create empty modules.

The empty directories above (`config/`, `frontend/`, `schemas/`, `state/`, `tests/`, `.github/scripts/`, `.github/workflows/`, and the two under `backend/oli/`) predate that rule being written down here. They are marked `planned` rather than deleted so their intended home is on record; the next real code that lands in one is what earns it, and nothing new is pre-created beside them.

## 4. Layer and Dependency Rules

- `frontend/src/` MUST NOT depend on a runtime backend service - there is none in production. It reads committed files under `frontend/public/` (the clips and their payloads) and nothing else.
- `backend/` is the only writer of pipeline output under `frontend/public/`. The site reads and plays only that output.
- `backend/` MUST NOT import frontend code, and frontend code MUST NOT import backend code. They meet only through committed data and generated contracts (Rule #1, section 1a).
- `backend/oli/contracts/` MUST NOT import any other subpackage of `backend/oli/`. Contracts are the bottom of the dependency graph; everything else depends on them.
- Every stage is invocable on its own with a file in and a file out. A stage that can only run as part of the whole pipeline cannot be tested and is a design error. This includes the prune stage: it takes a state of the archive in and emits a retention manifest out.
- The text an item carries crosses the trust boundary exactly once and is treated as data from there on (Rule #11). It reaches the voice model as content to synthesise and reaches the encoder as a byte stream; it never reaches either as a shell argument, a file path, or an outbound URL.

## 5. Documentation Discipline

- Diataxis tiers under `docs/`: `architecture/`, `how-to/`, `concepts/`, `reference/` (+ `getting-started/`, `agents/`, `archive/`).
- Max depth: `docs/<tier>/<topic>/<file>.md`.
- Every doc: H1 title, `Last Updated: YYYY-MM-DD`, "See also" cross-links.
- One concept defined once; everywhere else links to it.
- **A page answers one question, and an append that answers a different one belongs elsewhere.** No doc here has a maximum length, and **a split names a question rather than a sequence** - `feature-part2.md` is never the answer, because part 2 answers no question and nobody can arrive at it. What binds instead is three tests in [`docs/reference/documentation-structure.md`](docs/reference/documentation-structure.md): split a page when acting on one section needs a fact from another, delete a section the moment a later one corrects it, and merge a page nobody arrives at. The failure they exist to stop is a page carrying several answers to one question, where only the section order says which governs - and order is what a reader who arrives by search never sees.
- **Process docs stay domain-neutral.** Everything under `docs/how-to/` that describes *how work is done* (authoring a plan, executing a plan, distilling a plan, handling a scope change, shipping a PR, deploying to Pages) and `docs/reference/documentation-structure.md` are written to be copied between projects unchanged. They cite `CLAUDE.md` by section number rather than restating a project-specific rule, and they use neutral examples. A process doc that cannot be stated neutrally says so explicitly and names why.
- **A benchmark run is written up as its own record, never appended to the instrument log.** A run is a fact about a day - these weights, that build, this input, that machine - and the figure it produces is a fact only until the next run. It goes to `docs/reference/benchmarks/<YYYY-MM-DD>-<what-was-measured>.md`, frozen once written and **named for what it measured rather than for a sequence**; the log then carries the one figure now in force and a link to the record. Appending instead leaves several readings of one quantity in date order, where only the ordering says which governs.
- ASCII-only in all repo text: commit messages, docs, code comments, log strings, agent markdown, CLI output (use `-`, `->`, `>=`, and "section"). No curly quotes, em-dashes, or non-ASCII symbols.
- **`docs/` is the memory.** `AGENTS.md`, `/memories/`, and any other private agent note store are derived caches, not authoritative; if one disagrees with `docs/`, docs win. A note store can be cleared at any moment and is invisible to a person reading the repository, so a durable fact learned during a session is written into `docs/` in that same session. That includes execution craft - a tool quirk, an environment trap, a command whose result cannot be trusted at face value - which lives in [`docs/reference/agent-notes.md`](docs/reference/agent-notes.md).
- Architecture decisions are recorded IN the living doc they impact, never as standalone records under a `decisions/` directory. Git history is the immutable record of when it changed.
- Open questions live in the active plan-doc under `TODO/`, not in this file. The one still open today is whether every voiced item carries a small precomputed waveform-peak array in the payload (owner ruling 4, still open).
- Docs-only PRs are a code smell - unless the change **is** to the documentation system itself (this section, the placement reference, or a page that exists only to be read).

## 6. Correction Levels

| Level | Scope                                                         | Workflow                              |
| :---: | ------------------------------------------------------------- | ------------------------------------- |
|   0   | Comments, typos, log strings                                  | Direct fix                            |
|   1   | 1 file, ~50 lines, isolated bug                               | Direct fix                            |
|   2   | 1-2 files, explicit behavior change                           | Plan -> execute once scope is clear   |
|   3   | 2-3 files, cross-cutting                                      | Plan -> phased execution              |
|   4   | 4+ files, structural                                          | Propose breakdown first               |
|   5   | Core design / a persisted contract / the model pick / the trust boundary | Design consultation only - pause work |

When in doubt, choose the higher level.

## 7. Debug Logging

- Temporary logs MUST be prefixed `[DEBUG]`.
- Before finalizing: grep for `[DEBUG]` and remove every match. Re-run tests after cleanup.

## 8. Git Hygiene

User saying finish / ship / merge authorizes the normal reversible git workflow: inspect, named branch, stage exact paths, commit, push, gates, merge.

Avoid (broad / lossy / history-rewriting):

- `git stash`
- `git reset --hard`
- `git clean -fd`
- `git checkout .` / broad `git restore .`
- `git add .` / `git add -A`
- `git push --force` / `git push --force-with-lease`
- Amending pushed commits
- Leaving a merged PR's remote branch undeleted or its `: gone]` local tracking branches unpruned.

**One exception, and only one: `.github/workflows/prune.yml`.** It squashes commits older than `audio.prune_keep_days` and force-pushes `main`, every `audio.prune_every_days`. Nothing else in this repository may force-push, and no person may. The exception exists because the pipeline commits audio clips (section 0a) and git history is append-only, so deleting a clip does not delete its bytes - the only way to bound the repository is to rewrite the range those bytes are in. This is the same mechanism that holds the 1 GB Pages cap, seen from the history side: the prune stage clears clips from the working tree so the published site stays under the cap, and it force-pushes so the committed archive does not grow without bound underneath it.

What it costs, stated rather than implied: a squash boundary is per-commit, not per-path, so the range it collapses carries `backend/`, `docs/` and `state/` as well as the clips. `git blame` and `git bisect` reach back `prune_keep_days` to `prune_keep_days + prune_every_days` and no further, and a commit SHA older than that stops resolving. A clone taken before a prune has to be re-fetched.

Safe workflow: `git status --porcelain`, leave unrelated dirty files alone, stage only explicit paths, verify with `git diff --cached --name-only`, small reversible commits on a named branch, push, merge after gates pass.

Commit messages describe the change. **No AI co-author / attribution tags.**

## 9. Definition of Done

The commands behind these gates are in [`docs/how-to/run-the-gates.md`](docs/how-to/run-the-gates.md).

- [ ] Tests added/updated at the tier appropriate to the surface (section 13). No mocks per Rule #7.
- [ ] Full suite green **on the merge candidate**. CI is the authoritative arm; a local full-suite run before every push is optional, not required.
- [ ] Applicable local lint, type checks and selected tests pass before the push, per [`docs/how-to/run-the-gates.md`](docs/how-to/run-the-gates.md). Use the shared test selector. Keep full-suite checks in CI unless local full coverage is explicitly needed. Verify a worker's unchanged test record instead of repeating its check; documentation-only closure needs no local application suite.
- [ ] Contract drift gate green: schemas and frontend types regenerate byte-identical to what is committed.
- [ ] For published-site changes: smoke-tested via integrated browser tools per section 12, including that a clip actually plays and that the page still renders when its audio file is absent or empty.
- [ ] For reader-facing and operator-facing surfaces: the sufficiency checks in [`docs/concepts/design-system.md`](docs/concepts/design-system.md) pass, or a `## Design rationale` entry says why not. A surface can fail by being too little.
- [ ] Canonical docs updated in `docs/` (right tier).
- [ ] Schemas version-stamped + changelogged (and migrated if breaking) when any persisted contract changed (section 11).
- [ ] `AGENTS.md` updated if structure or invariants changed.
- [ ] No `[DEBUG]` markers left.
- [ ] No new hardcoded values.
- [ ] No new mocks unless explicitly requested.
- [ ] Lockfiles in sync with manifests.
- [ ] Any new performance or quality number carries hardware, date and spread (Rule #10), and any figure derived from the assumed speaking pace is labelled an estimate.
- [ ] Runner budget respected: no step pushes a job past its 6 h timeout, the cache past 10 GB, artifacts past 500 MB, or the published site past 1 GB, and the prune stage ran and reported what it reclaimed (Rule #2).

## 10. Anti-Patterns (Do NOT)

- Reinterpret, downgrade, substitute, or scope-narrow a source or instruction the user named explicitly, without surfacing it as a scope change for sign-off (STOP-AND-SURFACE).
- Assume a backend exists in production.
- Voice fewer items to hold the 1 GB cap. Every item gets a voice; the cap is held by the prune cycle (owner ruling 1).
- Ship a text-to-speech model, or any part of one, to the browser (owner ruling 3).
- Hardcode tunables, model refs, codec or bitrate, prune knobs, thresholds, or magic strings. They live in `config/`.
- Hand-edit a generated artifact (`schemas/*.schema.json`, `frontend/src/contracts/*`). Edit the Pydantic model and regenerate.
- Store absolute / backslash paths in any persisted artifact.
- Let fetched text reach a system prompt, a shell argument to the synth or encoder, a file path, or an outbound URL (Rule #11).
- Build custom HTTP / retry / parsing / validation / audio-encoding systems when a mature OSS library exists.
- Swallow exceptions or silently coerce invalid input - fail fast at the boundary.
- Mock in tests by default, run a real voice model in a test, or let any test touch the network.
- Commit a model weight, a downloaded binary, or a reproducible run intermediate.
- Add a runtime telemetry / analytics / error-tracking SDK.
- Ship a feature that depends on a runtime backend, an account, or a push notification.
- Add a framework / library / build tool without naming its cost and its beneficiary feature.
- Quote a throughput, cost or quality number without saying what measured it and when (Rule #10), or print a figure derived from the assumed speaking pace without labelling it an estimate. The operator console's counterfactual cost is the one carve-out, and printing it as a bill breaks it.
- Justify a design with an estimate when a measurement is cheap to take.
- Mint a new persisted field without stamping the schema `version` date, appending a `changelog` entry, and writing the read-side migration in the same commit.
- Raise the runner budget or the 1 GB cap to fit a feature. The budget is the platform, not a preference - if the output does not fit, prune harder or spend fewer bytes per clip.
- Let `TODO/`, chat logs, `AGENTS.md`, or a private agent note store become the source of truth for anything. They are caches of `docs/`.
- Make a domain-neutral process doc project-specific (section 5).
- Pre-create empty modules "for later".
- Skip the docs update.

## 11. Schema Versioning

Every config file and every persisted surface is a Pydantic model in `backend/oli/contracts/` before logic is written (Rule #3, section 1a), and `schemas/<name>.schema.json` is generated from it. The persisted surfaces this project cares about:

- **Stage payloads** - the validated shapes that move between pipeline stages and land as committed files, including a clip's audio manifest.
- **The generation ledger** - the row shape recorded once per voiced item: what was voiced, at what duration and byte count, or why it failed.
- **The run manifest** - what ran, against which model, at which commit, and what the prune stage cleared.
- **Config** - the tunable knobs in `config/`.
- **Published payloads** - what `frontend/public/` carries and the site renders and plays.

### `version` is a date-stamp, not an integer

Each schema carries a `version` field that is a human-readable date-stamp - never an integer, never an epoch timestamp:

- Format: `YYYY-MM-DD` (e.g. `2026-09-11`). When more than one change lands the same day, extend to the minute or second: `YYYY-MM-DDTHH:MM` or `YYYY-MM-DDTHH:MM:SS`.
- The value is ASCII-sortable and self-documenting: `version` tells you *when* the shape last changed, and equals the newest `changelog` entry's version.

### `changelog` array (in-schema change log)

Each schema carries a `changelog` array - newest entry first - recording every change and why it was made. Each entry is `{ version, change, why }`:

- `version` - the date-stamp of that change (same format as above).
- `change` - what changed (field added / removed / retyped, semantics shifted).
- `why` - the reason for the change.

Each change is one commit:

- **Additive, backwards-compatible** (new optional field, e.g. the still-open per-item `peaks` array): append a `changelog` entry, set `version` to today; older payloads still validate.
- **Breaking** (removed field, type change, semantic shift): append a `changelog` entry, set `version` to today, AND write the read-side migration the new build runs on older payloads - same commit.

A payload written by yesterday's run that today's build cannot read is a contract break and a release blocker.

## 12. Published-Site Verification (Browser Smoke)

Any change to the published site MUST be verified by the agent using integrated browser tools, not deferred to the human. The commands, and the traps that make this check lie, are in [`docs/how-to/run-the-gates.md`](docs/how-to/run-the-gates.md).

Minimum loop:

1. Confirm dev server up; start if not.
2. Navigate the affected page(s) plus one cross-page smoke (Listen and Console).
3. Read the page console; confirm zero new `[error]` events and zero new `404`.
4. Play a clip in the docked player and confirm the control flips to the playing state and the buffer fill advances - the one behaviour the whole site exists for.
5. Confirm reader-facing words, not ledger names: `vertical` reads as **Topic**, `lens` reads as **Tag**, and no `band_low` or `truncated` reaches the page.
6. Confirm the page still renders when its audio file is absent or empty - a row with no clip says "No audio yet" and a pruned day says "Audio cleared to make room"; a page that white-screens on missing audio is a failure.
7. If layout-sensitive: screenshot to confirm visual intent.
8. Only then mark done.

Does not apply to backend-only, tooling, docs, or schema-only changes.

## 13. Test Coverage Policy

Four tiers - **Unit / Contract / Integration / End-to-end**. Change without an appropriate-tier test in the same commit is a Definition-of-Done failure. No test touches the network and no test runs a real voice model; fixtures live in `tests/fixtures/`. Mock carve-outs require an explicit user request.

**A test's cost belongs to the code it checks, never to what the pipeline has piled up.** So a test does not walk a collection that a run appends to - the committed clips, the published days, the generation ledger, the retention record, or any collection added after this sentence was written (Rule #12). A per-item rule is driven from a bounded fixture, and a **built canary day under `tests/fixtures/`** is the one to reach for: it is fixed in size and it can carry a case the archive has never produced - a day of 731 items, a clip with no duration, a summary that voices to zero bytes. Where a question really is about the whole tree, it is asked once and asserted on the total rather than once per clip - and the producer has already validated every payload at write time, so re-checking a frozen day on every later run buys nothing.

**A test checks code functionality, not data hygiene, and it is driven with a built parameter rather than a loop.** A check that reads committed clips to ask whether the archive is well-formed is not a test, whatever file it sits in. It has three legal fates and no fourth: delete it where a fixture-driven test already covers the same rule; move it into the producer that writes the data; or make it an operator surface under `backend/utilities/`, which pytest does not run. A scheduled pytest job is not one of the three. Where the awkward shape is the point - a day on exactly the byte cap, a clip that failed for one of a dozen reasons - that shape is **built**, because a built one also carries the case the archive has never produced.

**A walk over committed data tends to carry a fuse, and that is the second reason to refuse one.** A test that counts how many committed clips still lack a new field and asserts the count is not zero is timed to go red on the day the last unmigrated clip ages out of retention - a date on the calendar rather than a change anybody made. A read-side migration is proved by removing the key from a fixture, which cannot age out.

Per tier:

- **Unit** - pure functions (text-to-duration estimation, byte estimation from a bitrate, sharding, the retention decision for one day, serialization round-trip).
- **Contract** - the generated schemas vs the readers and the writers, plus the drift gate.
- **Integration** - two or more stages composed against real fixtures, with the synth boundary driven by a committed sample clip where the model itself is not under test.
- **End-to-end** - the pipeline run start-to-finish on a fixture day, producing clips and a payload and a run manifest; and the published site rendered in a real browser against that output, with a clip actually played.

## 14. Agent Roster

Seven persona advisors live under `.github/agents/`, each at a distinct altitude:

| Agent                               | File               | Altitude                                                                      |
| ----------------------------------- | ------------------ | ----------------------------------------------------------------------------- |
| Reader                              | `reader.agent.md`  | the person the audio is for - is it worth their listen, is the language plain, does it work on a slow connection and a small screen? |
| Editor                              | `editor.agent.md`  | what gets voiced and at what length - read order, whether the whole summary is spoken or a lead, what to trade when a budget binds |
| Jony (UI/UX)                        | `jony.agent.md`    | the published surface: the Listen page, an item's row and the docked player, the Console, chart-vs-diagram |
| Susan (Craft & Delight)             | `susan.agent.md`   | whether a surface is good enough to ship - the player's craft, elevation and colour, empty and degraded states, the demand side of design review |
| Andre (AI / LLM)                    | `andre.agent.md`   | the voice-model pick on quality grounds, prompt and voice strategy, eval design, the injection surface where the day's text reaches a model |
| Fowler (Architecture & Engineering) | `fowler.agent.md`  | architecture + contracts + commits + tests                                    |
| Carmack (Engine & Runtime)          | `carmack.agent.md` | the voice runtime, the runner budget, real-time factor, output bytes against the 1 GB cap, cache and shard economics |

Rule: adding a new agent requires justifying a distinct altitude not already covered. Two agents at the same altitude collapse into one.

Where Reader and Editor both touch content: **Reader reports what listening to it was like, Editor rules what should have been voiced and at what length.** Reader does not propose; Editor does not speak for the reader's experience of the page.

Where Jony and Susan both touch the page: **Jony rules what survives on the page, Susan rules whether what survived is good enough to ship.** They are the two halves of one review and neither is sufficient alone. The player is the clearest case: Jony's one docked player over N inline ones is right, and Susan's ruling that it must be a raised, made-this-year surface rather than a flat strip is also right.

Where Andre and Carmack both touch the model: **Andre owns whether a voice is good enough, Carmack owns whether it fits.** A model that fails either test is not the pick - and because no model ships to the browser (owner ruling 3), "fits" is measured only against the runner: real-time factor under the 6 h cap and output bytes under the 1 GB cap.

### Design rationale

**Susan holds the demand mandate because a roster of pure vetoes converges on the minimum that passes every veto.** A system of removal-only reviewers shrinks a surface until nobody would choose to look at it, and every one of those cuts passes a review. Susan fails a page for being too little; that is the counterweight, and a veto that removes must name what the reader loses.

Giving Jony the demand mandate too was rejected: one head holding both "remove before adding" and "this is not enough" resolves to the veto every time. Making sufficiency advisory was rejected because an advisory check is the one skipped on the day it would have bitten.

## See also

- [`README.md`](README.md) - what yen-oli-kalari is.
- [`AGENTS.md`](AGENTS.md) - the pointer coding-agent tools start from.
- [`docs/agents/bootstrap.md`](docs/agents/bootstrap.md) - the load ritual every persona runs before answering.
- [`docs/agents/guardrails.md`](docs/agents/guardrails.md) - the rules-only digest of this contract.
- [`docs/how-to/run-the-gates.md`](docs/how-to/run-the-gates.md) - the environment and the commands behind sections 9 and 12.
- [`docs/reference/agent-notes.md`](docs/reference/agent-notes.md) - environment and tool quirks that make a command lie.
- [`docs/reference/documentation-structure.md`](docs/reference/documentation-structure.md) - where each kind of doc lives.
- [`docs/reference/benchmarks/2026-09-11-input-volume-and-audio-cost.md`](docs/reference/benchmarks/2026-09-11-input-volume-and-audio-cost.md) - the run that settled that storage is the binding constraint.
- [`docs/concepts/vision.md`](docs/concepts/vision.md) - what this project is and is not.
