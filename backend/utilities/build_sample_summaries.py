"""Build the fixed sample of summaries both comparison arms synthesise.

Samples real upstream summaries across the measured length distribution - p10,
p50, p90 and the longest - so a real-time factor is measured against text this
project will actually voice rather than a convenient sentence. The sample is
committed, so both arms and every future run read identical input.

Usage:
    python backend/utilities/build_sample_summaries.py <upstream-checkout> [count]
"""

import glob
import json
import os
import sys

DIGEST_GLOB = "frontend/public/digest/*/*/*/digest.json"
OUTPUT_PATH = "test/onnx-runtime-comparison/sample-summaries/summaries.json"
DEFAULT_COUNT = 12


def read_every_summary(upstream_root):
    """Return every summary in the upstream archive with its word count."""
    summaries = []
    for path in sorted(glob.glob(os.path.join(upstream_root, DIGEST_GLOB))):
        with open(path, encoding="utf-8") as handle:
            day = json.load(handle)
        for item in day.get("items", []):
            text = (item.get("summary") or "").strip()
            if text:
                summaries.append({"words": len(text.split()), "text": text})
    return summaries


def pick_across_distribution(summaries, count):
    """Pick summaries spread across the length distribution, shortest first."""
    ordered = sorted(summaries, key=lambda s: s["words"])
    if not ordered:
        return []
    last = len(ordered) - 1
    fractions = [i / (count - 1) for i in range(count)] if count > 1 else [0.5]
    picked, seen = [], set()
    for fraction in fractions:
        index = min(last, int(round(fraction * last)))
        while index in seen and index < last:
            index += 1
        seen.add(index)
        picked.append(ordered[index])
    return picked


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    upstream_root = sys.argv[1]
    count = int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_COUNT

    summaries = read_every_summary(upstream_root)
    if not summaries:
        print(f"no summaries found under {upstream_root}/{DIGEST_GLOB}")
        return 1

    picked = pick_across_distribution(summaries, count)
    payload = {
        "note": "Fixed input for the ONNX runtime comparison. Committed so every arm reads identical text.",
        "sampledFrom": len(summaries),
        "totalWords": sum(s["words"] for s in picked),
        "summaries": [
            {"id": f"sample-{i:02d}", "words": s["words"], "text": s["text"]}
            for i, s in enumerate(picked, 1)
        ],
    }
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    print(f"sampled {len(picked)} of {len(summaries)} summaries -> {OUTPUT_PATH}")
    for entry in payload["summaries"]:
        print(f"  {entry['id']}  {entry['words']:>4} words")
    print(f"total {payload['totalWords']} words")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
