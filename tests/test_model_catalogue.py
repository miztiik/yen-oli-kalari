"""Hold the model catalogue to its contract, and the page index to delivering it.

The catalogue is the only place this project records what is true of a MODEL
rather than of a reading of one: its licence, its architecture, its standing on
a public board, and the URLs a reader follows to check any of that. It had no
contract, and it cost two silent failures that nobody could see from the page:

  * `build-page-index.mjs` copied seven fields onto each run and dropped the
    rest, so no `card` or `onnx` URL ever reached the browser
  * the join was keyed on the results directory - a RUN id from
    voices.config.json - while the rows were keyed on a hand-made model slug,
    so even a delivered catalogue would have matched nothing

Both render as "the page draws nothing there", which looks exactly like "there
was nothing to draw". So this suite checks the delivery, not just the shape:

  * the schema is a valid schema, and the committed catalogue satisfies it
  * every row is keyed by a Hugging Face repository id, which is what a manifest
    carries as `modelId`
  * every link is https and carries a label a reader can act on
  * the builder EMITS a catalogue, keyed the way the page looks it up
  * a run whose model has no catalogue row still produces an index

The builder is driven with a built fixture run in a temporary directory, never
with whatever happens to be in `results/` - a test that reads generated output
costs more as the project generates more of it (CLAUDE.md Guardrail #12), and it
cannot carry the case the archive has never produced.

Run: python -m pytest tests/test_model_catalogue.py
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

jsonschema = pytest.importorskip("jsonschema")

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
HARNESS = REPOSITORY_ROOT / "test" / "voice-evaluation"
SCHEMA_PATH = HARNESS / "model-catalogue.schema.json"
CATALOGUE_PATH = HARNESS / "model-catalogue.json"
BUILDER = HARNESS / "build-page-index.mjs"
PAGE_APP = HARNESS / "page" / "app.js"

NODE = shutil.which("node")
needs_node = pytest.mark.skipif(NODE is None, reason="node is not on PATH")


@pytest.fixture(scope="module")
def schema():
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def catalogue():
    return json.loads(CATALOGUE_PATH.read_text(encoding="utf-8"))


def test_schema_is_a_valid_schema(schema):
    jsonschema.Draft7Validator.check_schema(schema)


def test_committed_catalogue_satisfies_its_schema(schema, catalogue):
    errors = sorted(
        jsonschema.Draft7Validator(schema).iter_errors(catalogue),
        key=lambda error: list(error.path),
    )
    assert not errors, "\n".join(f"{list(e.path)}: {e.message}" for e in errors)


def test_schema_version_matches_the_catalogue(schema, catalogue):
    """A reader that does not know the version refuses the file, so the two agree."""
    assert catalogue["schemaVersion"] == schema["properties"]["schemaVersion"]["const"]


def test_schema_carries_a_changelog_entry_for_its_version(schema):
    """CLAUDE.md section 11: version equals the newest changelog entry."""
    changelog = schema["changelog"]
    assert changelog, "a persisted contract carries a changelog"
    assert changelog[0]["version"] == schema["properties"]["schemaVersion"]["const"]
    for entry in changelog:
        assert entry["change"] and entry["why"], "a changelog entry says what and why"


def test_every_row_is_keyed_by_a_hugging_face_repository_id(catalogue):
    """The key is what a manifest carries as `modelId`. A slug here matches nothing."""
    for key in catalogue["models"]:
        assert key.count("/") == 1, f"{key} is not an owner/name repository id"
        owner, name = key.split("/")
        assert owner and name, f"{key} has an empty half"


def test_every_link_is_https_and_says_what_it_opens(catalogue):
    """A link in a payload is an outbound URL, and a bare hostname is not a label."""
    for key, model in catalogue["models"].items():
        for kind, link in (model.get("links") or {}).items():
            assert link["url"].startswith("https://"), f"{key}.{kind} is not https"
            assert link["label"], f"{key}.{kind} has no label"
            assert "huggingface.co" not in link["label"], (
                f"{key}.{kind} is labelled with a hostname, which says where somebody "
                "put a file rather than what the reader is about to open"
            )


def test_at_most_one_model_is_the_incumbent(catalogue):
    """The incumbent is the voice the pipeline uses; two of them is a contradiction."""
    incumbents = [key for key, model in catalogue["models"].items() if model.get("incumbent")]
    assert len(incumbents) <= 1, f"more than one incumbent: {incumbents}"


def test_an_arena_rating_carries_the_date_it_was_read(catalogue):
    """A rank moves when other models are added, so a bare number was true once."""
    for key, model in catalogue["models"].items():
        if model.get("arenaElo") is None:
            continue
        note = model.get("arenaNote") or ""
        assert any(char.isdigit() for char in note) and "20" in note, (
            f"{key} publishes an Arena rating with no read date in arenaNote"
        )


def test_the_page_reads_no_field_the_contract_does_not_name(schema):
    """The spec sheet draws one row a field. A field the page reads and the schema
    does not name would render as a blank nobody can explain."""
    named = set(schema["definitions"]["model"]["properties"])
    source = PAGE_APP.read_text(encoding="utf-8")
    start = source.index("function known(run)")
    end = source.index("\n\t}", start)
    body = source[start:end]

    read_from_catalogue = {
        line.split("catalogued.")[1].split(",")[0].split(" ")[0].split(")")[0].strip()
        for line in body.splitlines()
        if "catalogued." in line
    }
    unknown = {field for field in read_from_catalogue if field not in named}
    assert not unknown, f"known() reads fields the contract does not name: {sorted(unknown)}"


# --------------------------------------------------------------- the delivery


def write_fixture_run(root: Path, directory: str, model_id: str) -> Path:
    """One results directory, built rather than borrowed from `results/`."""
    run = root / directory
    (run / "summaries").mkdir(parents=True)
    manifest = {
        "schemaVersion": "2026-09-13",
        "generatedAt": "2026-09-14T00:00:00.000Z",
        "model": "fixture-model",
        "modelId": model_id,
        "quantisation": "fp32",
        "runtime": "kokoro-js",
        "voice": "bm_george",
        "sampleRate": 24000,
        "run": {
            "runId": "fixture-model__c40-r1-t4-iall-s1",
            "model": "fixture-model",
            "configSlug": "c40-r1-t4-iall-s1",
            "isolated": True,
            "config": {
                "maxWordsAChunk": 40,
                "repeats": 1,
                "threads": 4,
                "maxItems": 0,
                "shards": 1,
            },
        },
        "host": {"isCi": True, "cpuModel": "fixture", "cpuCount": 4},
        "clips": [
            {
                "id": "real-001",
                "text": "One sentence.",
                "words": 2,
                "chunks": 1,
                "clip": "real-001.wav",
                "audioSeconds": 1.0,
                "wallClockMs": 1000,
                "realTimeFactor": 1.0,
                "wordsAMinute": 120.0,
            }
        ],
        "totals": {
            "clipCount": 1,
            "audioSeconds": 1.0,
            "wallSeconds": 1.0,
            "realTimeFactor": 1.0,
            "wordsAMinute": 120.0,
        },
        "metrics": {
            "realTimeFactor": 1.0,
            "speakingRate": 120.0,
            "notMeasuredHere": ["intelligibility"],
        },
    }
    (run / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    return run


def build_index(results_root: Path, index_path: Path):
    environment = dict(os.environ)
    environment["RESULTS_DIR"] = str(results_root)
    environment["INDEX_PATH"] = str(index_path)
    finished = subprocess.run(
        [NODE, str(BUILDER)],
        capture_output=True,
        text=True,
        env=environment,
        cwd=str(HARNESS),
    )
    assert finished.returncode == 0, finished.stderr
    return json.loads(index_path.read_text(encoding="utf-8"))


@needs_node
def test_the_index_carries_the_catalogue_keyed_the_way_the_page_reads_it(tmp_path, catalogue):
    """The bug this closes: the index shipped no catalogue at all, so every
    lookup in the page resolved against an empty object."""
    model_id = next(iter(catalogue["models"]))
    write_fixture_run(tmp_path / "results", "voiced-kokoro-fp32-uk", model_id)
    index = build_index(tmp_path / "results", tmp_path / "index.json")

    assert "catalogue" in index, "the index ships no catalogue"
    assert model_id in index["catalogue"], (
        "the catalogue is not keyed by the model id the run carries, which is how "
        "the page looks it up"
    )
    assert index["catalogue"][model_id]["links"], "the source URLs did not travel"


@needs_node
def test_the_index_carries_only_the_models_that_ran(tmp_path, catalogue):
    """A reader should not pay for four models nobody voiced."""
    model_id = next(iter(catalogue["models"]))
    write_fixture_run(tmp_path / "results", "voiced-one", model_id)
    index = build_index(tmp_path / "results", tmp_path / "index.json")
    assert list(index["catalogue"]) == [model_id]
    assert len(catalogue["models"]) > 1, "the fixture is pointless if the file holds one row"


@needs_node
def test_a_model_with_no_catalogue_row_still_builds(tmp_path):
    """The catalogue is a fallback, never a requirement. A run whose model is not
    catalogued must still reach the page - the manifest is the better source."""
    write_fixture_run(tmp_path / "results", "voiced-unknown", "nobody/not-in-the-catalogue")
    index = build_index(tmp_path / "results", tmp_path / "index.json")
    assert index["catalogue"] == {}
    assert index["runs"][0]["modelId"] == "nobody/not-in-the-catalogue"
    assert index["runs"][0]["licence"] is None, (
        "an unknown licence is written as null rather than dropped - the page prints "
        "'not recorded' for a null and cannot tell a missing key from an undrawn field"
    )
