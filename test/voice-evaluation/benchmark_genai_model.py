"""Benchmark an autoregressive ONNX voice that needs a generation loop.

WHY THIS EXISTS SEPARATELY FROM THE NODE HARNESS. Chatterbox, Qwen3-TTS and
Higgs do not ship one graph you can call. They ship four or five - an embedding
table, a language model, a speech encoder, a conditional decoder - driven by a
sampling loop the caller has to write. `kokoro-js` and the transformers.js
pipeline both assume one call in and audio out, so neither can host them.

WEIGHTS ARE STREAMED, NEVER COMMITTED. The repository carries no model and never
will. Weights land in the runner's Hugging Face cache, are memory-mapped for the
run, and go away with the runner. The cache is keyed per model in the workflow,
so a second run skips the download without the bytes ever reaching git. This is
the shape `yen-idhazh` uses for its summariser: pin a version, cache it, verify
it, use it, discard it.

THE CEILING IS REAL AND IT IS RAM. A runner has 16 GB and 4 vCPU. ONNX Runtime
memory-maps the `.onnx_data` sidecars rather than reading them into the heap, so
a 4.6 GB model is tractable where a naive load would not be - but the practical
limit is around 9-10 GB of weights, and a model past that does not get an arm.

Usage:
    MODEL=chatterbox-multilingual python benchmark_genai_model.py
"""

from __future__ import annotations

import json
import os
import resource
import sys
import time
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "voices.config.json"
CORPUS_PATH = HERE.parent / "onnx-runtime-comparison" / "real-summaries" / "summaries.json"
SUITE_PATH = HERE.parent / "onnx-runtime-comparison" / "verbalization-suite.json"

MODEL_ID_ENV = os.environ.get("MODEL", "")
MAX_WORDS_A_CHUNK = int(os.environ.get("MAX_WORDS_A_CHUNK", "40"))
MAX_ITEMS = int(os.environ.get("MAX_ITEMS", "0"))  # 0 = the whole corpus
SHARD_INDEX = int(os.environ.get("SHARD_INDEX", "0"))
SHARD_TOTAL = max(1, int(os.environ.get("SHARD_TOTAL", "1")))


def peak_memory_mb() -> int:
    """Peak resident set for this process, which is what decides deployability."""
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(peak / 1024)  # ru_maxrss is KiB on Linux


def split_into_chunks(text: str, max_words: int) -> list[str]:
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
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    for model in config["models"]:
        if model["id"] == model_key:
            return model
    ids = ", ".join(m["id"] for m in config["models"])
    raise SystemExit(f"unknown MODEL '{model_key}'. Configured: {ids}")


def build_chatterbox(spec: dict):
    """Chatterbox multilingual, following the recipe its own model card publishes.

    Returns a callable that takes text and gives back (samples, sample_rate).
    The four sessions stay open for the whole run: reloading them per sentence
    would measure the loader rather than the model.

    The watermarker the card applies is deliberately skipped. It is a real
    feature and the right default for anything published, but it is a second
    model on the critical path and this is a speed measurement of the voice.
    Anything that ships from here turns it back on.
    """
    import numpy as np
    import onnxruntime
    from huggingface_hub import hf_hub_download
    from transformers import AutoTokenizer

    repo = spec["modelId"]
    sample_rate = spec.get("sampleRate", 24000)
    language = spec.get("language", "en")
    exaggeration = float(spec.get("exaggeration", 0.5))
    max_new_tokens = int(spec.get("maxNewTokens", 1000))

    START_SPEECH_TOKEN = 6561
    STOP_SPEECH_TOKEN = 6562
    NUM_HIDDEN_LAYERS, NUM_KV_HEADS, HEAD_DIM = 30, 16, 64

    # A sidecar `.onnx_data` must sit beside its graph, so each pair is fetched
    # into the same cache directory and only the graph path is kept.
    def fetch(name: str) -> str:
        path = hf_hub_download(repo_id=repo, filename=f"onnx/{name}.onnx")
        try:
            hf_hub_download(repo_id=repo, filename=f"onnx/{name}.onnx_data")
        except Exception:
            pass  # not every graph has one
        return path

    options = onnxruntime.SessionOptions()
    options.intra_op_num_threads = int(os.environ.get("ORT_THREADS", "4"))
    options.graph_optimization_level = onnxruntime.GraphOptimizationLevel.ORT_ENABLE_ALL

    speech_encoder = onnxruntime.InferenceSession(fetch("speech_encoder"), options)
    embed_tokens = onnxruntime.InferenceSession(fetch("embed_tokens"), options)
    language_model = onnxruntime.InferenceSession(fetch("language_model"), options)
    conditional_decoder = onnxruntime.InferenceSession(fetch("conditional_decoder"), options)

    tokenizer = AutoTokenizer.from_pretrained(repo)
    voice_path = hf_hub_download(repo_id=repo, filename="default_voice.wav")

    import librosa

    reference, _ = librosa.load(voice_path, sr=sample_rate)
    reference = reference[np.newaxis, :].astype(np.float32)

    def penalise_repeats(seen: np.ndarray, scores: np.ndarray, penalty: float = 1.2) -> np.ndarray:
        """Divide the score of a token already produced, so it stops looping."""
        picked = np.take_along_axis(scores, seen, axis=1)
        picked = np.where(picked < 0, picked * penalty, picked / penalty)
        out = scores.copy()
        np.put_along_axis(out, seen, picked, axis=1)
        return out

    def speak(text: str):
        prompt = f"[{language}]{text}"
        input_ids = tokenizer(prompt, return_tensors="np")["input_ids"].astype(np.int64)
        position_ids = np.where(
            input_ids >= START_SPEECH_TOKEN, 0, np.arange(input_ids.shape[1])[np.newaxis, :] - 1
        ).astype(np.int64)

        embed_inputs = {
            "input_ids": input_ids,
            "position_ids": position_ids,
            "exaggeration": np.array([exaggeration], dtype=np.float32),
        }

        produced = np.array([[START_SPEECH_TOKEN]])
        past = {}
        attention_mask = None
        prompt_token = ref_x_vector = prompt_feat = None

        for step in range(max_new_tokens):
            inputs_embeds = embed_tokens.run(None, embed_inputs)[0]

            if step == 0:
                cond_emb, prompt_token, ref_x_vector, prompt_feat = speech_encoder.run(
                    None, {"audio_values": reference}
                )
                inputs_embeds = np.concatenate((cond_emb, inputs_embeds), axis=1)
                batch, seq_len, _ = inputs_embeds.shape
                past = {
                    f"past_key_values.{layer}.{kv}": np.zeros(
                        [batch, NUM_KV_HEADS, 0, HEAD_DIM], dtype=np.float32
                    )
                    for layer in range(NUM_HIDDEN_LAYERS)
                    for kv in ("key", "value")
                }
                attention_mask = np.ones((batch, seq_len), dtype=np.int64)

            logits, *present = language_model.run(
                None, dict(inputs_embeds=inputs_embeds, attention_mask=attention_mask, **past)
            )
            next_logits = penalise_repeats(produced, logits[:, -1, :])
            next_token = np.argmax(next_logits, axis=-1, keepdims=True).astype(np.int64)
            produced = np.concatenate((produced, next_token), axis=-1)
            if (next_token.flatten() == STOP_SPEECH_TOKEN).all():
                break

            embed_inputs["input_ids"] = next_token
            embed_inputs["position_ids"] = np.full((input_ids.shape[0], 1), step + 1, dtype=np.int64)
            attention_mask = np.concatenate(
                [attention_mask, np.ones((attention_mask.shape[0], 1), dtype=np.int64)], axis=1
            )
            for index, key in enumerate(past):
                past[key] = present[index]

        speech_tokens = np.concatenate([prompt_token, produced[:, 1:-1]], axis=1)
        wav = conditional_decoder.run(
            None,
            {
                "speech_tokens": speech_tokens,
                "speaker_embeddings": ref_x_vector,
                "speaker_features": prompt_feat,
            },
        )[0]
        return np.squeeze(wav, axis=0), sample_rate

    return speak, sample_rate


BUILDERS = {"chatterbox": build_chatterbox}


def main() -> int:
    if not MODEL_ID_ENV:
        raise SystemExit("MODEL must be set")

    spec = load_spec(MODEL_ID_ENV)
    family = spec.get("family")
    if family not in BUILDERS:
        raise SystemExit(f"{MODEL_ID_ENV} has family '{family}', which has no builder")

    print(f"model {MODEL_ID_ENV}")
    print(f"  weights {spec['modelId']}  ~{spec.get('sizeGb', '?')} GB, streamed to the runner cache")

    started = time.time()
    speak, sample_rate = BUILDERS[family](spec)
    load_seconds = time.time() - started
    print(f"  loaded in {load_seconds:.1f}s, peak {peak_memory_mb()} MB", flush=True)

    # Set by a sharded run so each shard writes somewhere of its own.
    result_dir = (
        Path(os.environ["RESULT_DIR"])
        if os.environ.get("RESULT_DIR")
        else HERE / "results" / MODEL_ID_ENV
    )
    (result_dir / "summaries").mkdir(parents=True, exist_ok=True)
    (result_dir / "verbalization").mkdir(parents=True, exist_ok=True)

    corpus = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    summaries = corpus["summaries"]
    whole_corpus_size = len(summaries)
    if SHARD_TOTAL > 1:
        # Round-robin rather than contiguous blocks: summaries vary in length
        # by more than 10x, so a contiguous slice would hand one shard every
        # long one and the fan-out would finish no sooner than a single job.
        summaries = [s for i, s in enumerate(summaries) if i % SHARD_TOTAL == SHARD_INDEX]
        print(
            f"shard {SHARD_INDEX + 1}/{SHARD_TOTAL}: "
            f"{len(summaries)}/{whole_corpus_size} summaries",
            flush=True,
        )
    summaries = summaries[: MAX_ITEMS or None]

    clips = []
    for sample in summaries:
        chunks = split_into_chunks(sample["text"], MAX_WORDS_A_CHUNK)
        began = time.time()
        pieces = [speak(chunk)[0] for chunk in chunks]
        wall_ms = int((time.time() - began) * 1000)

        import numpy as np

        samples = np.concatenate(pieces)
        audio_seconds = len(samples) / sample_rate
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
        print(f"  {sample['id']}  {sample['words']:4d}w  {audio_seconds:.1f}s", flush=True)

    # The same free metrics the Node arm computes, so a Python arm is not a
    # second-class row in the comparison table. Long-form drift needs chunk
    # timings this runner does not yet record, so it is absent rather than zero.
    audio_total = sum(c["audioSeconds"] for c in clips)
    words_total = sum(c["words"] for c in clips)
    wall_total = sum(c["wallClockMs"] for c in clips) / 1000
    characters = sum(len(c["text"]) for c in clips)
    rates = sorted(c["wordsAMinute"] for c in clips)
    mean_rate = sum(rates) / len(rates) if rates else 0.0
    variance = sum((r - mean_rate) ** 2 for r in rates) / (len(rates) - 1) if len(rates) > 1 else 0.0
    deviation = variance ** 0.5

    metrics = {
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

    manifest = {
        "schemaVersion": "2026-09-13",
        "metrics": metrics,
        "model": MODEL_ID_ENV,
        "modelId": spec["modelId"],
        "runtime": "onnxruntime-python",
        "voice": spec.get("voice"),
        "accent": spec.get("accent"),
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
            "words": words_total,
            "audioSeconds": round(audio_total, 2),
            "wallSeconds": round(wall_total, 1),
            "realTimeFactor": metrics["realTimeFactor"],
            "wordsAMinute": metrics["speakingRate"],
            "bytes": sum(c["bytes"] for c in clips),
        },
    }
    (result_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"\nwrote {len(clips)} clips, peak {peak_memory_mb()} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
