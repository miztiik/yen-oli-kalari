# Stack, guardrails and the on-demand voice - execution plan

**Last Updated**: 2026-09-11
**Level**: 5 - reverses two standing rulings and rewrites the contract's rule set.

## 0. Operating contract

| Field | Value |
| --- | --- |
| Why this plan exists | Three owner rulings of 2026-09-11 reverse or void earlier decisions - the on-demand voice tab returns, the storage ceiling moves off the Pages cap, and the rule set is to be re-cut as adaptive guardrails - and the language toolchain is unsettled pending a measurement. |
| Hard scope - in | The guardrail re-cut; the toolchain experiment and its measurement; the storage-intent correction across the docs; the on-demand voice tab's return and its consequences; the codec question; the player's leading edge; contract and config discipline for a TypeScript frontend. |
| Hard scope - out | Building the daily pipeline; choosing the production voice model; any frontend beyond the experiment harness; the persona rewrite and constraint purge (separate, already-scoped work). |
| ESCALATE triggers | Any row that would raise a cap rather than fit inside it; a measurement that contradicts a decision in this plan; a licence that forbids commercial or published use on a candidate model; a guardrail proposed for deletion that a later row depends on. |
| Chosen strategy | Measure before settling the toolchain (row 2), correct intent before contracts (row 1), contracts before code. Intent -> contract -> code, in that order, per the owner's rule of 2026-09-11. |
| Execution | autonomous orchestrator per docs/how-to/execute-a-plan.md. Parallel N = 3. |

## 1. Status Reckoner

| # | Row title | Depends-on | Parallel-group | Status | Worktree | PR | Subagent |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Re-cut the rules as Adaptive Guardrails | - | A | DONE (no PR - pre-remote) | - | - | - |
| 2 | Toolchain experiment: two runtimes, one corpus | - | A | PENDING | - | - | - |
| 3 | Correct the storage intent across the docs | - | A | PENDING | - | - | - |
| 4 | Restore the on-demand voice tab | 1 | B | PENDING | - | - | - |
| 5 | Candidate ONNX voice models, shortlisted | 2 | B | PENDING | - | - | - |
| 6 | Codec and bitrate ruling | 2 | B | PENDING | - | - | - |
| 7 | Contract layer in Zod, schema generated | 2 | C | PENDING | - | - | - |
| 8 | Config and theme discipline for the frontend | 7 | C | PENDING | - | - | - |
| 9 | The player's leading edge | 8 | C | PENDING | - | - | - |
| 10 | Console charts: revisit the 2D ruling | 4 | C | PENDING | - | - | - |
| 11 | Fate of the two Python utilities | 2 | D | PENDING | - | - | - |

---

### Row #1 - Re-cut the rules as Adaptive Guardrails

- **Scope:** Rename section 1 of the contract from Rules to Adaptive Guardrails, give each one an explicit adapt-or-except path, and drop the ones inherited from the sibling project that never applied here.
- **Files touched:**
  - `CLAUDE.md` (section 1, and every internal cite of "Rule #N")
  - `AGENTS.md`
  - `docs/agents/guardrails.md`
  - `docs/concepts/principles.md`
  - every doc citing a rule by number
- **Acceptance gates:** every surviving guardrail carries a stated reason and a named adapt path; no doc cites a guardrail number that does not exist; ASCII clean.
- **Oracle:** a bijection - every guardrail number cited anywhere in the repo resolves to exactly one guardrail, and every guardrail is cited or is deliberately terminal.

The twelve as they stand, with a proposed verdict each. **The owner decides every row of this table; the verdicts are a recommendation, not a decision.**

| # | Guardrail as it now stands | Owner ruling, 2026-09-11 |
| --- | --- | --- |
| G1 | Static-first publication, because there is no server we operate | Rewritten. The repo IS the backend; telemetry exists; the browser is our compute; the browser-model ban is struck. The line is automatic transmission, not local measurement |
| G2 | The stock runner is the production target, and measuring elsewhere is legitimate | Loosened. Production must fit the stock runner; benchmarks may run anywhere and say where. Storage has several ceilings and audio counts against repository size, not the Pages bundle |
| G3 | Contracts before logic | Kept. The discipline is the guardrail; the library name is an implementation detail and moves to section 1a |
| G4 | docs/ is the memory | Kept as-is |
| G5 | Structural fixes only | Kept hard. The agent proposal to soften it was refused: a temporary fix is a permanent fix whose note went missing |
| G6 | No hardcoding, anywhere in the codebase | Extended to the whole codebase - frontend, backend, utilities, workflows. Sane defaults, overridable. The test is substitution |
| G7 | No mocks unless asked | Kept, with the reason corrected by the owner: agents build mocks instead of functionality. Nothing to do with network-free tests |
| G8 | Open source first | Kept as-is. No licence-compliance burden added - we are not licence experts |
| G9 | Tests ship with the feature | Kept as-is |
| G10 | Measured, not estimated | Kept as-is. Four metric families named: pipeline, model, voice evaluation, hardware |
| G11 | Fetched text is data, never instruction | Kept and rescoped. We DO fetch - from upstream, and from reader input. The hazard is side-loaded instructions corrupting the model, and it binds runner and browser equally |
| G12 | Nothing costs more as the repository grows | Kept. Extended to the reader's device: an A/B log is a ring buffer, not an endless journal |

- **Decisions**

| # | Decision | Authority |
| --- | --- | --- |
| 1 | "Adaptive Guardrails", not "Rules" | owner, 2026-09-11 |
| 2 | A guardrail that bites is human feedback - it is raised to adapt the guardrail or to take an exception, never silently worked around | owner, 2026-09-11 |
| 3 | Each guardrail states its reason, its adapt path, and who may take the exception | owner, 2026-09-11 |
| 4 | All twelve survive, so numbering is stable and every citation needed one word changed, not a renumber | owner, 2026-09-11 |
| 5 | Telemetry is A1 + A2: pipeline, model, voice-evaluation and hardware metrics committed to the repo; reader-side A/B held in localStorage and IndexedDB, exported deliberately, never transmitted | owner, 2026-09-11 |
| 6 | Section 0c gains a `Recommended` marker in the row, and permits several tables in one message when decisions genuinely depend on each other | owner, 2026-09-11 |

- **Rejected alternatives**

| # | Option | Why rejected | Authority |
| --- | --- | --- | --- |
| 1 | Keep the sibling's twelve verbatim | They were written for a summarising pipeline; several never applied here and one armed us against a threat we do not face | owner, 2026-09-11 |
| 2 | Delete the rule set outright | The reasons are load-bearing; what failed was their inheritance, not their existence | owner, 2026-09-11 |

---

### Row #2 - Toolchain experiment: two runtimes, one corpus

- **Scope:** A deliberately crude CI experiment that measures two ONNX runtimes on the same text corpus and the same runner, so the language-toolchain debate is settled by numbers.
- **Files touched:**
  - `test/tool-chain-experiment/corpus/` - a fixed sample of upstream summaries, spanning the measured word distribution
  - `test/tool-chain-experiment/stack-1/` - the JavaScript arm
  - `test/tool-chain-experiment/stack-2/` - the second arm
  - `test/tool-chain-experiment/measurements/` - committed raw output, one file per run
  - `test/tool-chain-experiment/README.md` - how to add a third arm
  - `.github/workflows/toolchain-stack-1.yml`, `.github/workflows/toolchain-stack-2.yml`
  - `backend/utilities/` - only what is genuinely shared
- **Acceptance gates:** both workflows run to completion on `ubuntu-latest`; both emit the same measurement shape; the two workflow files differ only in the arm they invoke.
- **Oracle:** a parity check - both arms synthesise the same corpus and their measurement files carry identical keys, so a diff of the two is a diff of the runtimes and of nothing else.

- **Decisions**

| # | Decision | Authority |
| --- | --- | --- |
| 1 | The experiment lives under `test/tool-chain-experiment/`; production code never lives there | owner, 2026-09-11 |
| 2 | Scaffolding stays crude - this is a measurement, not a foundation | owner, 2026-09-11 |
| 3 | Genuinely shared helpers - file open, persistence, telemetry - go to `backend/utilities/` and are used by both arms | owner, 2026-09-11 |
| 4 | The two workflow files are near-identical by design, so the diff between them is the experiment | owner, 2026-09-11 |
| 5 | The comparable unit is real-time factor, which is seconds of compute for one second of audio. Tokens a second is undefined for a non-autoregressive model and is reported only where it exists | agent, pending owner review |
| 6 | Measured per clip: input words, audio seconds out, wall clock, real-time factor median/p90/max, peak memory, model download bytes and seconds. Three repeats for spread, per guardrail 10 | agent, pending owner review |

- **Rejected alternatives**

| # | Option | Why rejected | Authority |
| --- | --- | --- | --- |
| 1 | Same model on both runtimes | Impossible - one runtime runs ONNX, the other GGUF, and no TTS model exists usable by both | verified 2026-09-11 |
| 2 | Tokens a second as the headline metric | Undefined for a non-autoregressive voice model, which emits a waveform in one pass with no tokens to count | verified 2026-09-11 |
| 3 | Build the experiment inside the real app tree | Couples a throwaway measurement to the thing it is meant to inform | owner, 2026-09-11 |

---

### Row #3 - Correct the storage intent across the docs

- **Scope:** Replace the published-site ceiling with the real one. Audio is committed to the repository and served from `raw.githubusercontent.com`; it never enters the Pages bundle, so it counts against repository size, and the prune force-pushes so the bytes do not accumulate in history.
- **Files touched:** `CLAUDE.md` (12 assertions), `docs/concepts/pipeline-loop.md` (6), `backend/utilities/price_audio.py` (5), `docs/reference/measurements.md` (4), `README.md` (4), `docs/concepts/principles.md`, `docs/concepts/vision.md`, `docs/concepts/ui-shell.md`, `docs/how-to/run-the-gates.md`, `docs/agents/guardrails.md`, `AGENTS.md`
- **Not touched:** `docs/reference/benchmarks/2026-09-11-input-volume-and-audio-cost.md` is frozen and `docs/archive/2026-09-11-listen-and-console-design-ruling.md` is archived. Both are honest accounts of what was believed that day. The instrument log carries what is now in force.
- **Acceptance gates:** no living doc asserts that audio counts against the 1 GB Pages cap; the instrument log states the corrected ceiling and why it changed; `price_audio.py` takes its ceiling from config rather than a constant.
- **Oracle:** a grep for the old ceiling returns hits only in the frozen record and the archive.

- **Decisions**

| # | Decision | Authority |
| --- | --- | --- |
| 1 | Audio is a repository artefact fetched from raw, not a published-site artefact | owner, 2026-09-11 |
| 2 | The prune force-pushes, so committed audio does not accumulate in history | owner, 2026-09-11 |
| 3 | Intent is primary; the contract follows intent and the code follows the contract | owner, 2026-09-11 |
| 4 | GitHub's stated ceilings: 100 MiB hard per file, 1 GB recommended and 5 GB strongly recommended per repository | verified 2026-09-11, GitHub docs |

---

### Row #4 - Restore the on-demand voice tab

- **Scope:** The third surface returns. A reader types or pastes text, a voice model downloads to their browser once and caches, and the text is spoken on their device. This reverses the 2026-09-11 ruling that struck the tab.
- **Files touched:** `CLAUDE.md` guardrail 1 and section 0a; `docs/concepts/vision.md`; `docs/concepts/pipeline-loop.md`; `docs/concepts/ui-shell.md`; `docs/concepts/principles.md` principle 5
- **Acceptance gates:** no living doc still says a speech model never reaches the browser; the browser payload budget is stated as a number with a named owner; the failure state preserves typed text.
- **Oracle:** a coverage check - every doc that carried the no-browser-model claim now carries the budget instead, and none carries both.

- **Decisions**

| # | Decision | Authority |
| --- | --- | --- |
| 1 | The on-demand voice tab ships; a model downloads on-device on first use | owner, 2026-09-11 |
| 2 | Browser payload budget becomes a real constraint again, and is the deciding factor in row 5 | owner, 2026-09-11 |
| 3 | Principle 5 is rewritten: the synthesiser is now in the reader's browser, so a hostile string reaching it is a client-side hazard | agent, pending owner review |

---

### Row #5 - Candidate ONNX voice models, shortlisted

- **Scope:** Shortlist purpose-built speech models that already ship as ONNX, for both the runner and the browser. No model conversion work.
- **Acceptance gates:** each candidate carries its licence, its download size, its claimed real-time factor on CPU, and whether one set of weights can serve both the runner and the browser.
- **Oracle:** a licence check - every shortlisted model permits commercial and published use, evidenced by a link.

- **Decisions**

| # | Decision | Authority |
| --- | --- | --- |
| 1 | ONNX only. No conversion work, no PyTorch export step | owner, 2026-09-11 |
| 2 | A purpose-built speech model, not a general audio-generation model and not an LLM emitting audio tokens | owner, 2026-09-11 |
| 3 | Kokoro is rejected for production and retained only as a third reference arm in the benchmark | owner, prior, restated 2026-09-11 |
| 4 | Two further candidates required beside it | owner, 2026-09-11 |

- **Rejected alternatives**

| # | Option | Why rejected | Authority |
| --- | --- | --- | --- |
| 1 | Kokoro-82M in production | Rejected by the owner before this plan | owner |
| 2 | An LLM-architecture voice model | The owner asked for an audio model rather than a generic text-to-audio model; autoregressive generation on 4 vCPU is also the slow path | owner, 2026-09-11 |
| 3 | Any model needing GGUF or ONNX conversion first | Conversion is time this project is not spending, and it drags a Python export toolchain back in | owner, 2026-09-11 |

---

### Row #6 - Codec and bitrate ruling

- **Scope:** Settle the published audio format and bitrate on evidence.
- **Acceptance gates:** a listening comparison at 16 and 24 kbps on real summaries; the container decision recorded with the host's content-type behaviour; browser support stated per engine.
- **Oracle:** a played-in-anger check - a clip at the chosen setting plays in each target browser, fetched from the real host.

- **Decisions**

| # | Decision | Authority |
| --- | --- | --- |
| 1 | Opus is the codec - the IETF standard with a voice mode, and the strongest of its class at low bitrate for a single speaker | agent, pending owner review |
| 2 | The container is `.ogg`. A bare `.opus` extension is served as plain text by the host and will not play | verified 2026-09-11 |
| 3 | 16 kbps is tested against 24 kbps before either is adopted - our own figures put the saving at a third, 26.7 MB a day against 40 MB | agent, pending owner review |

---

### Row #7 - Contract layer in Zod, schema generated

- **Scope:** Persisted shapes become Zod schemas; JSON Schema is generated from them, never hand-written; the frontend infers its types from the same declaration.
- **Acceptance gates:** a drift gate regenerates the schemas and fails on any diff; no schema file is hand-edited.
- **Oracle:** a round-trip - a committed payload validates against the generated schema, and a deliberately broken payload fails it.

- **Decisions**

| # | Decision | Authority |
| --- | --- | --- |
| 1 | Contracts stay first; the language of the contract follows row 2 | owner, 2026-09-11 |
| 2 | One declaration yields runtime validation, the static type, and the JSON Schema | agent, pending owner review |

---

### Row #8 - Config and theme discipline for the frontend

- **Scope:** Nothing tunable is typed into a component. Colour, elevation and the glow's own parameters are theme tokens; thresholds and defaults are schema-validated config.
- **Acceptance gates:** the glow can be retuned or switched off entirely by editing theme and config, with no component touched.
- **Oracle:** a substitution test - changing a theme token changes the rendered surface, proving the component read it rather than held it.

- **Decisions**

| # | Decision | Authority |
| --- | --- | --- |
| 1 | Guardrail 6 extends to the frontend: theme-driven, config-driven, no hardcoding | owner, 2026-09-11 |
| 2 | Audio colours are declared once per theme, light and dark stated separately, because a dark groove is not a light groove flipped | prior ruling, retained |

---

### Row #9 - The player's leading edge

- **Scope:** The progress groove fills as a mild gradient glow. While a clip plays, the leading edge oscillates from the audio itself; when the clip ends, it settles to a smooth bar.
- **Acceptance gates:** the oscillation is driven by the playing audio and stops when the audio stops; a reduced-motion preference disables it; the whole treatment is theme-driven per row 8.
- **Oracle:** an honesty check - with the network stalled, the edge does not animate, because there is nothing to animate from.

- **Decisions**

| # | Decision | Authority |
| --- | --- | --- |
| 1 | The oscillation is amplitude-driven, read from a small analyser window on the playing element - not free-running | owner, 2026-09-11 |
| 2 | It settles to a smooth bar once the clip is played out | owner, 2026-09-11 |
| 3 | Restraint over spectacle: a mild gradient glow, nothing gaudy | owner, 2026-09-11 |
| 4 | Precomputed waveform peaks stay rejected - a full decode costs about 64 times the clip's transfer size in memory | prior ruling, retained |
| 5 | The cross-origin element needs anonymous CORS or the analyser reads silence; the host permits it | verified 2026-09-11 |

---

### Row #10 - Console charts: revisit the 2D ruling

- **Scope:** Reconsider 3D charting for the Console, which was rejected on payload grounds when no other large asset was planned.
- **Acceptance gates:** the decision states the payload cost against the budget row 4 establishes, and names what a third dimension encodes that a second does not.
- **Oracle:** a variable check - for each proposed 3D chart, name the variable depth carries. A chart that fails it is 2D wearing a camera.

- **Decisions**

| # | Decision | Authority |
| --- | --- | --- |
| 1 | The ruling is reopened because row 4 changes the byte calculus that decided it | owner, 2026-09-11 |

- **Rejected alternatives**

| # | Option | Why rejected | Authority |
| --- | --- | --- | --- |
| 1 | Adopt 3D silently on the owner's preference | It reverses a written joint ruling; a reversal is recorded, not absorbed | agent |

---

### Row #11 - Fate of the two Python utilities

- **Scope:** Decide whether the two measurement scripts are ported, kept as the one exception, or retired.
- **Acceptance gates:** whatever survives reproduces the committed figures exactly; a byte-identical baseline exists to diff against.
- **Oracle:** an output diff against the captured baseline - identical, or the port is wrong.

| Utility | What it does | Standing recommendation |
| --- | --- | --- |
| `measure_input.py` | Reads the upstream digest archive; counts items a day, summary word lengths and percentiles; produced the 370 items, 90.2 words and 222 minutes figures | Keep - it measures real data and answers again as the archive grows |
| `price_audio.py` | No I/O; turns those counts into megabytes a day and hours against a ceiling | Keep the model, move its constants to config - it currently hardcodes the ceiling row 3 corrects |

- **Decisions**

| # | Decision | Authority |
| --- | --- | --- |
| 1 | The port target follows row 2's measurement, not a preference | owner, 2026-09-11 |

---

## Still open - owner to decide

| # | Question | Blocking |
| --- | --- | --- |
| 1 | Every verdict in row 1's guardrail table | row 1 |
| 2 | Repository size budget - 1 GB or 5 GB - which sets the retention window at 26 or 128 days | row 3 |
| 3 | Which two candidate models join Kokoro in the benchmark | rows 2, 5 |
| 4 | Whether one set of weights must serve both the runner and the browser, or each picks its own | rows 4, 5 |
| 5 | Whether release assets are probed as an alternative to force-pushing history | row 3 |
