"""Split a real manifest four ways, merge it back, and check nothing moved.

The merger has to be provably correct before a workflow depends on it: a wrong
real-time factor here would look exactly like a fast model, which is the one
mistake this whole benchmark exists to prevent.

Run: python -m pytest tests/test_shard_merge.py
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1] / "test" / "voice-evaluation"
SOURCE = HERE / "results" / "voiced-supertonic-m1"
MODEL = "_shard_merge_fixture"
ROOT = HERE / "results" / MODEL
SHARDS = 4


def _build_shards(whole):
    """Deal the clips round-robin into four shards, as the benchmark now does."""
    clips = whole["clips"]
    for index in range(SHARDS):
        shard_dir = ROOT / f"shard-{index}"
        (shard_dir / "summaries").mkdir(parents=True, exist_ok=True)
        (shard_dir / "verbalization").mkdir(parents=True, exist_ok=True)

        mine = [c for i, c in enumerate(clips) if i % SHARDS == index]
        audio = sum(c.get("audioSeconds", 0) for c in mine)
        wall_ms = sum(c.get("wallClockMs", 0) for c in mine)
        words = sum(c.get("words", 0) for c in mine)

        manifest = dict(whole)
        manifest["clips"] = mine
        manifest["totals"] = {
            "clipCount": len(mine),
            "words": words,
            "audioSeconds": round(audio, 2),
            "wallSeconds": round(wall_ms / 1000, 2),
            "bytes": sum(c.get("bytes", 0) for c in mine),
            "realTimeFactor": round(wall_ms / 1000 / audio, 4) if audio else None,
            "wordsAMinute": round(words / audio * 60, 1) if audio else None,
        }
        manifest["shard"] = {"index": index, "total": SHARDS, "repeats": 1}
        # Each shard reports a different peak, so "max not sum" is testable.
        manifest["peakMemoryMb"] = whole.get("peakMemoryMb", 0) + index
        (shard_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        for clip in mine:
            (shard_dir / "summaries" / Path(clip["clip"]).name).write_bytes(b"fake audio")


@pytest.fixture(scope="module")
def merged_and_whole():
    if not (SOURCE / "manifest.json").exists():
        pytest.skip(f"no source manifest at {SOURCE}")
    node = shutil.which("node")
    if not node:
        pytest.skip("node is not on PATH")

    whole = json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))
    if ROOT.exists():
        shutil.rmtree(ROOT)
    _build_shards(whole)

    run = subprocess.run(
        [node, "merge-shards.mjs"],
        cwd=HERE,
        env={**os.environ, "MODEL": MODEL},
        capture_output=True,
        text=True,
    )
    assert run.returncode == 0, run.stderr

    merged = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    yield merged, whole
    shutil.rmtree(ROOT, ignore_errors=True)


# ----------------------------------------------------- the merged run is the run

def test_every_clip_survives(merged_and_whole):
    merged, whole = merged_and_whole
    assert merged["totals"]["clipCount"] == whole["totals"]["clipCount"]
    assert len(merged["clips"]) == len(whole["clips"])


def test_no_clip_is_duplicated(merged_and_whole):
    merged, _ = merged_and_whole
    ids = [c["id"] for c in merged["clips"]]
    assert len(set(ids)) == len(ids)


def test_real_time_factor_matches_the_unsharded_run(merged_and_whole):
    """The figure the design is priced on. Recomputed from the merged clips, not
    averaged across shards, because averaging weights a shard of three short
    summaries the same as one of nine long ones."""
    merged, whole = merged_and_whole
    assert merged["totals"]["realTimeFactor"] == pytest.approx(
        whole["totals"]["realTimeFactor"], abs=0.002
    )


def test_pace_and_audio_match(merged_and_whole):
    merged, whole = merged_and_whole
    assert merged["totals"]["audioSeconds"] == pytest.approx(whole["totals"]["audioSeconds"], abs=0.05)
    assert merged["totals"]["wordsAMinute"] == pytest.approx(whole["totals"]["wordsAMinute"], abs=0.2)
    assert merged["totals"]["words"] == whole["totals"]["words"]


def test_totals_use_the_same_keys_as_an_unsharded_run(merged_and_whole):
    """A merged manifest with its own key names would be a second schema for the
    same thing, and the page would have to know which kind of run it read."""
    merged, whole = merged_and_whole
    assert set(merged["totals"]) == set(whole["totals"])


# ------------------------------------------------- what sharding changes, exactly

def test_peak_memory_is_the_worst_shard_not_the_sum(merged_and_whole):
    """Four shards are four machines. A deployment provisions for the worst one."""
    merged, whole = merged_and_whole
    assert merged["peakMemoryMb"] == whole.get("peakMemoryMb", 0) + SHARDS - 1


def test_elapsed_is_the_slowest_shard_not_the_sum(merged_and_whole):
    """Fanning out only buys the difference between the slowest shard and the sum."""
    merged, _ = merged_and_whole
    assert merged["shard"]["elapsedSecondsIfParallel"] == pytest.approx(
        max(merged["shard"]["wallSecondsPerShard"]), abs=0.01
    )
    assert merged["shard"]["elapsedSecondsIfParallel"] < merged["totals"]["wallSeconds"]


def test_the_manifest_admits_it_was_merged(merged_and_whole):
    merged, _ = merged_and_whole
    assert merged["shard"]["merged"] is True
    assert merged["shard"]["shardsMerged"] == SHARDS
    assert merged["shard"]["shardsExpected"] == SHARDS


def test_audio_moves_up_beside_the_merged_manifest(merged_and_whole):
    merged, whole = merged_and_whole
    assert len(list((ROOT / "summaries").glob("*"))) == len(whole["clips"])
    assert list(ROOT.glob("shard-*")) == []


def test_a_dead_shard_does_not_fail_the_merge():
    """A shard that dies is a finding, not a reason to lose the other three."""
    if not (SOURCE / "manifest.json").exists():
        pytest.skip("no source manifest")
    node = shutil.which("node")
    if not node:
        pytest.skip("node is not on PATH")

    whole = json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))
    if ROOT.exists():
        shutil.rmtree(ROOT)
    _build_shards(whole)
    (ROOT / "shard-2" / "manifest.json").unlink()

    run = subprocess.run(
        [node, "merge-shards.mjs"],
        cwd=HERE,
        env={**os.environ, "MODEL": MODEL},
        capture_output=True,
        text=True,
    )
    assert run.returncode == 0, run.stderr
    merged = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))

    assert merged["shard"]["shardsMerged"] == 3
    assert merged["shard"]["shardsExpected"] == 4
    # And the reading is honestly partial rather than quietly short.
    assert merged["totals"]["clipCount"] < whole["totals"]["clipCount"]
    shutil.rmtree(ROOT, ignore_errors=True)


def test_shards_of_two_different_runs_are_refused():
    """The merge recomputes one real-time factor across every clip, so it means
    nothing unless every clip was voiced the same way.

    The dangerous part is that a mixed merge does not look broken. It produces a
    plausible number describing a configuration that was never run. A stale
    artifact landing in the results tree is the realistic way that happens, so
    the merger checks identity rather than trusting the directory layout.
    """
    if not (SOURCE / "manifest.json").exists():
        pytest.skip("no source manifest")
    node = shutil.which("node")
    if not node:
        pytest.skip("node is not on PATH")

    whole = json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))
    if ROOT.exists():
        shutil.rmtree(ROOT)
    _build_shards(whole)

    # Every shard from one run, except one that was voiced at a different
    # chunk size - a different configuration and therefore a different run.
    for index in range(SHARDS):
        path = ROOT / f"shard-{index}" / "manifest.json"
        manifest = json.loads(path.read_text(encoding="utf-8"))
        slug = "c40-r1-t4-iall-s4" if index != 2 else "c30-r1-t4-iall-s4"
        manifest["run"] = {
            "runId": f"{MODEL}__{slug}",
            "model": MODEL,
            "configSlug": slug,
            "isolated": True,
            "config": {
                "maxWordsAChunk": 40 if index != 2 else 30,
                "repeats": 1, "threads": 4, "maxItems": 0, "shards": SHARDS,
            },
        }
        path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    run = subprocess.run(
        [node, "merge-shards.mjs"],
        cwd=HERE,
        env={**os.environ, "MODEL": MODEL},
        capture_output=True,
        text=True,
    )
    assert run.returncode != 0, "a merge across two configurations must fail"
    assert "different runs" in run.stderr
    shutil.rmtree(ROOT, ignore_errors=True)


def test_shards_of_one_run_still_merge():
    """The guard must refuse a mismatch without refusing the normal case."""
    if not (SOURCE / "manifest.json").exists():
        pytest.skip("no source manifest")
    node = shutil.which("node")
    if not node:
        pytest.skip("node is not on PATH")

    whole = json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))
    if ROOT.exists():
        shutil.rmtree(ROOT)
    _build_shards(whole)

    slug = "c40-r1-t4-iall-s4"
    for index in range(SHARDS):
        path = ROOT / f"shard-{index}" / "manifest.json"
        manifest = json.loads(path.read_text(encoding="utf-8"))
        manifest["run"] = {
            "runId": f"{MODEL}__{slug}",
            "model": MODEL,
            "configSlug": slug,
            "isolated": True,
            "config": {
                "maxWordsAChunk": 40, "repeats": 1, "threads": 4,
                "maxItems": 0, "shards": SHARDS,
            },
        }
        path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    run = subprocess.run(
        [node, "merge-shards.mjs"],
        cwd=HERE,
        env={**os.environ, "MODEL": MODEL},
        capture_output=True,
        text=True,
    )
    assert run.returncode == 0, run.stderr
    merged = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    # The identity survives the merge, so the merged reading still says what
    # configuration produced it.
    assert merged["run"]["runId"] == f"{MODEL}__{slug}"
    assert merged["run"]["config"]["maxWordsAChunk"] == 40
    assert merged["run"]["isolated"] is True
    assert merged["shard"]["complete"] is True
    shutil.rmtree(ROOT, ignore_errors=True)


def _shards_with_run(whole, *, isolated_by_index=None, shards=SHARDS):
    """Build shards carrying a run block, optionally differing in isolation."""
    _build_shards(whole)
    slug = f"c40-r1-t4-iall-s{shards}"
    for index in range(SHARDS):
        path = ROOT / f"shard-{index}" / "manifest.json"
        if not path.exists():
            continue
        manifest = json.loads(path.read_text(encoding="utf-8"))
        isolated = True if isolated_by_index is None else isolated_by_index(index)
        run = {
            "runId": f"{MODEL}__{slug}",
            "model": MODEL,
            "configSlug": slug,
            "isolated": isolated,
            "config": {
                "maxWordsAChunk": 40, "repeats": 1, "threads": 4,
                "maxItems": 0, "shards": shards,
            },
        }
        if not isolated:
            run["notIsolatedBecause"] = "dispatched without the isolation assertion"
        manifest["run"] = run
        path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def _merge():
    return subprocess.run(
        [shutil.which("node"), "merge-shards.mjs"],
        cwd=HERE,
        env={**os.environ, "MODEL": MODEL},
        capture_output=True,
        text=True,
    )


def test_one_contended_shard_makes_the_whole_reading_unisolated():
    """Isolation is not part of the run id, so the identity guard cannot catch
    this: a shard dispatched without the assertion has the same id as one
    dispatched with it. Inheriting shard 0's `isolated: true` would let a
    contended shard hide inside a reading the collator then prices against the
    6 h job cap.
    """
    if not (SOURCE / "manifest.json").exists():
        pytest.skip("no source manifest")
    if not shutil.which("node"):
        pytest.skip("node is not on PATH")

    whole = json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))
    if ROOT.exists():
        shutil.rmtree(ROOT)
    # Shard 0 is isolated, so a merge that copies shard 0 wholesale passes.
    _shards_with_run(whole, isolated_by_index=lambda i: i != 2)

    run = _merge()
    assert run.returncode == 0, run.stderr
    merged = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))

    assert merged["run"]["isolated"] is False
    assert "1 of 4 shards" in merged["run"]["notIsolatedBecause"]
    shutil.rmtree(ROOT, ignore_errors=True)


def test_a_shard_that_uploaded_nothing_is_still_counted_as_missing():
    """The quietest way this file could produce a wrong number.

    A shard that dies before writing its first clip uploads no artifact at all -
    the workflow's upload step is `if-no-files-found: warn` - so no `shard-N`
    directory reaches the merge. Counting the tree would then report 3 of 3 for
    a four-shard run and recompute the totals over three quarters of the corpus
    with nothing saying so. The expected count must come from the run config.
    """
    if not (SOURCE / "manifest.json").exists():
        pytest.skip("no source manifest")
    if not shutil.which("node"):
        pytest.skip("node is not on PATH")

    whole = json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))
    if ROOT.exists():
        shutil.rmtree(ROOT)
    _shards_with_run(whole)
    # The whole directory, as though the artifact never existed.
    shutil.rmtree(ROOT / "shard-2")

    run = _merge()
    assert run.returncode == 0, run.stderr
    merged = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))

    assert merged["shard"]["shardsExpected"] == SHARDS, (
        "the expected count must come from run.config.shards, not from counting "
        "the directories that happened to arrive"
    )
    assert merged["shard"]["shardsMerged"] == 3
    assert merged["shard"]["complete"] is False
    assert "incompleteBecause" in merged["shard"]
    assert merged["totals"]["clipCount"] < whole["totals"]["clipCount"]
    shutil.rmtree(ROOT, ignore_errors=True)
