"""Grade the verbalization suite by transcribing what the model actually said.

This is the instrument that turns the hardest question into a gate. Every case
in the suite carries the EXACT spoken form a competent newsreader would produce,
so the grading is against a ground truth rather than an opinion: transcribe the
audio, normalise both sides the same way, and check whether the expected tokens
are there in order.

WHY ASR RATHER THAN A LISTENER. A person can grade 28 cases. They cannot grade
28 cases across six models on every commit, and the failure being measured -
"twelve point five bee en" instead of "twelve point five billion euros" - is
exactly the kind a tired listener waves through. faster-whisper runs on the CPU
this project already pays for.

WHAT A SCORE HERE IS AND IS NOT. A case passes when every token of the expected
spoken form appears in order in the transcript. That is deliberately generous:
ASR makes its own mistakes, and a strict string match would punish the
transcriber rather than the voice. It is also deliberately narrow - it says
nothing about whether the audio is pleasant, only whether the words are right.

Usage:
    MODEL=kokoro-fp32-uk python grade_verbalization.py
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SUITE_PATH = HERE.parent / "onnx-runtime-comparison" / "verbalization-suite.json"

MODEL = os.environ.get("MODEL", "")
ASR_MODEL = os.environ.get("ASR_MODEL", "base.en")

# Spelled-out digits, so "12.5" in a transcript and "twelve point five" in an
# expectation are not counted as a mismatch of the voice.
NUMBER_WORDS = {
    "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
    "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
    "10": "ten", "11": "eleven", "12": "twelve", "13": "thirteen",
    "20": "twenty", "30": "thirty", "100": "hundred", "1000": "thousand",
}


def normalise(text: str) -> list[str]:
    """Lowercase, strip punctuation, spell small digits, split into tokens.

    Both the transcript and the expectation go through this, which is the whole
    point: a difference that survives identical normalisation is a difference in
    what was said.
    """
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    tokens = []
    for token in text.split():
        tokens.append(NUMBER_WORDS.get(token, token))
    return tokens


def contains_in_order(haystack: list[str], needle: list[str]) -> bool:
    """Whether every needle token appears in the haystack, in order."""
    if not needle:
        return True
    index = 0
    for token in haystack:
        if token == needle[index]:
            index += 1
            if index == len(needle):
                return True
    return False


def word_error_rate(reference: list[str], hypothesis: list[str]) -> float:
    """Levenshtein distance over tokens, divided by the reference length."""
    if not reference:
        return 0.0 if not hypothesis else 1.0
    previous = list(range(len(hypothesis) + 1))
    for i, ref_token in enumerate(reference, start=1):
        current = [i]
        for j, hyp_token in enumerate(hypothesis, start=1):
            current.append(
                min(
                    previous[j] + 1,               # deletion
                    current[j - 1] + 1,            # insertion
                    previous[j - 1] + (ref_token != hyp_token),  # substitution
                )
            )
        previous = current
    return previous[-1] / len(reference)


def main() -> int:
    if not MODEL:
        raise SystemExit("MODEL must be set")

    result_dir = HERE / "results" / MODEL
    audio_dir = result_dir / "verbalization"
    if not audio_dir.is_dir():
        raise SystemExit(f"no verbalization audio at {audio_dir} - run the benchmark first")

    from faster_whisper import WhisperModel

    print(f"transcribing with faster-whisper {ASR_MODEL} (int8, cpu)")
    asr = WhisperModel(ASR_MODEL, device="cpu", compute_type="int8")

    suite = json.loads(SUITE_PATH.read_text(encoding="utf-8"))
    by_id = {case["id"]: case for case in suite["cases"]}

    graded = []
    for wav in sorted(audio_dir.glob("*.wav")):
        case = by_id.get(wav.stem)
        if case is None:
            continue

        segments, _ = asr.transcribe(str(wav), language="en", beam_size=1)
        transcript = " ".join(segment.text for segment in segments).strip()

        heard = normalise(transcript)
        source = normalise(case["text"])
        fidelity = word_error_rate(source, heard)

        expected = case.get("expectedSpoken")
        if expected is None:
            # A long-form case has no single expected phrase; it is scored on
            # drift elsewhere, so only its fidelity is recorded here.
            graded.append(
                {
                    "id": case["id"],
                    "category": case["category"],
                    "transcript": transcript,
                    "textFidelityWer": round(fidelity, 4),
                    "verbalizationCorrect": None,
                    "scored": False,
                }
            )
            continue

        candidates = [expected] + case.get("acceptableAlternatives", [])
        correct = any(contains_in_order(heard, normalise(candidate)) for candidate in candidates)

        graded.append(
            {
                "id": case["id"],
                "category": case["category"],
                "text": case["text"],
                "expectedSpoken": expected,
                "transcript": transcript,
                "verbalizationCorrect": correct,
                "textFidelityWer": round(fidelity, 4),
                "trap": case.get("trap"),
                "scored": True,
            }
        )
        print(f"  {case['id']:8s} {'PASS' if correct else 'FAIL':4s}  wer {fidelity:.2f}  {transcript[:60]}")

    scored = [g for g in graded if g["scored"]]
    by_category: dict[str, dict] = {}
    for entry in scored:
        bucket = by_category.setdefault(entry["category"], {"total": 0, "correct": 0})
        bucket["total"] += 1
        bucket["correct"] += 1 if entry["verbalizationCorrect"] else 0

    summary = {
        "schemaVersion": "2026-09-13",
        "model": MODEL,
        "asrModel": ASR_MODEL,
        "casesScored": len(scored),
        "casesCorrect": sum(1 for g in scored if g["verbalizationCorrect"]),
        "verbalizationAccuracy": round(
            sum(1 for g in scored if g["verbalizationCorrect"]) / len(scored), 4
        )
        if scored
        else 0.0,
        "medianTextFidelityWer": round(
            sorted(g["textFidelityWer"] for g in graded)[len(graded) // 2], 4
        )
        if graded
        else 0.0,
        "byCategory": {
            name: {**stats, "accuracy": round(stats["correct"] / stats["total"], 4)}
            for name, stats in sorted(by_category.items())
        },
        "cases": graded,
    }

    out = result_dir / "verbalization-grades.json"
    out.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    print(f"\n--- {MODEL} ---")
    print(f"  verbalization accuracy  {summary['verbalizationAccuracy'] * 100:.1f}%  ({summary['casesCorrect']}/{summary['casesScored']})")
    print(f"  median text fidelity    WER {summary['medianTextFidelityWer']:.3f}")
    for name, stats in summary["byCategory"].items():
        print(f"    {name:22s} {stats['correct']}/{stats['total']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
