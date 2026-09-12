# Run the Gates

**Last Updated**: 2026-09-12

What to run locally and what to leave to CI, before a merge. This page owns the
project's actual gate commands; the neutral PR lifecycle that calls for them is
[ship-a-pr.md](ship-a-pr.md).

**Read this first: almost nothing is built yet.** yen-oli-kalari is a skeleton.
There is no test suite, no linter or type-checker config, no CI workflow, and
this checkout is not even a git repository
([../reference/agent-notes.md](../reference/agent-notes.md)). So the honest gate
list today is short: two utility scripts run, and everything else is named below
as "not built yet" with what will build it. Do not run a command this page does
not list - an invented gate that fails wastes the time this page exists to save.

## What you can run today

### 1. Check the environment

The two scripts need Python 3.14 on PATH. `ruff` and `mypy` are present only as
`python -m ruff` and `python -m mypy`, and `pytest` is on PATH; the traps are in
[../reference/agent-notes.md](../reference/agent-notes.md).

```powershell
python --version
```

- **Validation:** prints `Python 3.14.2` or newer.
- **Failure mode:** `python` not recognized means it is off PATH; there is no venv to activate because no `pyproject.toml` exists yet.

### 2. Price the audio (no inputs)

This is the storage-and-compute model behind the one benchmark record. It has
the measured inputs baked in and takes no arguments.

```powershell
python backend/utilities/calculate_audio_budget.py
```

- **Validation:** prints the megabytes-a-day and days-until-cap tables. Every-item audio at opus@24k reads 40.0 MB a day and 26 days to fill the 1 GB Pages cap, matching [../reference/measurements.md](../reference/measurements.md).
- **Failure mode:** a Python error means the interpreter is wrong; the script itself has no external dependency.

### 3. Census the input (one input: a yen-idhazh checkout)

This counts items a day and summary length over yen-idhazh's committed digests,
so the audio design is priced against a measured number
([../../CLAUDE.md](../../CLAUDE.md) Guardrail #10).

```powershell
python backend/utilities/measure_input.py <path-to-yen-idhazh-checkout>
```

- **Input:** a local yen-idhazh checkout that holds committed days under `frontend/public/digest/*/*/*/digest.json`.
- **Validation:** prints `DAYS=`, `ITEMS=`, `SUMMARY_WORDS=` and the per-day spread.
- **Failure mode:** `no digest files found under <root>/...` means the path is wrong or that checkout has no committed digests. Run with no argument and it looks under `.`, which in this repo finds nothing.

### 4. Lint and type-check the scripts (advisory, not a gate)

```powershell
python -m ruff check backend/
python -m mypy backend/
```

- **Validation:** both pass over the two utility scripts.
- **Failure mode / caveat:** there is no `pyproject.toml`, so these run on tool defaults, not a project rule. Treat the result as advice, not a gate, until config lands (see below).

### 5. Tests

```powershell
python -m pytest
```

- **Validation today:** `5 passed`. The suite is [`tests/test_documentation_map.py`](../../tests/test_documentation_map.py), which checks that every page under `docs/` is reachable from [`docs/reference/documentation-map.md`](../reference/documentation-map.md), that every link in the map resolves, that every page carries a `**Last Updated**` stamp, and that no retired name survives as a live reference.
- **Failure mode:** `pages are not listed in the documentation map` means a new page was added without putting it on the map - add the row rather than deleting the check. `references 'x' without naming 'y'` means a rename missed a reference.

## Gates not built yet

Each row is a real gate this project will carry. None runs today. The middle
column names what has to land first; the right column is why it is not a command
you can type now.

| Gate | Built by | Why it cannot run yet |
| --- | --- | --- |
| Backend lint + types | a `pyproject.toml` configuring ruff and mypy | no config exists, so there is no project rule to enforce |
| Backend tests | a `pytest` suite over the pipeline code | the pipeline does not exist yet; the documentation-map suite runs today |
| Contract drift | the exporter that writes `schemas/` from the contracts package, then `git diff --exit-code` | the contracts package and `schemas/` are both empty, so there is nothing to export yet; git itself works, so the diff step will run once an exporter exists |
| Frontend build | `frontend/package.json` and the Svelte site | `frontend/` is empty; there is no `package.json`, so `npm run build` has nothing to build |
| Browser suite | a Playwright suite over Listen and Console | the frontend does not exist yet; per [../../CLAUDE.md](../../CLAUDE.md) section 12 a published-site change is verified in a real browser once there is a page |
| Site-weight cap | a check that the published site plus its audio stays under the 1 GB Pages cap | there is no published tree to weigh; the cap is held by the prune cycle in the Action ([../reference/measurements.md](../reference/measurements.md)) |
| CI workflow | `.github/workflows/*.yml` | `.github/workflows/` is empty; there is no job to dispatch |

## What is deliberately left to CI

By [../../CLAUDE.md](../../CLAUDE.md) Guardrail #2 the runner is the architecture, so
some work never runs on a developer machine even once the gates exist. The voice
synthesis job, the publish, and the prune cycle that holds the 1 GB cap run in
CI on `ubuntu-latest` against its 6 h job cap
([../concepts/pipeline-loop.md](../concepts/pipeline-loop.md)). A real-time
factor and a per-clip byte cost are runner readings, and no model has run on the
runner yet, so those figures are what-ifs until CI takes them
([../reference/measurements.md](../reference/measurements.md)). Locally you run
the fast checks above; CI runs the whole loop and enforces the caps. None of
this is wired yet - it is the shape the CI workflow will take.

## Project bindings

The only project-specific gate commands that run today:

```powershell
# the audio price model, inputs baked in
python backend/utilities/calculate_audio_budget.py

# the input census, one argument: a yen-idhazh checkout
python backend/utilities/measure_input.py <path-to-yen-idhazh-checkout>
```

Everything else a mature gate page would bind here - the changed-test selector,
the build command, the browser smoke, the schema export - is **not built yet**.
Each is named in "Gates not built yet" above with what will build it. Update
this section when the first one lands.

## See also

- [ship-a-pr.md](ship-a-pr.md) - the neutral PR lifecycle that calls these gates.
- [ship-to-github-pages.md](ship-to-github-pages.md) - the deploy these gates guard.
- [../reference/agent-notes.md](../reference/agent-notes.md) - the shell and tool traps that make a check lie about its result.
- [../reference/measurements.md](../reference/measurements.md) - the caps the site-weight and compute gates will enforce.
- [../reference/repository-layout.md](../reference/repository-layout.md) - which directory each planned gate reads and writes.
- [../concepts/pipeline-loop.md](../concepts/pipeline-loop.md) - why synthesis and the prune cycle are CI work, not local work.
- [../../CLAUDE.md](../../CLAUDE.md) - Guardrail #2 (the runner is the architecture), section 9 (Definition of Done), section 12 (published-site verification).
