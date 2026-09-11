/**
 * Arm one: kokoro-js, a purpose-built wrapper over ONNX Runtime.
 *
 * The model is held constant across arms so the difference measured here is
 * the library and nothing else. Everything about timing and output shape lives
 * in the shared recorder.
 */

import { readFileSync } from "node:fs";
import { KokoroTTS } from "kokoro-js";
import { runComparisonArm } from "../../../backend/utilities/measurement-recorder.mjs";

const MODEL_ID = process.env.MODEL_ID ?? "onnx-community/Kokoro-82M-v1.0-ONNX";
const QUANTISATION = process.env.QUANTISATION ?? "q8";
const VOICE = process.env.VOICE ?? "af_heart";
const CORPUS_PATH = new URL("../sample-summaries/summaries.json", import.meta.url);
const OUTPUT_PATH = new URL("../measurements/kokoro-js.json", import.meta.url).pathname.replace(/^\//, "");

const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));

console.log(`arm: kokoro-js   model: ${MODEL_ID} (${QUANTISATION})   voice: ${VOICE}`);
console.log(`corpus: ${corpus.summaries.length} summaries, ${corpus.totalWords} words\n`);

await runComparisonArm(
  {
    library: `kokoro-js@${JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).dependencies["kokoro-js"]}`,
    model: `${MODEL_ID} (${QUANTISATION})`,
    loadModel: async () => KokoroTTS.from_pretrained(MODEL_ID, { dtype: QUANTISATION, device: "cpu" }),
    synthesise: async (tts, text) => {
      const audio = await tts.generate(text, { voice: VOICE });
      const samples = audio.audio?.length ?? audio.data?.length ?? 0;
      const rate = audio.sampling_rate ?? 24000;
      return { audioSeconds: samples / rate, bytes: samples * 4 };
    },
  },
  corpus.summaries,
  OUTPUT_PATH,
);
