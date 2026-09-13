"""Hold every producer to the run-manifest contract.

A benchmark is a comparison, and a comparison needs two readings that were taken
the same way. Before `run-manifest.schema.json` existed, nothing checked that:
the node arm, the python arm and the shard merger each wrote a manifest by hand,
the two arms disagreed about where `repeats` lived, and the two knobs that most
change a figure - inference threads and the item cap - were not recorded at all.
Every one of those is a silent failure. The number still prints; it simply
cannot be compared with any other number.

So this suite checks the agreement rather than the arithmetic
(`test_shard_merge.py` owns the arithmetic):

  * the schema is a valid schema, and a real published manifest satisfies it
  * the config slug is DERIVED, is injective over the knobs, and round-trips
  * a knob that is not in the contract is refused rather than ignored
  * `isolated` is asserted, never inferred, and a false one must say why
  * a merged manifest validates against the SAME schema as an unsharded one

Run: python -m pytest tests/test_run_contract.py
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
SCHEMA_PATH = HARNESS / "run-manifest.schema.json"
RESOLVER = HARNESS / "run-config.mjs"

NODE = shutil.which("node")
needs_node = pytest.mark.skipif(NODE is None, reason="node is not on PATH")


@pytest.fixture(scope="module")
def schema():
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def validator(schema):
    checker = jsonschema.Draft7Validator
    checker.check_schema(schema)
    return checker(schema)


# Anything the resolver reads is cleared before each call, so a knob left in the
# developer's own environment cannot change what the test proves.
RESOLVER_INPUTS = {
    "MODEL", "SHARDS", "SHARD_INDEX", "REPEATS", "THREADS", "MAX_ITEMS",
    "MAX_WORDS_A_CHUNK", "RUN_ISOLATED", "NOT_ISOLATED_BECAUSE", "NOTES",
}


def resolve(**environment):
    """Run the canonical resolver, which is the only thing that may derive a slug."""
    base = {
        k: v
        for k, v in os.environ.items()
        if k not in RESOLVER_INPUTS and not k.startswith("GITHUB_")
    }
    return subprocess.run(
        [NODE, str(RESOLVER)],
        cwd=HARNESS,
        env={**base, **{k: str(v) for k, v in environment.items()}},
        capture_output=True,
        text=True,
    )


def resolved(**environment):
    result = resolve(**environment)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


# ------------------------------------------------------------ the schema itself

def test_the_schema_is_a_valid_schema(schema):
    jsonschema.Draft7Validator.check_schema(schema)


def test_the_config_block_is_closed(schema):
    """The one property that makes the contract worth having.

    An open `config` would let a knob be added to the harness without being
    recorded, which is precisely how `threads` and `maxItems` came to be absent
    from every reading taken before this schema.
    """
    config = schema["properties"]["run"]["properties"]["config"]
    assert config["additionalProperties"] is False
    assert set(config["required"]) == set(config["properties"])


@needs_node
def test_every_knob_the_resolver_knows_is_in_the_contract(schema):
    """The resolver and the schema must name the same set of knobs.

    They are two files that have to agree, so something has to check that they
    do. Drift here is the failure mode the whole contract exists to stop: a
    resolver that reads a sixth knob the schema never records.
    """
    contract = set(schema["properties"]["run"]["properties"]["config"]["properties"])
    printed = subprocess.run(
        [NODE, "-e", "import('./run-config.mjs').then(m=>console.log(JSON.stringify(m.KNOBS)))"],
        cwd=HARNESS, capture_output=True, text=True, check=True,
    ).stdout
    declared = set(json.loads(printed))
    assert declared == contract, (
        "run-config.mjs and run-manifest.schema.json disagree about what a run "
        f"configuration is: {declared ^ contract}"
    )


# -------------------------------------------------------------------- the slug

@needs_node
def test_the_slug_is_derived_from_the_config():
    run = resolved(MODEL="kokoro-fp32-uk", MAX_WORDS_A_CHUNK=40, REPEATS=1, THREADS=4, MAX_ITEMS=0, SHARDS=4)
    assert run["configSlug"] == "c40-r1-t4-iall-s4"
    assert run["runId"] == "kokoro-fp32-uk__c40-r1-t4-iall-s4"


@needs_node
def test_zero_is_written_as_a_word_because_it_means_no_limit():
    """`t0` and `i0` would read as zero threads and zero items."""
    run = resolved(MODEL="kokoro-fp32-uk", THREADS=0, MAX_ITEMS=0, SHARDS=1)
    assert "tauto" in run["configSlug"]
    assert "iall" in run["configSlug"]


@needs_node
@pytest.mark.parametrize(
    "knob,value",
    [
        ("MAX_WORDS_A_CHUNK", 30),
        ("REPEATS", 3),
        ("THREADS", 2),
        ("MAX_ITEMS", 6),
        ("SHARDS", 2),
    ],
)
def test_changing_any_knob_changes_the_slug(knob, value):
    """Injective over the knobs: two configurations cannot share an identity.

    If they could, two runs that measured different things would collide in an
    artifact name and the second would overwrite the first.
    """
    base = dict(MODEL="kokoro-fp32-uk", MAX_WORDS_A_CHUNK=40, REPEATS=1, THREADS=4, MAX_ITEMS=0, SHARDS=4)
    assert resolved(**base)["configSlug"] != resolved(**{**base, knob: value})["configSlug"]


@needs_node
def test_the_slug_matches_the_pattern_the_schema_pins(schema):
    run = resolved(MODEL="kokoro-fp32-uk", SHARDS=4)
    jsonschema.Draft7Validator(
        schema["properties"]["run"]["properties"]["configSlug"]
    ).validate(run["configSlug"])
    jsonschema.Draft7Validator(
        schema["properties"]["run"]["properties"]["runId"]
    ).validate(run["runId"])


# --------------------------------------------------------------- one model only

@needs_node
def test_a_run_refuses_more_than_one_model():
    """The whole re-architecture in one assertion."""
    result = resolve(MODEL="kokoro-fp32-uk,supertonic-m1")
    assert result.returncode != 0
    assert "one model" in result.stderr


@needs_node
def test_a_run_refuses_a_missing_model():
    result = resolve(MODEL="")
    assert result.returncode != 0
    assert "MODEL is required" in result.stderr


# ------------------------------------------------- both arms honour every knob

ARMS = {
    "node": HARNESS / "benchmark-model.mjs",
    "python": HARNESS / "benchmark_genai_model.py",
}


@pytest.mark.parametrize("arm", sorted(ARMS))
def test_both_arms_apply_the_item_ceiling_before_sharding(arm):
    """Capping after the split gives each of four shards its own six items and
    quietly measures twenty-four. The python arm did exactly that."""
    source = ARMS[arm].read_text(encoding="utf-8")
    cap = source.index("MAX_ITEMS" if arm == "node" else "if MAX_ITEMS:")
    shard = source.index("SHARD_TOTAL > 1" if arm == "node" else "if SHARD_TOTAL > 1:")
    assert cap < shard, f"the {arm} arm applies its item ceiling after sharding"


@pytest.mark.parametrize("arm", sorted(ARMS))
def test_both_arms_voice_each_clip_repeats_times(arm):
    """`repeats` is in the closed config and in the slug, and the schema says the
    reported wall clock is the MEDIAN of the repeats.

    The python arm used to record the knob and ignore it: it voiced each clip
    once while stamping `r3`, so a sweep at repeats=3 produced six
    medians-of-three and one single unrepeated reading, all labelled identically
    and all shown in the same comparison table. A manifest asserting a
    configuration that was not run is the exact failure the contract exists to
    prevent, and there was not even residual evidence because the arm omitted
    `wallClockRepeatsMs` too.
    """
    source = ARMS[arm].read_text(encoding="utf-8")
    assert "REPEATS" in source, f"the {arm} arm never reads the repeats knob"
    loop = "for (let repeat = 0; repeat < REPEATS" if arm == "node" else "for _ in range(REPEATS)"
    assert loop in source, f"the {arm} arm records repeats but never voices more than once"
    assert "wallClockRepeatsMs" in source, (
        f"the {arm} arm reports a median without keeping the readings behind it"
    )


# ---------------------------------------------------------------- isolation

@needs_node
def test_isolation_is_asserted_never_inferred():
    """A process cannot see the other jobs it contends with, so it may not guess."""
    assert resolved(MODEL="kokoro-fp32-uk")["isolated"] is False
    assert resolved(MODEL="kokoro-fp32-uk", RUN_ISOLATED="true")["isolated"] is True


@needs_node
def test_an_unisolated_run_says_what_polluted_it():
    run = resolved(MODEL="kokoro-fp32-uk", NOT_ISOLATED_BECAUSE="voiced beside five other models")
    assert run["notIsolatedBecause"] == "voiced beside five other models"


@needs_node
def test_an_unisolated_run_says_so_even_when_nobody_gave_a_reason():
    """Silence must not read as isolation. The default reason names the silence."""
    run = resolved(MODEL="kokoro-fp32-uk")
    assert run["isolated"] is False
    assert "did not assert isolation" in run["notIsolatedBecause"]


def test_the_schema_refuses_an_unexplained_unisolated_run(schema):
    """`isolated: false` with no reason is 'do not trust this' and nothing more."""
    run = {
        "runId": "m__c40-r1-t4-iall-s1",
        "model": "m",
        "configSlug": "c40-r1-t4-iall-s1",
        "isolated": False,
        "config": {"maxWordsAChunk": 40, "repeats": 1, "threads": 4, "maxItems": 0, "shards": 1},
    }
    errors = list(jsonschema.Draft7Validator(schema["properties"]["run"]).iter_errors(run))
    assert errors, "an unisolated run with no reason must not validate"
    run["notIsolatedBecause"] = "published beside five other models"
    assert not list(jsonschema.Draft7Validator(schema["properties"]["run"]).iter_errors(run))


def test_the_schema_refuses_an_unknown_knob(schema):
    run = {
        "runId": "m__c40-r1-t4-iall-s1",
        "model": "m",
        "configSlug": "c40-r1-t4-iall-s1",
        "isolated": True,
        "config": {
            "maxWordsAChunk": 40, "repeats": 1, "threads": 4, "maxItems": 0, "shards": 1,
            "temperature": 0.7,
        },
    }
    assert list(jsonschema.Draft7Validator(schema["properties"]["run"]).iter_errors(run)), (
        "a knob outside the contract must fail rather than be silently dropped"
    )


# ----------------------------------------------- real manifests satisfy the contract

def real_manifests():
    results = HARNESS / "results"
    if not results.is_dir():
        return []
    return sorted(results.glob("*/manifest.json"))


@pytest.mark.parametrize("path", real_manifests(), ids=lambda p: p.parent.name)
def test_a_real_manifest_satisfies_the_contract(validator, path):
    """Anything in the results tree that claims a run must fully satisfy it.

    A manifest with no `run` block was written before this contract existed.
    That is a real state - a developer's results tree survives a branch switch,
    and the published site still carries pre-contract readings - so it is
    reported as what it is rather than failed as though a producer had
    regressed. What must never pass is a manifest that HAS a run block and gets
    it wrong, because that is a live producer writing something no consumer can
    trust.
    """
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if "run" not in manifest:
        pytest.skip(
            f"{path.parent.name} predates the run contract, so it records neither its "
            "thread count nor its item ceiling and cannot be compared with a current "
            "reading. Re-measure it with benchmark-voice.yml."
        )
    errors = sorted(validator.iter_errors(manifest), key=str)
    assert not errors, "\n".join(f"{list(e.absolute_path)}: {e.message}" for e in errors)


@pytest.mark.parametrize("path", real_manifests(), ids=lambda p: p.parent.name)
def test_the_duplicated_chunk_size_agrees_with_the_contract(path):
    """`maxWordsAChunk` is written twice for older readers. A duplicated field
    that is allowed to drift is worse than no field."""
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if "run" not in manifest:
        pytest.skip("predates the run contract")
    if "maxWordsAChunk" not in manifest:
        pytest.skip("no top-level chunk size")
    assert manifest["maxWordsAChunk"] == manifest["run"]["config"]["maxWordsAChunk"]


@pytest.mark.parametrize("path", real_manifests(), ids=lambda p: p.parent.name)
def test_the_model_is_named_identically_in_both_places(path):
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if "run" not in manifest:
        pytest.skip("predates the run contract")
    assert manifest["model"] == manifest["run"]["model"]
