/**
 * One interface over several text-to-speech runtimes, driven by config.
 *
 * The models live in `voices.config.json` as data. Adding one is a row there,
 * not a change here - a new adapter is only needed when a model arrives on a
 * runtime nobody has wired yet, and there are exactly three runtimes.
 *
 * Every adapter returns the same thing: Float32 samples and a sample rate. What
 * differs is how the weights are fetched and what the runtime calls its entry
 * point, and that is the part worth hiding.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CONFIG_PATH = fileURLToPath(new URL("./voices.config.json", import.meta.url));
export const CONFIG = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));

/** Normalise whatever a runtime returns into Float32 samples. */
function samplesOf(output) {
  const data = output.audio ?? output.data ?? output;
  return data instanceof Float32Array ? data : Float32Array.from(data);
}

/**
 * Kokoro and anything else in the StyleTTS2 family that `kokoro-js` will load.
 *
 * KittenTTS is the same architecture at a fifth the parameters. Whether
 * `kokoro-js` loads its weights is the open question those rows exist to
 * answer: the voice ids differ, and a wrong one fails deep inside a phonemiser
 * rather than at load, so the voice is checked against the model's own list
 * while there is still a useful error to report.
 */
function kokoroAdapter(spec) {
  let tts = null;
  return {
    ...spec,
    async load() {
      const { KokoroTTS } = await import("kokoro-js");
      tts = await KokoroTTS.from_pretrained(spec.modelId, { dtype: spec.dtype, device: "cpu" });
      if (tts.voices && spec.voice && !(spec.voice in tts.voices)) {
        throw new Error(
          `voice "${spec.voice}" not in ${spec.modelId}. Available: ${Object.keys(tts.voices).join(", ")}`,
        );
      }
    },
    async speak(text) {
      const output = await tts.generate(text, { voice: spec.voice });
      return { samples: samplesOf(output), sampleRate: output.sampling_rate ?? 24000 };
    },
  };
}

/**
 * Supertonic, VITS/MMS and SpeechT5, through the official transformers.js
 * text-to-speech pipeline.
 *
 * Supertonic is the pipeline's own default and HARD-FAILS without a speaker
 * embedding - the pipeline throws rather than choosing one, so the embedding is
 * part of the configuration and not an optional extra. VITS needs none.
 */
function transformersAdapter(spec) {
  let synth = null;
  return {
    ...spec,
    async load() {
      const { pipeline } = await import("@huggingface/transformers");
      synth = await pipeline("text-to-speech", spec.modelId, { dtype: spec.dtype, device: "cpu" });
    },
    async speak(text) {
      const options = spec.speakerEmbeddings ? { speaker_embeddings: spec.speakerEmbeddings } : {};
      const output = await synth(text, options);
      return {
        samples: samplesOf(output),
        sampleRate: output.sampling_rate ?? spec.sampleRate ?? 24000,
      };
    },
  };
}

const RUNTIMES = {
  "kokoro-js": kokoroAdapter,
  "transformers.js": transformersAdapter,
};

/** Build the adapter for one configured model id. */
export function adapterFor(id) {
  const spec = CONFIG.models.find((m) => m.id === id);
  if (!spec) {
    throw new Error(`unknown model "${id}". Configured: ${CONFIG.models.map((m) => m.id).join(", ")}`);
  }
  if (spec.blocked) throw new Error(`${id} is blocked: ${spec.blocked}`);
  const build = RUNTIMES[spec.runtime];
  if (!build) throw new Error(`${id} needs runtime "${spec.runtime}", which is not wired`);
  return build(spec);
}

/** Every model the benchmark will actually attempt. */
export function enabledModels() {
  return CONFIG.models.filter((m) => m.enabled && RUNTIMES[m.runtime]).map((m) => m.id);
}

/** Everything configured, including what cannot run and why - for the report. */
export function allModels() {
  return CONFIG.models;
}
