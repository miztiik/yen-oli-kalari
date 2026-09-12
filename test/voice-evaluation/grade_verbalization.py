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

# THE GRADER'S HARDEST PROBLEM, and it is not the voice.
#
# Whisper RE-NORMALISES spoken numbers back into digits. A model that correctly
# says "twelve point five billion euros" is transcribed as "EUR 12.5 billion",
# and a naive comparison against the expected spoken form then fails a model
# that was right. Measured 2026-09-13: this alone accounted for most of one
# model's apparent currency failures.
#
# So both sides are normalised toward WORDS, not toward digits: the transcript's
# digits are spelled out, its symbols are expanded, and the expectation is left
# as it already is. A difference that survives is then a difference in what was
# said rather than a difference in how the transcriber chose to write it.
UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
         "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
         "seventeen", "eighteen", "nineteen"]
TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]

SYMBOL_WORDS = {
    "$": " dollars ", "£": " pounds ", "€": " euros ", "%": " percent ",
    "&": " and ", "+": " plus ", "@": " at ", "/": " slash ",
}
CODE_WORDS = {
    "usd": "dollars", "gbp": "pounds", "eur": "euros",
    "bn": "billion", "tn": "trillion", "m": "million", "k": "thousand",
}


def spell_integer(value: int) -> str:
    """Small cardinals in words. Anything large is read digit by digit, which is
    what a newsreader does with a year and close enough for the rest."""
    if value < 20:
        return UNITS[value]
    if value < 100:
        return (TENS[value // 10] + (" " + UNITS[value % 10] if value % 10 else "")).strip()
    if value < 1000:
        rest = value % 100
        return (UNITS[value // 100] + " hundred" + (" " + spell_integer(rest) if rest else "")).strip()
    if value < 1_000_000:
        rest = value % 1000
        return (spell_integer(value // 1000) + " thousand" + (" " + spell_integer(rest) if rest else "")).strip()
    if value < 1_000_000_000:
        rest = value % 1_000_000
        return (spell_integer(value // 1_000_000) + " million" + (" " + spell_integer(rest) if rest else "")).strip()
    return " ".join(UNITS[int(digit)] for digit in str(value))


def spell_number(token: str) -> str:
    """Turn 12.5 into "twelve point five" and 2026 into a year reading."""
    if "." in token:
        whole, _, fraction = token.partition(".")
        parts = []
        if whole.isdigit():
            parts.append(spell_integer(int(whole)))
        parts.append("point")
        parts.extend(UNITS[int(d)] for d in fraction if d.isdigit())
        return " ".join(parts)
    if token.isdigit():
        value = int(token)
        # A four-digit number in news copy is almost always a year, and a
        # newsreader says "nineteen ninety seven" rather than the cardinal.
        if 1000 <= value <= 2999:
            hundreds, rest = value // 100, value % 100
            # 1997 is "nineteen ninety seven"; 2008 is "two thousand eight".
            if hundreds % 10 == 0 and rest < 10:
                return f"two thousand{" " + UNITS[rest] if rest else ""}"
            return f"{spell_integer(hundreds)} {spell_integer(rest)}" if rest else spell_integer(value)
        return spell_integer(value)
    return token


def normalise(text: str) -> list[str]:
    """Lowercase, expand symbols and digits into words, split into tokens.

    Both the transcript and the expectation go through this, which is the whole
    point: a difference that survives identical normalisation is a difference in
    what was said.
    """
    text = text.lower()
    for symbol, word in SYMBOL_WORDS.items():
        text = text.replace(symbol, word)
    text = re.sub(r"(\d),(\d)", r"\1\2", text)       # 40,000 -> 40000
    text = re.sub(r"[^\w\s.]", " ", text)
    text = re.sub(r"(?<!\d)\.|\.(?!\d)", " ", text)  # keep a decimal point only

    tokens: list[str] = []
    for token in text.split():
        token = CODE_WORDS.get(token, token)
        if any(character.isdigit() for character in token):
            tokens.extend(spell_number(token).split())
        else:
            tokens.append(token)
    return tokens


def contains_in_order(haystack: list[str], needle: list[str]) -> bool:
    """Whether every expected token is present, order not required.

    Order is deliberately NOT required, and the reason is specific. A currency
    amount is written symbol-first and spoken symbol-last: `EUR 12.5bn` is read
    "twelve point five billion euros", and Whisper transcribes that back as
    "EUR 12.5 billion" - putting the unit in front again. Requiring order would
    fail a model that said exactly the right words in exactly the right way.

    What this still catches is the failure that matters: if the model says "bee
    en" instead of "billion", or "bps" instead of "million pounds", the expected
    token is simply absent and the case fails. A multiset check keeps that
    while tolerating how a transcriber chose to arrange it.
    """
    if not needle:
        return True
    remaining = list(haystack)
    for token in needle:
        if token in remaining:
            remaining.remove(token)
        else:
            return False
    return True


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
