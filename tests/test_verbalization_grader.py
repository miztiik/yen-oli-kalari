"""Check the verbalization grader on cases whose answer is already known.

A grader nobody grades is an opinion with a percentage sign. These seven cases
come from a real run on 2026-09-13 - four where the model was right and three
where it was wrong - and they exist because the first version of this grader
reported 18.5 percent accuracy for a model that was mostly correct.

THE BUG WORTH REMEMBERING. Whisper re-normalises spoken numbers back into
digits: a model that correctly says "twelve point five billion euros" is
transcribed as "EUR 12.5 billion". Comparing that against the expected spoken
form failed a model that had done exactly the right thing. Both sides are now
normalised toward words, and order is not required because a currency symbol is
written first and spoken last.
"""

import importlib.util
from pathlib import Path

HARNESS = Path(__file__).resolve().parents[1] / "test" / "voice-evaluation" / "grade_verbalization.py"

spec = importlib.util.spec_from_file_location("grade_verbalization", HARNESS)
grader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(grader)


def graded(transcript: str, expected: str) -> bool:
    return grader.contains_in_order(grader.normalise(transcript), grader.normalise(expected))


def test_whisper_writing_digits_does_not_fail_a_correct_model():
    """The bug this suite exists for."""
    assert graded("The fund raised EUR 12.5 billion in its third close.", "twelve point five billion euros")


def test_currency_word_order_does_not_matter():
    """Written symbol-first, spoken symbol-last. Both are correct."""
    assert graded("about $40,000 per engineer", "forty thousand dollars")


def test_a_year_reads_as_a_year():
    assert graded("Between 1997 and 2008, the index doubled.", "nineteen ninety seven")


def test_a_percentage_survives_the_symbol():
    assert graded("Inflation rose 3.7% against a 2% target.", "three point seven percent")


def test_a_wrong_unit_still_fails():
    """The real failure: GBP 8.75m read as "bps" rather than "million pounds"."""
    assert not graded("The settlement was 8.75 bps, down 20 million euros.", "eight point seven five million pounds")


def test_a_mangled_clock_still_fails():
    """08:30 read as "zero point eight three zero"."""
    assert not graded("The window runs 0.830 to 1700 CT.", "eight thirty")


def test_a_collapsed_initialism_still_fails():
    """AI/ML read as the single word "AML"."""
    assert not graded("The AML team reports to the CTO.", "a i slash m l")


def test_an_absent_expectation_passes():
    """A long-form case carries no expected phrase and is scored on drift."""
    assert graded("anything at all", "")
