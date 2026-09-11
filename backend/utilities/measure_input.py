"""Measure the input yen-oli-kalari would voice: items a day and summary length.

Reads a local checkout of the yen-idhazh digest archive and reports how many
items arrive each day and how long their summaries are, so the audio design is
priced against a measured number instead of a guess (CLAUDE.md Guardrail #10). The
item count a day is what decides whether per-item audio is affordable at all.

Usage:
    python backend/utilities/measure_input.py <path-to-yen-idhazh-checkout>

The speaking pace below is an assumption, not a measurement. It is declared here
because every figure derived from it is an estimate, and a model that speaks at
130 words a minute moves all of them by 15 percent.
"""

import glob
import json
import os
import statistics
import sys

DIGEST_GLOB = "frontend/public/digest/*/*/*/digest.json"
WORDS_PER_MINUTE = 150  # assumption: a normal news-read pace
RECENT_DAYS_SHOWN = 14


def find_digest_files(root):
    """Return the path of every committed digest file under root, oldest first."""
    return sorted(glob.glob(os.path.join(root, DIGEST_GLOB)))


def count_words(text):
    """Return how many whitespace-separated words text holds."""
    return len((text or "").split())


def read_one_day(path):
    """Read one digest file and return its date, summary word counts and size."""
    with open(path, encoding="utf-8") as handle:
        day = json.load(handle)
    items = day.get("items", [])
    return {
        "date": day.get("date"),
        "item_count": len(items),
        "summary_words": [count_words(item.get("summary")) for item in items],
        "payload_mb": os.path.getsize(path) / 1048576,
    }


def read_every_day(root):
    """Read every committed day under root, oldest first."""
    return [read_one_day(path) for path in find_digest_files(root)]


def compute_percentile(values, fraction):
    """Return the value at fraction through values, sorted ascending."""
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(len(ordered) * fraction))]


def convert_words_to_speech_seconds(word_count):
    """Return how long word_count words take to speak at WORDS_PER_MINUTE."""
    return word_count / WORDS_PER_MINUTE * 60


def print_recent_days(days):
    """Print one row per recent day: date, items, summary words, payload size."""
    print(f"{'date':<12}{'items':>7}{'words':>10}{'MB':>8}")
    for day in days[-RECENT_DAYS_SHOWN:]:
        print(
            f"{day['date']:<12}{day['item_count']:>7}"
            f"{sum(day['summary_words']):>10}{day['payload_mb']:>8.2f}"
        )


def print_item_census(days, every_summary_word_count):
    """Print how many days, items and summary words the archive holds."""
    item_counts = [day["item_count"] for day in days]
    print(
        f"\nDAYS={len(days)}  ITEMS={sum(item_counts)}  "
        f"SUMMARY_WORDS={sum(every_summary_word_count)}"
    )
    print(
        f"items/day  median={statistics.median(item_counts):.0f}  "
        f"max={max(item_counts)}  min={min(item_counts)}"
    )


def print_summary_length(every_summary_word_count):
    """Print the spread of summary lengths, in words."""
    print(
        f"words/summary  mean={statistics.mean(every_summary_word_count):.1f}  "
        f"p50={compute_percentile(every_summary_word_count, 0.50)}  "
        f"p90={compute_percentile(every_summary_word_count, 0.90)}  "
        f"p99={compute_percentile(every_summary_word_count, 0.99)}  "
        f"max={max(every_summary_word_count)}"
    )


def print_speech_estimate(days, every_summary_word_count):
    """Print how much speech the archive implies at the assumed pace."""
    seconds = [convert_words_to_speech_seconds(w) for w in every_summary_word_count]
    mean_seconds = statistics.mean(seconds)
    median_items = statistics.median([day["item_count"] for day in days])
    print(
        f"audio seconds/item at {WORDS_PER_MINUTE} wpm  "
        f"mean={mean_seconds:.1f}  p90={compute_percentile(seconds, 0.90):.1f}"
    )
    print(
        "audio MINUTES for a median day = "
        f"{median_items * mean_seconds / 60:.1f}"
    )


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    days = read_every_day(root)
    if not days:
        print(f"no digest files found under {root}/{DIGEST_GLOB}")
        return
    every_summary_word_count = [w for day in days for w in day["summary_words"]]

    print_recent_days(days)
    print_item_census(days, every_summary_word_count)
    if every_summary_word_count:
        print_summary_length(every_summary_word_count)
        print_speech_estimate(days, every_summary_word_count)


if __name__ == "__main__":
    main()
