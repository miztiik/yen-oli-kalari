"""Price the audio: storage and runner time against the ceilings GitHub sets.

Answers two questions the audio design cannot proceed without. How many bytes a
day does voicing cost, and how long does making them take? Storage turns out to
be the binding constraint: at opus@24k a median day is about 40 MB, which fills
the 1 GB published site in 26 days, while compute only busts the 6 h job cap at
a real-time factor of 3.0 and above.

Usage:
    python backend/utilities/price_audio.py

Inputs are measured, not estimated - 2026-09-11, over 22 committed days of
yen-idhazh digests (8,772 items, mean 90.2 words a summary). The speaking pace
is the one assumption, and it is declared. Ceilings are GitHub's: a 1 GB
published Pages site and 6 h a job.
"""

MEDIAN_ITEMS_A_DAY = 370
MEAN_WORDS_A_SUMMARY = 90.2
WORDS_PER_MINUTE = 150  # assumption: a normal news-read pace

# Codec bitrates in kbps, mono, speech.
CODEC_BITRATES_KBPS = {"opus@16k": 16, "opus@24k": 24, "opus@32k": 32, "mp3@64k": 64}
BUDGET_CODEC = "opus@24k"
PAGES_CAP_GB = 1.0
JOB_CAP_H = 6.0
REAL_TIME_FACTORS = (0.1, 0.3, 1.0, 3.0)

SCOPES = [
    ("every item", MEDIAN_ITEMS_A_DAY),
    ("top 50", 50),
    ("top 20", 20),
    ("top 10", 10),
]


def compute_speech_seconds_an_item():
    """Return how long one summary takes to speak at the assumed pace."""
    return MEAN_WORDS_A_SUMMARY / WORDS_PER_MINUTE * 60


def compute_speech_minutes_a_day(item_count):
    """Return how many minutes of speech item_count items produce."""
    return item_count * compute_speech_seconds_an_item() / 60


def compute_megabytes_a_day(item_count, bitrate_kbps):
    """Return how many megabytes a day item_count items cost at bitrate_kbps."""
    return item_count * compute_speech_seconds_an_item() * bitrate_kbps / 8 / 1000


def compute_days_until_cap(megabytes_a_day):
    """Return how many days of audio fit in the published site cap."""
    return PAGES_CAP_GB * 1024 / megabytes_a_day


def compute_wall_clock_hours(item_count, real_time_factor):
    """Return how long voicing item_count items takes at real_time_factor."""
    return item_count * compute_speech_seconds_an_item() * real_time_factor / 3600


def print_storage_table():
    """Print minutes and megabytes a day for every scope and codec."""
    print(f"{'scope':<22}{'items':>7}{'min/day':>9}", end="")
    for codec in CODEC_BITRATES_KBPS:
        print(f"{codec + ' MB/day':>16}", end="")
    print()

    for label, item_count in SCOPES:
        print(
            f"{label:<22}{item_count:>7}"
            f"{compute_speech_minutes_a_day(item_count):>9.1f}",
            end="",
        )
        for bitrate_kbps in CODEC_BITRATES_KBPS.values():
            print(f"{compute_megabytes_a_day(item_count, bitrate_kbps):>16.1f}", end="")
        print()


def print_days_until_cap():
    """Print how long each scope takes to fill the published site."""
    print(f"\n--- days until the {PAGES_CAP_GB} GB Pages cap, at {BUDGET_CODEC} ---")
    bitrate_kbps = CODEC_BITRATES_KBPS[BUDGET_CODEC]
    for label, item_count in SCOPES:
        days = compute_days_until_cap(compute_megabytes_a_day(item_count, bitrate_kbps))
        print(f"{label:<22}{days:>8.0f} days   ({days / 365:.2f} years)")


def print_wall_clock_table():
    """Print wall-clock against the job cap, by real-time factor."""
    print(f"\n--- runner wall-clock against the {JOB_CAP_H} h job cap ---")
    print(f"{'scope':<22}", end="")
    for real_time_factor in REAL_TIME_FACTORS:
        print(f"{'RTF ' + format(real_time_factor, '.1f'):>10}", end="")
    print()

    for label, item_count in SCOPES:
        print(f"{label:<22}", end="")
        for real_time_factor in REAL_TIME_FACTORS:
            hours = compute_wall_clock_hours(item_count, real_time_factor)
            busts = "" if hours < JOB_CAP_H else "  BUST"
            print(f"{hours:>8.2f}h{busts:<2}", end="")
        print()


def main():
    print(f"seconds of audio per item = {compute_speech_seconds_an_item():.1f}")
    print_storage_table()
    print_days_until_cap()
    print_wall_clock_table()


if __name__ == "__main__":
    main()
