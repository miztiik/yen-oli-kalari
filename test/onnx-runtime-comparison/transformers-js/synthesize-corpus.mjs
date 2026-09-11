/**
 * Arm two: transformers.js, the general-purpose pipeline library.
 *
 * The model is held constant across arms so the difference measured here is
 * the library and nothing else. Everything about timing and output shape lives
 * in the shared recorder.
 */

import { readFileSync } from "node:fs";
import { StyleTextToSpeech2Model, AutoTokenizer, Tensor } from "@huggingface/transformers";
import { runComparisonArm } from "../../../backend/utilities/measurement-recorder.mjs";

const MODEL_ID = process.env.MODEL_ID ?? "onnx-community/Kokoro-82M-v1.0-ONNX";
const QUANTISATION = process.env.QUANTISATION ?? "q8";
const VOICE = process.env.VOICE ?? "af_heart";
const SAMPLE_RATE = 24000;
const CORPUS_PATH = new URL("../sample-summaries/summaries.json", import.meta.url);
const OUTPUT_PATH = new URL("../measurements/transformers-js.json", import.meta.url).pathname.replace(/^\//, "");

const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));

console.log(`arm: transformers.js   model: ${MODEL_ID} (${QUANTISATION})   voice: ${VOICE}`);
console.log(`corpus: ${corpus.summaries.length} summaries, ${corpus.totalWords} words\n`);

await runComparisonArm(
  {
    library: `@huggingface/transformers@${JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).dependencies["@huggingface/transformers"]}`,
    model: `${MODEL_ID} (${QUANTISATION})`,
    loadModel: async () => {
      const model = await StyleTextToSpeech2Model.from_pretrained(MODEL_ID, {
        dtype: QUANTISATION,
        device: "cpu",
      });
      const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
      const voices = await fetch(
        `https://huggingface.co/${MODEL_ID}/resolve/main/voices/${VOICE}.bin`,
      ).then((r) => r.arrayBuffer());
      return { model, tokenizer, voiceData: new Float32Array(voices) };
    },
    synthesise: async ({ model, tokenizer, voiceData }, text) => {
      const { input_ids } = tokenizer(text, { truncation: true });
      const tokenCount = input_ids.dims.at(-1) - 2;
      const offset = tokenCount * 256;
      const style = new Tensor("float32", voiceData.slice(offset, offset + 256), [1, 256]);
      const { waveform } = await model({
        input_ids,
        style,
        speed: new Tensor("float32", [1.0], [1]),
      });
      const samples = waveform.data.length;
      return { audioSeconds: samples / SAMPLE_RATE, bytes: samples * 4 };
    },
  },
  corpus.summaries,
  OUTPUT_PATH,
);
