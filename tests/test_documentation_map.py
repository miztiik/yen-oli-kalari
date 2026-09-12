"""Check that the documentation map is complete and its links resolve.

Two failures this catches, both silent and both cheap to introduce.

A page that is not listed in the documentation map is a page nobody can navigate
to. The repository accumulated 25 documents and no map at all before this was
noticed, which is how a reader ends up asking where to start and getting a chat
log instead of a document.

A link that points at a moved or renamed file fails at the moment somebody
trusts it, which is the worst possible moment. `calculate_audio_budget.py` was
`price_audio.py` until 2026-09-12 and was referenced from six pages.

Usage:
    python -m pytest tests/test_documentation_map.py
"""

import re
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DOCS_DIR = REPOSITORY_ROOT / "docs"
MAP_PATH = DOCS_DIR / "reference" / "documentation-map.md"

MARKDOWN_LINK = re.compile(r"\[[^\]]*\]\(([^)]+)\)")


def read_map_links():
    """Return every relative path the map links to, resolved against its own directory."""
    text = MAP_PATH.read_text(encoding="utf-8")
    resolved = set()
    for target in MARKDOWN_LINK.findall(text):
        if target.startswith(("http://", "https://", "#", "mailto:")):
            continue
        resolved.add((MAP_PATH.parent / target.split("#", 1)[0]).resolve())
    return resolved


def test_map_exists():
    assert MAP_PATH.is_file(), "the documentation map is the reader's index and must exist"


def test_every_map_link_resolves():
    """A link in the map points at a file that is really there."""
    broken = sorted(str(p) for p in read_map_links() if not p.exists())
    assert not broken, "the documentation map links to paths that do not exist:\n" + "\n".join(broken)


def test_every_docs_page_is_in_the_map():
    """Every page under docs/ is reachable from the map, so none is orphaned."""
    linked = read_map_links()
    orphans = sorted(
        str(page.relative_to(REPOSITORY_ROOT))
        for page in DOCS_DIR.rglob("*.md")
        if page.resolve() != MAP_PATH.resolve() and page.resolve() not in linked
    )
    assert not orphans, (
        "these pages are not listed in the documentation map, so nobody can navigate to them:\n"
        + "\n".join(orphans)
    )


def test_every_page_carries_a_last_updated_stamp():
    """The documentation standard requires it directly under the title."""
    missing = []
    for page in DOCS_DIR.rglob("*.md"):
        head = page.read_text(encoding="utf-8").split("\n", 6)[:6]
        if not any(line.startswith("**Last Updated**: ") for line in head):
            missing.append(str(page.relative_to(REPOSITORY_ROOT)))
    assert not missing, "pages missing a **Last Updated** stamp in their first six lines:\n" + "\n".join(
        sorted(missing)
    )


def test_no_page_references_a_renamed_script():
    """A retired name must not survive as a live reference.

    Extend RETIRED_NAMES when a rename lands; it is the cheapest possible guard
    against the one reference that was missed.

    A line that names BOTH the old and the new thing is documenting the rename,
    not making a stale reference - the naming guardrail in CLAUDE.md cites
    `price_audio.py` as its own worked example, and must be allowed to. So the
    check is per line, and a line that carries the replacement is exempt.
    """
    retired_names = {"price_audio": "calculate_audio_budget"}
    searched = list(DOCS_DIR.rglob("*.md")) + [
        REPOSITORY_ROOT / "README.md",
        REPOSITORY_ROOT / "CLAUDE.md",
        REPOSITORY_ROOT / "AGENTS.md",
    ]
    offenders = []
    for page in searched:
        if not page.is_file():
            continue
        for number, line in enumerate(page.read_text(encoding="utf-8").splitlines(), start=1):
            for retired, replacement in retired_names.items():
                if retired in line and replacement not in line:
                    offenders.append(
                        f"{page.relative_to(REPOSITORY_ROOT)}:{number} references "
                        f"'{retired}' without naming '{replacement}'"
                    )
    assert not offenders, "\n".join(sorted(offenders))
