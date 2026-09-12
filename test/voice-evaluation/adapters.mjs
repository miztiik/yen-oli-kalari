/**
 * One interface over several text-to-speech runtimes, so a benchmark can add a
 * model without the harness learning a new shape.
 *
 * Every adapter returns the same thing: Float32 samples and a sample rate. What
 * differs is how the weights are fetched and what the runtime calls its entry
 * point, and that is exactly the part worth hiding.
 *
 * WHAT IS DELIBERATELY ABSENT, and why - researched 2026-09-13:
 *
 *   CosyVoice 2.0   Not pip-installable, and NOT an ONNX model: the LLM, flow
 *                   and vocoder are 3.3 GB of PyTorch `.pt`, with ONNX used
 *                   only for three helpers around them. Needs pynini, which
 *                   builds OpenFst from source.
 *   Parler GGUF     Needs TTS.cpp built against a PATCHED ggml fork, with zero
 *                   prebuilt releases and a README warning it is macOS-only.
 *                   Its own author measures RTF 1.112 on an M1 Max and
 *                   recommends Kokoro instead.
 *   Chatterbox      Runs CPU-only and ships a default voice, so it is genuinely
 *                   possible - but it pulls ~3.2 GB of weights and pins
 *                   torch==2.6.0 and gradio==6.8.0 as hard dependencies. It is
 *                   a Python job rather than a Node one, so it gets its own
 *                   workflow arm rather than an adapter here.
 *
 * A NOTE ON transformers.js: its text-to-speech pipeline supports exactly four
 * architectures - supertonic, vits, speecht5 and musicgen. Kokoro and KittenTTS
 * are `style_text_to_speech_2`, which is registered only as an encoder and will
 * throw `Unsupported model type` from that pipeline. They go through kokoro-js.
 */

/** Normalise whatever a runtime returns into Float32 samples. */
function samplesOf(output) {
  const data = output.audio ?? output.data ?? output;
  return data instanceof Float32Array ? data : Float32Array.from(data);
}

/**
 * Kokoro and anything else in the StyleTTS2 family that `kokoro-js` will load.
 *
 * KittenTTS is the same architecture at a fifth the parameters, so it is worth
 * trying here before anything more elaborate is built for it.
 */
export function kokoroAdapter({ modelId, dtype, voice }) {
  let tts = null;
  return {
    id: `${modelId}:${dtype}`,
    runtime: "kokoro-js",
    modelId,
    dtype,
    voice,
    async load() {
      const { KokoroTTS } = await import("kokoro-js");
      tts = await KokoroTTS.from_pretrained(modelId, { dtype, device: "cpu" });
    },
    async speak(text) {
      const output = await tts.generate(text, { voice });
      return { samples: samplesOf(output), sampleRate: output.sampling_rate ?? 24000 };
    },
  };
}

/**
 * Supertonic, VITS/MMS and SpeechT5, through the official transformers.js
 * text-to-speech pipeline.
 *
 * Supertonic is the pipeline's own default as of 2026, and it HARD-FAILS
 * without a speaker embedding - the pipeline throws rather than picking one, so
 * the embedding is part of the adapter's configuration and not an optional
 * extra. VITS needs none.
 */
export function transformersAdapter({ modelId, dtype, speakerEmbeddings, sampleRate }) {
  let synth = null;
  return {
    id: `${modelId}:${dtype}`,
    runtime: "transformers.js",
    modelId,
    dtype,
    voice: speakerEmbeddings ? speakerEmbeddings.split("/").pop() : "default",
    async load() {
      const { pipeline } = await import("@huggingface/transformers");
      synth = await pipeline("text-to-speech", modelId, { dtype, device: "cpu" });
    },
    async speak(text) {
      const options = speakerEmbeddings ? { speaker_embeddings: speakerEmbeddings } : {};
      const output = await synth(text, options);
      return { samples: samplesOf(output), sampleRate: output.sampling_rate ?? sampleRate ?? 24000 };
    },
  };
}

/**
 * The models this benchmark knows how to run, and how.
 *
 * A row here is a claim that the model loads and speaks on a 4 vCPU runner with
 * no GPU and no manual step. Anything that needs a build, a patched fork or a
 * reference recording does not belong in this table.
 */
export const ADAPTERS = {
  "kokoro-fp32": () =>
    kokoroAdapter({ modelId: "onnx-community/Kokoro-82M-v1.0-ONNX", dtype: "fp32", voice: "af_heart" }),
  "kokoro-q8": () =>
    kokoroAdapter({ modelId: "onnx-community/Kokoro-82M-v1.0-ONNX", dtype: "q8", voice: "af_heart" }),
  "kokoro-q4": () =>
    kokoroAdapter({ modelId: "onnx-community/Kokoro-82M-v1.0-ONNX", dtype: "q4", voice: "af_heart" }),

  /* 15M against the incumbent's 82M, same architecture family, Apache-2.0.
     Upstream warns about its int8 build, so fp32 only. */
  "kitten-nano-fp32": () =>
    kokoroAdapter({ modelId: "onnx-community/KittenTTS-Nano-v0.8-ONNX", dtype: "fp32", voice: "expr-voice-2-f" }),
  "kitten-mini-fp32": () =>
    kokoroAdapter({ modelId: "onnx-community/KittenTTS-Mini-v0.8-ONNX", dtype: "fp32", voice: "expr-voice-2-f" }),

  /* The transformers.js default. OpenRAIL rather than Apache, and its upstream
     repository is archived - both are recorded in the model survey. */
  "supertonic-fp32": () =>
    transformersAdapter({
      modelId: "onnx-community/Supertonic-TTS-ONNX",
      dtype: "fp32",
      speakerEmbeddings:
        "https://huggingface.co/onnx-community/Supertonic-TTS-ONNX/resolve/main/voices/F1.bin",
      sampleRate: 44100,
    }),

  /* VITS needs no speaker embedding, which makes it the cheapest possible
     control: if the harness can run this, the harness is not the problem. */
  "mms-eng-fp32": () =>
    transformersAdapter({ modelId: "Xenova/mms-tts-eng", dtype: "fp32", sampleRate: 16000 }),
};
