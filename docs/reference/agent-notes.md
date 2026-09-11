# Agent Notes

**Last Updated**: 2026-09-11

Environment and tool traps that make a command lie about its result in this
repository, on this machine. Each entry names the false result, its cause, and
the command that gets the true answer. Every entry below was verified by running
it on 2026-09-11.

This page exists so execution craft has a home inside `docs/`. A lesson kept
only in an agent's private note store is invisible to the next person and the
next agent ([../../CLAUDE.md](../../CLAUDE.md) Rule #4). A private store is a
cache of this page, never the only copy.

**This is not a place for project knowledge.** A rule about how the pipeline
behaves, what a payload carries, or why a design was chosen belongs in the living
doc that owns it ([documentation-structure.md](documentation-structure.md)). If
an entry starts explaining the product, it has been filed wrong.

This is **one page**. Routing rule 8 in the structure doc splits it into
`agent-notes/<tool-family>.md` children only when it stops being readable as one
page; it has five entries and is nowhere near that, so it stays whole.

## git

**`git log`, `git status` and `git rev-parse` all read as a broken git, and the
truth is there is no git here.** This checkout is not a git repository: there is
no `.git`, and every git command answers `fatal: not a git repository (or any of
the parent directories): .git`. So any instruction that assumes history - the
bootstrap step `git log --oneline -20`, a diff against `origin/main`, a
contract-drift `git diff --exit-code` gate - cannot run in this checkout today.
The tell that this is the repo state and not a corrupt `.git`: `Test-Path .git`
returns `False`. The sibling `yen-idhazh` checkout beside it is a real git repo
if you genuinely need one.

## The repository path

**An unquoted path to this repo silently loses its tail, and a raw file URL will
not open.** The path is
`C:\Users\kumarsnaveen\OneDrive - Microsoft\Documents\Microsoft Scout\yen-oli-kalari`
- two spaces and a hyphen. Unquoted, PowerShell splits on the first space and
reads `- Microsoft\Documents\...` as extra arguments, so `Set-Location` lands
somewhere else or errors. The tell is that the command acts on the wrong
directory rather than failing outright. Always single-quote a path argument. A
`file://` URL needs each space encoded as `%20`; build it with the type rather
than by hand, which yields
`file:///C:/Users/kumarsnaveen/OneDrive%20-%20Microsoft/Documents/Microsoft%20Scout/yen-oli-kalari`:

```powershell
([Uri]((Resolve-Path .).Path)).AbsoluteUri
```

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
bytes. On this PowerShell, `Set-Content` and `Out-File` write UTF-8 with **no**
BOM by default (a `hello` file starts with bytes `104,101,108`), so the
Windows-PowerShell-5.1 BOM-on-write trap does not apply here - do not add a
`-Encoding` workaround for a BOM that is not being written.

## Python and the tools

**`ruff` and `mypy` read as missing, and are not - they only run as a module.**
Verified present on 2026-09-11:

| Tool | Bare command | Module form | Version |
| --- | --- | --- | --- |
| Python | `python` | - | 3.14.2 (a `py` launcher answers 3.14.0) |
| pytest | on PATH | `python -m pytest` | 9.0.2 |
| ruff | **not on PATH** | `python -m ruff` | 0.14.13 |
| mypy | **not on PATH** | `python -m mypy` | 1.19.1 |
| node / npm | on PATH | - | node 24.12.0 |
| gh | on PATH | - | 2.90.0 |
| git | on PATH | - | 2.55.0 |

Typing `ruff` or `mypy` gives `The term 'ruff' is not recognized`, which reads
as "not installed" when both are installed as modules. Invoke them as
`python -m ruff` and `python -m mypy`. There is no `pyproject.toml`, no
`package.json` and no test config in the repo, so `python -m pytest` here
collects 0 items and exits without asserting anything, and ruff and mypy run on
their own defaults rather than a project rule - none of the four is a gate yet
([../how-to/run-the-gates.md](../how-to/run-the-gates.md)).

## Adding an entry

Write it under the heading for the command you are about to type, in this shape:
a bold lead naming the false result ("reads as X, is actually Y"), one or two
sentences of cause, then the command that gets the true answer. Keep the tell -
the check that separates the trap from the thing it looks like - because an entry
with a fix and no tell fires confidently on the wrong diagnosis. A number carries
its date ([../../CLAUDE.md](../../CLAUDE.md) Rule #10). An entry whose trap can no
longer fire is deleted, not archived.

## See also

- [../how-to/run-the-gates.md](../how-to/run-the-gates.md) - the checks these traps interfere with, and the state of each gate.
- [documentation-structure.md](documentation-structure.md) - routing rule 8, which sends a tool quirk here rather than into private memory.
- [repository-layout.md](repository-layout.md) - the directory map these commands run against.
- [../agents/guardrails.md](../agents/guardrails.md) - the rules digest that points here for the memory contract (Rule #4).
- [../../CLAUDE.md](../../CLAUDE.md) - section 5 (Documentation Discipline) and Rule #10.
