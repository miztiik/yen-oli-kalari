# Agent Notes

**Last Updated**: 2026-09-14

Environment and tool traps that make a command lie about its result in this
repository, on this machine. Each entry names the false result, its cause, and
the command that gets the true answer. Every entry below was verified by running
it on 2026-09-11.

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

**This is a git repository as of 2026-09-11, and it was not one before.** It was
initialised in place after the move off OneDrive, so `git log`, `git status`,
`git rev-parse` and a `git diff --exit-code` drift gate all work normally, and
the bootstrap step `git log --oneline -20` runs. History starts at the seed
commit rather than at the first design decision, so a question about why
something was decided is answered by the docs and the archived ruling, not by
`git log`. There is no remote yet, so anything that assumes `origin/main` -
a diff against upstream, a pull-request gate - has nothing to compare against
until one is added.

## The repository path

**This repo lives outside OneDrive, at `C:\src\yen-oli-kalari`, and that is
deliberate.** It was moved there on 2026-09-11, out of
`...\OneDrive - Microsoft\Documents\Microsoft Scout\`, for two reasons that both
bite a git repository. OneDrive sync and `.git` contend for the same files:
sync can grab a loose object or a packfile mid-write, `git gc` meets file locks,
and a sync conflict lands as a second copy with a machine name in it that git
then reports as untracked. Files On-Demand can also leave a placeholder that git
reads as an empty file. The old path additionally carried two spaces and a
hyphen, so an unquoted argument split on the first space and a `file://` URL
needed `%20` on every space.

The current path has no space in it, so both of those traps are gone. Quote a
path argument anyway - the habit costs nothing and the sibling checkout still
lives under the old-style path. To build a file URL from wherever you are:

```powershell
([Uri]((Resolve-Path .).Path)).AbsoluteUri
```

## The 260-character path limit, which the model loader hits first

**A deep checkout cannot load an ONNX model on Windows, and the error names the
wrong cause.** `onnxruntime-node` opens the weights through a native call that
is still bound by the classic 260-character `MAX_PATH`, and the cache path it
opens is long before the repository contributes anything:

```
node_modules/kokoro-js/node_modules/@huggingface/transformers/.cache/
  onnx-community/Kokoro-82M-v1.0-ONNX/onnx/model.onnx
```

That is about 120 characters on its own. Any checkout deeper than roughly 140
characters fails, and it fails as:

```
Error: Load model from <path> failed:Load model <path> failed. File doesn't exist
```

The file does exist. Verified 2026-09-14 from a worktree under
`...\OneDrive - Microsoft\Documents\Microsoft Scout\yen-oli-kalari-worktrees\...`,
where the model had downloaded correctly - 310 MB of `model.onnx` sitting on
disk - and every one of three runs died on the same line.

**A directory junction does not fix it.** Node resolves the real path before the
native call, so `C:\short` pointing at the deep directory fails identically.

What works: run the harness from a genuinely short real path. Mirror the tree,
install there, and copy `results/` back:

```powershell
robocopy <checkout> C:\yokrun /E /XD node_modules .git results
cd C:\yokrun\test\voice-evaluation
npm install --no-audit --no-fund
node benchmark-model.mjs
robocopy C:\yokrun\test\voice-evaluation\results <checkout>\test\voice-evaluation\results /E
```

Seed `C:\yokrun\...\.cache` from the deep checkout's copy first and the 310 MB
download is not paid twice. None of this applies in CI, where the runner's
workspace path is short.

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
its date ([../../CLAUDE.md](../../CLAUDE.md) Guardrail #10). An entry whose trap can no
longer fire is deleted, not archived.

## See also

- [../how-to/run-the-gates.md](../how-to/run-the-gates.md) - the checks these traps interfere with, and the state of each gate.
- [documentation-structure.md](documentation-structure.md) - routing rule 8, which sends a tool quirk here rather than into private memory.
- [repository-layout.md](repository-layout.md) - the directory map these commands run against.
- [../../CLAUDE.md](../../CLAUDE.md) - the contract that sends a reader here for a tool quirk.
- [../../CLAUDE.md](../../CLAUDE.md) - section 5 (Documentation Discipline) and Guardrail #10.
