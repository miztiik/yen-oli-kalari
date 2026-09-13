# Agent Notes

**Last Updated**: 2026-09-14

Environment and tool traps that make a command lie about its result. Each entry
names the false result, its cause, and the command that gets the true answer.

**An entry is a pattern, not an incident report.** The trap and the tell that
separates it from the thing it looks like are what a later reader needs; the run
that happened to reveal it, the machine it was seen on and the path it was seen
under are not. A note written as evidence goes stale the moment any of those
change, and then it is a doc that lies.

This page exists so execution craft has a home inside `docs/`. A lesson kept
only in an agent's private note store is invisible to the next person and the
next agent ([../../CLAUDE.md](../../CLAUDE.md) Guardrail #4). A private store is a
cache of this page, never the only copy.

**This is not a place for project knowledge.** A rule about how the pipeline
behaves, what a payload carries, or why a design was chosen belongs in the living
doc that owns it ([documentation-structure.md](documentation-structure.md)). If
an entry starts explaining the product, it has been filed wrong.

This is **one page**. Routing rule 8 in the structure doc splits it into
`agent-notes/<tool-family>.md` children only when it stops being readable as one
page; it has five entries and is nowhere near that, so it stays whole.

## git

**History starts at the seed commit, so it is not where a design question is
answered.** The repository was initialised in place rather than carrying the
history of the work that preceded it, so `git log`, `git status`, `git rev-parse`
and a `git diff --exit-code` drift gate all behave normally, and the bootstrap
step `git log --oneline -20` runs - but a question about why something was
decided is answered by the living doc that owns it and by the archived rulings,
never by walking the log back.

## A working path is part of the environment

**A working copy under a file-sync folder and a working copy under a path with
spaces each break a different thing, and neither announces itself.**

A sync client and `.git` contend for the same files: sync can take a loose
object or a packfile mid-write, a repack meets a file lock, and a sync conflict
lands as a second copy that git then reports as untracked. An on-demand
placeholder reads to git as an empty file. None of these fail loudly - they
surface as a repository that is intermittently strange.

A space in the path is the quieter one: an unquoted argument splits on the first
space, and a `file://` URL needs every space encoded. Quote every path argument
as a habit rather than deciding case by case, and build a file URL rather than
assembling one by hand:

```powershell
([Uri]((Resolve-Path .).Path)).AbsoluteUri
```

## A native library resolves the real path, and a long one breaks it

**A dependency that opens a file through a native call can fail on path length
alone, and the error names the wrong cause.** The tell is an error reporting a
missing file that is on disk and that every other tool can read:

```
Error: Load model from <path> failed: ... File doesn't exist
```

Two things make this hard to recognise. The length is mostly spent before the
checkout contributes anything - a vendored cache under
`node_modules/<pkg>/node_modules/<pkg>/.cache/<org>/<repo>/...` runs to a
hundred characters on its own - so it is the depth of the working copy that
tips it over, not a long filename anyone chose. And **a junction or a symlink
does not help**, because the real path is resolved before the native call.

The fix is a shorter real path, not a shorter name: mirror the tree somewhere
shallow, install and run there, and copy the generated output back. Seed any
large cache directory from the original copy first, so a big download is not
paid twice. A CI runner's workspace path is short, so this never fires there -
which is what makes it a local-only trap worth writing down.

## PowerShell

This shell is PowerShell 7.6.6 (Core). Two traps confirmed here:

**`&&` is not a general command separator, and the parse error names the wrong
line.** `&&` joins native commands and cmdlets, but a `foreach` statement or a
bare assignment (`$x = 5`) as its right-hand side is a parse error -
`Unexpected token '=' in expression or statement` for the assignment. Because
PowerShell parses the whole submission first, that error aborts the entire
multi-line command, so an earlier good line reads as though it failed. `if`
after `&&` does parse. Use `;` before an assignment or a `foreach`. There is no
heredoc; use a here-string (`@'` ... `'@`) or write a `.ps1`.

**`Get-Content` returns lines, not the file.** `Get-Content <file>` returns an
`Object[]` - one element per line - so a two-line file reads as two items and a
byte-for-byte read or hash silently works on the wrong shape. `-Raw` returns the
whole file as one `String`. This is the split from Unix `cat`, which streams the
bytes. `Set-Content` and `Out-File` write UTF-8 with **no** BOM here, so a
BOM-stripping `-Encoding` workaround solves a problem this shell does not have -
check what is actually written before adding one.

## Python and the tools

**`ruff` and `mypy` read as missing, and are not - they only run as a module.**
Typing `ruff` or `mypy` gives `The term 'ruff' is not recognized`, which reads
as "not installed" when both are installed as modules. Invoke them as
`python -m ruff` and `python -m mypy`. Reach for the module form before
concluding a tool is absent, for any tool.

Versions carry the date they were read (Guardrail #10), because a version is the
one figure an entry like this genuinely depends on:

| Tool | Bare command | Module form | Version (2026-09-11) |
| --- | --- | --- | --- |
| Python | `python` | - | 3.14.2 (a `py` launcher answers 3.14.0) |
| pytest | on PATH | `python -m pytest` | 9.0.2 |
| ruff | **not on PATH** | `python -m ruff` | 0.14.13 |
| mypy | **not on PATH** | `python -m mypy` | 1.19.1 |
| node / npm | on PATH | - | node 24.12.0 |
| gh | on PATH | - | 2.90.0 |
| git | on PATH | - | 2.55.0 |

Which of these is a gate, and which runs on tool defaults because the project
configures nothing for it, is owned by
[../how-to/run-the-gates.md](../how-to/run-the-gates.md) rather than restated
here - that list changes as the project builds, and a second copy of it would
drift.

## Adding an entry

Write it under the heading for the command you are about to type, in this shape:
a bold lead naming the false result ("reads as X, is actually Y"), one or two
sentences of cause, then the command that gets the true answer. Keep the tell -
the check that separates the trap from the thing it looks like - because an entry
with a fix and no tell fires confidently on the wrong diagnosis.

**Write the pattern, not the post mortem.** The run that revealed the trap, the
machine it was seen on, the path it was seen under and the byte counts it
produced are evidence, and evidence belongs in the pull request that found it.
An entry that carries them ages into a doc that lies, because it is asserting a
state of the world nobody is keeping true. A figure that survives here is one
the trap itself depends on - a version, a limit, a threshold - and it carries
its date ([../../CLAUDE.md](../../CLAUDE.md) Guardrail #10). An entry whose trap
can no longer fire is deleted, not archived.

## See also

- [../how-to/run-the-gates.md](../how-to/run-the-gates.md) - the checks these traps interfere with, and the state of each gate.
- [documentation-structure.md](documentation-structure.md) - routing rule 8, which sends a tool quirk here rather than into private memory.
- [repository-layout.md](repository-layout.md) - the directory map these commands run against.
- [../../CLAUDE.md](../../CLAUDE.md) - the contract that sends a reader here for a tool quirk.
- [../../CLAUDE.md](../../CLAUDE.md) - section 5 (Documentation Discipline) and Guardrail #10.
