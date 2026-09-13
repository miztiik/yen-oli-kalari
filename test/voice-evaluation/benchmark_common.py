"""The pieces every Python benchmark arm shares, so two arms cannot drift apart.

WHY THIS EXISTS. `benchmark_genai_model.py` and `benchmark_gguf_model.py` measure
different runtimes - ONNX Runtime with a hand-written sampling loop, and llama.cpp
with a neural codec behind it - but they must produce THE SAME NUMBERS THE SAME
WAY or the comparison table is comparing arithmetic rather than models. Chunking
at 40 words, real-time factor as wall clock over audio seconds, and the manifest
shape are contracts, not implementation details of whichever file got written
first.

Nothing here loads a model. This is the measurement, not the thing measured.
"""

from __future__ import annotations

import json
import os
import resource
import sys
import time
import wave
from pathlib import Path
from typing import Any, Callable

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "voices.config.json"
CORPUS_PATH = HERE.parent / "onnx-runtime-comparison" / "real-summaries" / "summaries.json"

MAX_WORDS_A_CHUNK = int(os.environ.get("MAX_WORDS_A_CHUNK", "40"))
MAX_ITEMS = int(os.environ.get("MAX_ITEMS", "0"))  # 0 = the whole corpus
SHARD_INDEX = int(os.environ.get("SHARD_INDEX", "0"))
SHARD_TOTAL = max(1, int(os.environ.get("SHARD_TOTAL", "1")))


def peak_memory_mb() -> int:
    """Peak resident set, which is what decides deployability.

    MEASURED AND CORRECTED 2026-09-14. `RUSAGE_SELF` alone is wrong for any arm
    that shells out: the Magpie arm drives a released NVIDIA binary, so the model
    lives in a child process and the parent reported 48 MB for a 542 MB model.
    Taking the larger of self and children reports the biggest single process the
    run actually needed, and is unchanged for the in-process arms because their
    children total zero.
    """
    mine = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    theirs = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    return int(max(mine, theirs) / 1024)  # ru_maxrss is KiB on Linux


def split_into_chunks(text: str, max_words: int = MAX_WORDS_A_CHUNK) -> list[str]:
    """Split at sentence boundaries into chunks of at most `max_words`.

    The same rule the Node harness uses, and for the same reason: a model that
    truncates at its context limit reports nothing about what it dropped. The
    first measurement this project ever took was invalid because 54, 80, 134 and
    242-word summaries all produced the same 27 seconds of audio.
    """
    sentences = [s.strip() for s in text.replace("\n", " ").split(". ") if s.strip()]
    chunks: list[str] = []
    current: list[str] = []
    count = 0
    for index, sentence in enumerate(sentences):
        piece = sentence if sentence.endswith(".") or index == len(sentences) - 1 else sentence + "."
        words = len(piece.split())
        if current and count + words > max_words:
            chunks.append(" ".join(current))
            current, count = [piece], words
        else:
            current.append(piece)
            count += words
    if current:
        chunks.append(" ".join(current))
    return chunks or [text]


def write_wav(path: Path, samples, sample_rate: int) -> int:
    """Write mono 16-bit PCM. Returns the byte count."""
    import numpy as np

    clipped = np.clip(samples, -1.0, 1.0)
    pcm = (clipped * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())
    return path.stat().st_size


def load_spec(model_key: str) -> dict:
    """Find a model's row in voices.config.json. The row is the configuration -
    guardrail 6 - so a runner reads its voice, quantisation and codec from here
    rather than carrying them in source."""
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    for model in config["models"]:
        if model["id"] == model_key:
            return model
    ids = ", ".join(m["id"] for m in config["models"])
    raise SystemExit(f"unknown MODEL '{model_key}'. Configured: {ids}")


def result_dir_for(model_key: str) -> Path:
    """Where this arm writes. A sharded run gives every shard its own directory
    so four jobs do not race to write one manifest."""
    return (
        Path(os.environ["RESULT_DIR"])
        if os.environ.get("RESULT_DIR")
        else HERE / "results" / model_key
    )


def select_summaries() -> tuple[list[dict], int]:
    """The corpus slice this shard is responsible for."""
    corpus = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    summaries = corpus["summaries"]
    whole = len(summaries)
    if SHARD_TOTAL > 1:
        # Round-robin rather than contiguous blocks: summaries vary in length by
        # more than 10x, so a contiguous slice would hand one shard every long
        # one and the fan-out would finish no sooner than a single job.
        summaries = [s for i, s in enumerate(summaries) if i % SHARD_TOTAL == SHARD_INDEX]
        print(f"shard {SHARD_INDEX + 1}/{SHARD_TOTAL}: {len(summaries)}/{whole} summaries", flush=True)
    return summaries[: MAX_ITEMS or None], whole


def summarise(clips: list[dict]) -> dict:
    """The metrics block, computed identically for every Python arm.

    Long-form drift needs per-chunk timings these runners do not record, so it is
    absent rather than zero - a fabricated zero would read as "no drift".
    """
    audio_total = sum(c["audioSeconds"] for c in clips)
    words_total = sum(c["words"] for c in clips)
    wall_total = sum(c["wallClockMs"] for c in clips) / 1000
    characters = sum(len(c["text"]) for c in clips)
    rates = sorted(c["wordsAMinute"] for c in clips)
    mean_rate = sum(rates) / len(rates) if rates else 0.0
    variance = sum((r - mean_rate) ** 2 for r in rates) / (len(rates) - 1) if len(rates) > 1 else 0.0
    deviation = variance**0.5

    return {
        "totalCharacters": characters,
        "totalWords": words_total,
        "audioSeconds": round(audio_total, 2),
        "processingSeconds": round(wall_total, 1),
        "charactersASecond": round(characters / audio_total, 2) if audio_total else 0,
        "medianCharactersASecond": round(
            sorted(len(c["text"]) / c["audioSeconds"] for c in clips)[len(clips) // 2], 2
        )
        if clips
        else 0,
        "speakingRate": round(words_total / audio_total * 60, 1) if audio_total else 0,
        "realTimeFactor": round(wall_total / audio_total, 4) if audio_total else 0,
        "speedMultiplier": round(audio_total / wall_total, 2) if wall_total else 0,
        "rateStability": {
            "mean": round(mean_rate, 1),
            "median": rates[len(rates) // 2] if rates else 0,
            "min": rates[0] if rates else 0,
            "max": rates[-1] if rates else 0,
            "standardDeviation": round(deviation, 2),
            "coefficientOfVariation": round(deviation / mean_rate, 4) if mean_rate else 0,
        },
        "drift": None,
        "notMeasuredHere": [
            "long-form drift (needs per-chunk timings from this runner)",
            "intelligibility",
            "naturalness",
            "audio defects",
        ],
    }


def write_manifest(
    result_dir: Path,
    model_key: str,
    spec: dict,
    runtime: str,
    clips: list[dict],
    load_seconds: float,
    extra: dict | None = None,
) -> dict:
    """Write the manifest the merge, collate and page steps all read."""
    metrics = summarise(clips)
    manifest = {
        "schemaVersion": "2026-09-13",
        "metrics": metrics,
        "model": model_key,
        "modelId": spec["modelId"],
        "runtime": runtime,
        "voice": spec.get("voice"),
        "accent": spec.get("accent"),
        "accentKnown": spec.get("accentKnown"),
        "licence": spec.get("licence"),
        "commercialUse": spec.get("commercialUse"),
        "params": spec.get("params"),
        "architecture": spec.get("architecture"),
        "sizeGb": spec.get("sizeGb"),
        "modelLoadMs": int(load_seconds * 1000),
        "peakMemoryMb": peak_memory_mb(),
        "host": {
            "isCi": bool(os.environ.get("CI")),
            "cpuCount": os.cpu_count(),
            "python": sys.version.split()[0],
        },
        "clips": clips,
        "totals": {
            "clipCount": len(clips),
            "words": metrics["totalWords"],
            "audioSeconds": metrics["audioSeconds"],
            "wallSeconds": round(sum(c["wallClockMs"] for c in clips) / 1000, 1),
            "realTimeFactor": metrics["realTimeFactor"],
            "wordsAMinute": metrics["speakingRate"],
            "bytes": sum(c["bytes"] for c in clips),
        },
    }
    if extra:
        manifest.update(extra)
    (result_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def voice_the_corpus(
    speak: Callable[[str], tuple[Any, int]],
    sample_rate: int,
    result_dir: Path,
) -> list[dict]:
    """Voice this shard's slice, timing each summary and writing its clip.

    `speak` takes a chunk of text and returns (samples, sample_rate). It is
    called once per chunk, and the chunks of one summary are concatenated, so
    the timing is per summary rather than per chunk.
    """
    import numpy as np

    summaries, _ = select_summaries()
    (result_dir / "summaries").mkdir(parents=True, exist_ok=True)
    (result_dir / "verbalization").mkdir(parents=True, exist_ok=True)

    clips: list[dict] = []
    for sample in summaries:
        chunks = split_into_chunks(sample["text"])
        began = time.time()
        pieces = [speak(chunk)[0] for chunk in chunks]
        wall_ms = int((time.time() - began) * 1000)

        samples = np.concatenate(pieces)
        audio_seconds = len(samples) / sample_rate
        if audio_seconds <= 0:
            print(f"  {sample['id']}  produced no audio, skipped", flush=True)
            continue

        name = f"{sample['id']}.wav"
        byte_count = write_wav(result_dir / "summaries" / name, samples, sample_rate)
        clips.append(
            {
                "id": sample["id"],
                "text": sample["text"],
                "words": sample["words"],
                "hazards": sample.get("hazards", []),
                "sourceName": sample.get("sourceName"),
                "clip": name,
                "chunks": len(chunks),
                "audioSeconds": round(audio_seconds, 2),
                "wallClockMs": wall_ms,
                "realTimeFactor": round(wall_ms / 1000 / audio_seconds, 3),
                "wordsAMinute": round(sample["words"] / audio_seconds * 60, 1),
                "bytes": byte_count,
            }
        )
        print(
            f"  {sample['id']}  {sample['words']:4d}w  {audio_seconds:5.1f}s  "
            f"rtf {wall_ms / 1000 / audio_seconds:.2f}",
            flush=True,
        )
    return clips
