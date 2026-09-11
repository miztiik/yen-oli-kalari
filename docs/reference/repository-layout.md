# Repository Layout

**Last Updated**: 2026-09-11

Every top-level directory, what it holds, who writes it, and whether a reader
ever sees it. Read this before adding a directory, or when deciding where a new
file belongs. The rule it enforces is
[documentation-structure.md](documentation-structure.md) routing rule 7: a
directory states its reason before it exists.

This project turns the yen-idhazh daily digest into audio. A CI job voices the
day's items, commits the clips, and a static site publishes two surfaces -
Listen and Console. The topology below follows from that: `backend/` is a
build-time producer that runs in CI and locally and never a service, `frontend/`
is a static bundle, and `state/` is the operator ledger a run leaves for the
next ([../concepts/pipeline-loop.md](../concepts/pipeline-loop.md),
[../../CLAUDE.md](../../CLAUDE.md) Rule #1 and Rule #2).

## The skeleton today

The repo is a skeleton. Most directories exist but are empty, and the
`Status` column below says which. **This checkout is not yet a git repository**
(see [agent-notes.md](agent-notes.md)), so nothing is literally tracked yet: the
`Committed` column states the policy the `.gitignore` and `.gitattributes`
already encode for when it becomes one, not a fact about the working tree today.

## The committed map

| Path | Holds | Written by | Committed | Status |
| --- | --- | --- | --- | --- |
| `.claude/skills/` | Skill wrappers that point the Claude harness at `docs/agents/` (`bootstrap/`, `prepare-plan/`) | a person | committed | created - 2 `SKILL.md` files |
| `.github/agents/` | The seven persona advisor files (andre, carmack, editor, fowler, jony, reader, susan) | a person | committed | created - 7 files |
| `.github/scripts/` | A shell step two or more workflow jobs share | a person | committed | empty - planned |
| `.github/workflows/` | The CI jobs: voice synthesis, publish, prune | a person | committed | empty - no workflow yet |
| `backend/utilities/` | Standalone measurement scripts (`measure_input.py`, `price_audio.py`) | a person | committed | created - 2 scripts |
| `backend/oli/contracts/` | A Pydantic model for every persisted shape, before logic reads or writes it (Rule #3) | a person | committed | empty - planned |
| `backend/oli/voices/` | The synthesis producer: read the day, voice each item, record what failed | a person | committed | empty - planned |
| `config/` | Schema-validated tunable knobs: the caps, the codec, the prune window, voice and model refs (Rule #6) | a person | committed | empty - planned |
| `docs/` | The canonical knowledge and the agent memory | a person | committed | created |
| `frontend/` | The published static site - Listen and Console - and committed payloads under `public/` | a person, and the pipeline under `public/` | committed; build output gitignored | empty - planned |
| `schemas/` | One generated JSON Schema per contract, exported from `backend/oli/contracts/` | a generator | committed | empty - planned |
| `state/` | Append-only ledgers a run leaves for the next: what was voiced, what failed, what the prune cycle took | the pipeline, in CI | committed | empty - planned |
| `tests/` | Cross-cutting fixtures and suites | a person | committed | empty - planned |
| `TODO/` | Active plan-docs. Working material, never authoritative | a person | committed | created - 1 plan-doc |
| `.editorconfig`, `.gitattributes`, `.gitignore` | Root policy files: encoding, end-of-line, and the ignore rules | a person | committed | created |

## The uncommitted map

These paths do not exist yet. The `.gitignore` names each one so that when a run
or an install creates it, git leaves it out. Deleting any of them would cost a
re-download or a rebuild and nothing else.

| Path | Why it is not committed | Written by |
| --- | --- | --- |
| `backend/models/` | Voice and text-to-speech weights, multi-GB, against GitHub's 100 MB per-file ceiling. Downloaded, not authored | a run, or a developer |
| `backend/bin/` | Third-party binaries (~45 MB). Platform-specific, downloaded, not authored | a run, or a developer |
| `backend/var/` | Run intermediates, caches and benchmark JSON. The committed record of a run is the digest under `frontend/public/` plus the `state/` rows, never the workings | a run |
| `frontend/build/`, `frontend/dist/`, `frontend/.svelte-kit/` | The built bundle. Pages rebuilds it from source on every deploy | a build |
| `frontend/static/digest/` and its siblings | Copies staged from the pipeline's own output at build time. A copy is not a source | a build step |
| `node_modules/`, `.venv/`, `.ruff_cache/`, `.mypy_cache/`, `.pytest_cache/` | Installed dependencies and tool caches | a package manager, or a tool |

The `.gitignore` and `.gitattributes` are inherited from the sibling project and
name some paths this skeleton has not created (for example `corpus/` and
`frontend/public/assist/`). A path is listed above only where its rule is one
this project will use; an inherited rule for a directory that never lands is not
a directory.

## Empty today, and what lands in each

Nine directories exist but hold no file: `.github/scripts/`,
`.github/workflows/`, `backend/oli/contracts/`, `backend/oli/voices/`, `config/`,
`frontend/`, `schemas/`, `state/`, and `tests/`. Each is a placeholder for the
first real file of the row that names it in the committed map above. The
discipline is [documentation-structure.md](documentation-structure.md) routing
rule 7 and [../../CLAUDE.md](../../CLAUDE.md) section 10: a directory earns its
place when real code is about to land in it, and an empty module kept "for
later" is an anti-pattern. These are listed so the next contributor adds a file
to the right one rather than inventing a tenth.

## See also

- [documentation-structure.md](documentation-structure.md) - where a document belongs, as this page is where a directory belongs.
- [measurements.md](measurements.md) - the figures that size the caps these directories are shaped around.
- [../how-to/run-the-gates.md](../how-to/run-the-gates.md) - which of these paths a local check touches today, and which wait on CI.
- [../concepts/pipeline-loop.md](../concepts/pipeline-loop.md) - what one run leaves under `state/` and `frontend/public/`, and why nothing under `state/` is served.
- [../../CLAUDE.md](../../CLAUDE.md) - section 3 (topology), Rule #1 (static-first), Rule #2 (the runner is the architecture).
