"""Benchmark a voice whose weights ship as GGUF.

WHY A THIRD ARM. `benchmark-model.mjs` calls a runtime that takes text and gives
back audio. `benchmark_genai_model.py` drives several ONNX graphs with a sampling
loop it writes itself. Neither can host these, because a GGUF voice is not one
model - it is two, and only the first of them is in the file.

THE THING THE FORMAT HIDES, and the reason this file has three builders rather
than one. Every model here is a CODEC LANGUAGE MODEL. The GGUF holds a backbone
LM that emits discrete audio codec tokens - not audio, not even spectrograms,
just integers. A second neural codec decoder turns those integers into a
waveform, and that decoder is NOT in the GGUF and does not run in llama.cpp. The
project's own vocabulary page already says it: "GGUF is a container; supporting
the container is not supporting the architecture inside it."

    Orpheus 3B   Llama-3.2-3B backbone  ->  SNAC 24 kHz      llama.cpp + torch
    NeuTTS Air   Qwen2.5-0.5B backbone  ->  NeuCodec         llama.cpp + onnx
    Magpie 357M  NeMo encoder-decoder   ->  NanoCodec        NeMo-Speech.cpp

Magpie is the sharpest case: its GGUF will not load in llama.cpp at all. It is an
encoder-decoder predicting eight codebooks with frame stacking, and NVIDIA ships
its own ggml-based runtime for it. So that arm shells out to a released binary
rather than pretending a Python loop can drive it.

WEIGHTS ARE STREAMED, NEVER COMMITTED, exactly as the ONNX arms do it. Everything
lands in the runner's Hugging Face cache and goes away with the runner.

Usage:
    MODEL=orpheus-3b-q4 python benchmark_gguf_model.py
"""

from __future__ import annotations

import os
import subprocess
import tarfile
import tempfile
import time
import urllib.request
import wave
from pathlib import Path

from benchmark_common import (
    load_spec,
    peak_memory_mb,
    result_dir_for,
    voice_the_corpus,
    write_manifest,
)

MODEL_ID_ENV = os.environ.get("MODEL", "")
THREADS = int(os.environ.get("GGUF_THREADS", str(os.cpu_count() or 4)))


def fetch_gguf(spec: dict) -> str:
    """Download the one quantisation this row names.

    A GGUF repository routinely carries twenty variants of the same weights -
    Orpheus publishes twenty-six, from 929 MB to 6.3 GB. Fetching the repository
    would pay forty gigabytes to measure two. The row names its file, so the run
    costs the variant rather than the catalogue.
    """
    from huggingface_hub import hf_hub_download

    return hf_hub_download(repo_id=spec["modelId"], filename=spec["ggufFile"])


def open_backbone(path: str, spec: dict):
    """Load a GGUF backbone under llama.cpp, on CPU, with no GPU offload."""
    from llama_cpp import Llama

    return Llama(
        model_path=path,
        n_ctx=int(spec.get("contextLength", 4096)),
        n_threads=THREADS,
        n_batch=512,
        n_gpu_layers=0,
        logits_all=False,
        verbose=False,
        seed=int(spec.get("seed", 1234)),
    )


# ------------------------------------------------------------------- Orpheus
def build_orpheus(spec: dict):
    """Orpheus 3B: a Llama backbone emitting SNAC codes.

    THE TOKEN ARITHMETIC IS THE WHOLE TRICK, and it is done here on raw token ids
    rather than by parsing "<custom_token_N>" strings the way the reference
    implementation does. The vocabulary places `<custom_token_N>` at id
    128256 + N, and the reference subtracts 10 from N, so a raw id T carries

        code = T - 128266 - (position within the frame) * 4096

    Working on ids skips a detokenise-and-reparse per token and cannot be fooled
    by a partial UTF-8 fragment arriving mid-token.

    Seven codes make one frame, and they do not belong to one codebook. SNAC is
    hierarchical - coarse, middle, fine - and the frame interleaves them as
    0 | 1 4 | 2 3 5 6. Getting that layout wrong yields audio-shaped noise rather
    than an error, which is why it is written out explicitly below.
    """
    import numpy as np
    import torch
    from snac import SNAC

    # THE ORPHEUS CONTROL TOKENS, from the official tokeniser layout rather than
    # inferred. Everything is an offset from the base Llama vocabulary size,
    # which is why they look arbitrary written as bare numbers:
    #
    #   128000 start_of_text     128256 + 1 = 128257 start_of_speech
    #   128009 end_of_text       128256 + 2 = 128258 end_of_speech
    #   128256 + 3 = 128259 start_of_human
    #   128256 + 4 = 128260 end_of_human
    #   128256 + 5 = 128261 start_of_ai
    #   128256 + 6 = 128262 end_of_ai
    #   128256 + 10 = 128266  the first audio token
    #
    # MEASURED 2026-09-14 AND THIS COST TWO RUNS. start_of_ai and
    # start_of_speech are the FIRST TWO TOKENS THE MODEL IS SUPPOSED TO EMIT.
    # Treating them as terminators - which "any low-numbered token ends the
    # utterance" does - stops generation on the first token every time, and the
    # arm reports an empty clip rather than a wrong one. Only end_of_speech and
    # end_of_ai actually end it.
    VOCAB = 128256
    START_OF_TEXT, END_OF_TEXT = 128000, 128009
    START_OF_HUMAN, END_OF_HUMAN = VOCAB + 3, VOCAB + 4
    STOP_TOKENS = {VOCAB + 2, VOCAB + 6}  # end_of_speech, end_of_ai
    AUDIO_BASE = VOCAB + 10
    CODES_A_FRAME = 7
    CODEBOOK = 4096

    voice = spec.get("voice", "tara")
    sample_rate = int(spec.get("sampleRate", 24000))
    max_tokens = int(spec.get("maxNewTokens", 1200))
    temperature = float(spec.get("temperature", 0.6))
    top_p = float(spec.get("topP", 0.9))
    repeat_penalty = float(spec.get("repeatPenalty", 1.1))

    backbone = open_backbone(fetch_gguf(spec), spec)
    torch.set_num_threads(THREADS)
    codec = SNAC.from_pretrained(spec["codecRepo"]).eval()

    def speak(text: str):
        # The item's text is DATA. It is tokenised as ordinary text with
        # special=False, so a summary containing "<|eot_id|>" is voiced rather
        # than obeyed - guardrail 11, at the one boundary where it bites.
        # add_bos supplies start_of_text, which the reference gets free from the
        # Hugging Face tokenizer call it wraps.
        body = backbone.tokenize(f"{voice}: {text}".encode("utf-8"), add_bos=True, special=False)
        if not body or body[0] != START_OF_TEXT:
            body = [START_OF_TEXT] + body
        prompt = [START_OF_HUMAN] + body + [END_OF_TEXT, END_OF_HUMAN]

        codes: list[int] = []
        seen: list[int] = []
        backbone.reset()
        for token in backbone.generate(
            prompt,
            temp=temperature,
            top_p=top_p,
            repeat_penalty=repeat_penalty,
        ):
            if len(seen) >= max_tokens or token in STOP_TOKENS:
                break
            seen.append(token)
            # A control or stray text token is SKIPPED, not fatal. Skipping also
            # does not advance the frame position, which is what keeps the
            # seven-code frame aligned.
            if token < AUDIO_BASE:
                continue
            code = token - AUDIO_BASE - (len(codes) % CODES_A_FRAME) * CODEBOOK
            if not 0 <= code < CODEBOOK:
                continue
            codes.append(code)

        frames = len(codes) // CODES_A_FRAME
        if frames == 0:
            # Say what the model actually emitted. "No audio" is not a
            # diagnosis; the first few token ids are.
            print(f"    no codes from {len(seen)} tokens, first: {seen[:8]}", flush=True)
            return np.zeros(0, dtype=np.float32), sample_rate

        coarse, middle, fine = [], [], []
        for f in range(frames):
            i = f * CODES_A_FRAME
            coarse.append(codes[i])
            middle.extend([codes[i + 1], codes[i + 4]])
            fine.extend([codes[i + 2], codes[i + 3], codes[i + 5], codes[i + 6]])

        layers = [
            torch.tensor([coarse], dtype=torch.int32),
            torch.tensor([middle], dtype=torch.int32),
            torch.tensor([fine], dtype=torch.int32),
        ]
        with torch.inference_mode():
            wav = codec.decode(layers)
        return wav.squeeze().detach().cpu().numpy().astype(np.float32), sample_rate

    return speak, sample_rate


# ------------------------------------------------------------------- NeuTTS
def build_neutts(spec: dict):
    """NeuTTS Air, through its own library rather than a reimplementation.

    Guardrail 8 - the runtime is a library, not something we write. Neuphonic
    publishes the backbone-plus-codec plumbing, so this builder's whole job is to
    hand it local file paths and a reference voice.

    REFERENCE AUDIO IS MANDATORY. NeuTTS is a cloning model: it has no built-in
    speaker, and `infer` takes reference codes and the reference transcript
    alongside the text. The samples live in the upstream GitHub repository rather
    than on Hugging Face, which is convenient here because GitHub is not gated.
    """
    import numpy as np
    from huggingface_hub import hf_hub_download
    from neutts import NeuTTS

    sample_rate = int(spec.get("sampleRate", 24000))
    reference = spec.get("reference", {})
    ref_name = reference.get("name", "dave")
    ref_base = reference.get("baseUrl", "").rstrip("/")

    workdir = Path(tempfile.mkdtemp(prefix="neutts-"))
    ref_wav = workdir / f"{ref_name}.wav"
    urllib.request.urlretrieve(f"{ref_base}/{ref_name}.wav", ref_wav)
    ref_text = (
        urllib.request.urlopen(f"{ref_base}/{ref_name}.txt").read().decode("utf-8").strip()
    )

    backbone_path = fetch_gguf(spec)
    codec_repo = spec["codecRepo"]
    if spec.get("codecFile"):
        codec_repo = hf_hub_download(repo_id=codec_repo, filename=spec["codecFile"])

    tts = NeuTTS(
        backbone_repo=backbone_path,
        backbone_device="cpu",
        codec_repo=codec_repo,
        codec_device="cpu",
        seed=int(spec.get("seed", 1234)),
    )
    ref_codes = tts.encode_reference(ref_wav)

    def speak(text: str):
        wav = tts.infer(
            text,
            ref_codes,
            ref_text,
            temperature=float(spec.get("temperature", 1.0)),
            top_k=int(spec.get("topK", 50)),
        )
        return np.asarray(wav, dtype=np.float32), sample_rate

    return speak, sample_rate


# -------------------------------------------------------------------- Magpie
def install_nemo_speech(spec: dict) -> str:
    """Fetch NVIDIA's released CPU runtime rather than building it.

    The project prefers a mature upstream binary to a source build (guardrail 8),
    and the cost argument is decisive: the linux-x86_64 CPU archive is 4.4 MB,
    against a cmake build needing Ninja, a C++17 toolchain and SentencePiece
    headers on a 4 vCPU runner.
    """
    url = spec["runtimeArchive"]
    target = Path(tempfile.mkdtemp(prefix="nemo-speech-"))
    archive = target / "runtime.tar.gz"
    urllib.request.urlretrieve(url, archive)
    with tarfile.open(archive) as tar:
        tar.extractall(target)
    for candidate in target.rglob("nemo-speech"):
        if candidate.is_file():
            candidate.chmod(0o755)
            return str(candidate)
    raise SystemExit(f"no nemo-speech binary inside {url}")


def build_magpie(spec: dict):
    """MagpieTTS through NeMo-Speech.cpp, because llama.cpp cannot load it.

    This arm measures a subprocess, and says so. The CLI loads its weights on
    every invocation, so the figure it produces INCLUDES model load per chunk and
    is not directly comparable with an in-process arm that loads once. That is a
    property of the runtime as shipped, not a flaw in the measurement, and the
    manifest records it.

    The item's text is passed as an argv element to a process started without a
    shell. No shell means no word splitting and no metacharacters, which is the
    structural control guardrail 11 asks for at this boundary.
    """
    import numpy as np

    binary = install_nemo_speech(spec)
    sample_rate = int(spec.get("sampleRate", 22050))
    voice = spec.get("voice")
    workdir = Path(tempfile.mkdtemp(prefix="magpie-out-"))

    env = dict(os.environ)
    env.setdefault("HF_HUB_ENABLE_HXFER", "0")

    # Pull the model stack once, so the first clip is not charged the download.
    subprocess.run([binary, "pull", spec.get("runtimeModel", "magpie")], env=env, check=False)

    def speak(text: str):
        out = workdir / "clip.wav"
        if out.exists():
            out.unlink()
        argv = [binary, "synthesize", text, "--output", str(out), "--device", "cpu"]
        if voice:
            argv += ["--voice", voice]
        done = subprocess.run(argv, env=env, capture_output=True, text=True)
        if not out.exists():
            raise RuntimeError(
                f"nemo-speech produced no audio (exit {done.returncode})\n"
                f"{done.stdout[-800:]}\n{done.stderr[-800:]}"
            )
        with wave.open(str(out), "rb") as handle:
            rate = handle.getframerate()
            pcm = handle.readframes(handle.getnframes())
        samples = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32767.0
        return samples, rate

    return speak, sample_rate


BUILDERS = {"orpheus": build_orpheus, "neutts": build_neutts, "magpie": build_magpie}


def main() -> int:
    if not MODEL_ID_ENV:
        raise SystemExit("MODEL must be set")

    spec = load_spec(MODEL_ID_ENV)
    family = spec.get("family")
    if family not in BUILDERS:
        raise SystemExit(
            f"{MODEL_ID_ENV} has family '{family}', which has no builder. "
            f"Wired: {', '.join(sorted(BUILDERS))}"
        )

    print(f"model {MODEL_ID_ENV}")
    print(f"  backbone {spec['modelId']}  {spec.get('ggufFile', '-')}")
    print(f"  codec    {spec.get('codecRepo', spec.get('runtimeArchive', '-'))}")
    print(f"  ~{spec.get('sizeGb', '?')} GB streamed to the runner cache, {THREADS} threads")

    started = time.time()
    speak, sample_rate = BUILDERS[family](spec)
    load_seconds = time.time() - started
    print(f"  loaded in {load_seconds:.1f}s, peak {peak_memory_mb()} MB", flush=True)

    result_dir = result_dir_for(MODEL_ID_ENV)
    clips = voice_the_corpus(speak, sample_rate, result_dir)
    if not clips:
        raise SystemExit("no clip produced any audio - the arm has failed")

    manifest = write_manifest(
        result_dir,
        MODEL_ID_ENV,
        spec,
        runtime=spec["runtime"],
        clips=clips,
        load_seconds=load_seconds,
        extra={
            "sampleRate": sample_rate,
            "threads": THREADS,
            "codec": spec.get("codecRepo"),
            "ggufFile": spec.get("ggufFile"),
            "loadsPerClip": family == "magpie",
        },
    )
    print(
        f"\nwrote {len(clips)} clips, rtf {manifest['metrics']['realTimeFactor']}, "
        f"peak {peak_memory_mb()} MB"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
