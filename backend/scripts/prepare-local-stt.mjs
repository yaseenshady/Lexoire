import { mkdirSync } from 'fs';
import path from 'path';
import { env, pipeline } from '@huggingface/transformers';

const modelId = process.env.LEXOIRE_LOCAL_STT_MODEL?.trim() || 'Xenova/whisper-base.en';
const cacheDir = process.env.LEXOIRE_LOCAL_STT_CACHE_DIR?.trim()
  || path.resolve(process.cwd(), 'models', 'transformers');

mkdirSync(cacheDir, { recursive: true });

env.allowLocalModels = true;
env.allowRemoteModels = true;
env.useFS = true;
env.useFSCache = true;
env.cacheDir = cacheDir;

console.log(`[LEXOIRE] Preparing local STT model "${modelId}" in ${cacheDir}`);

const transcriber = await pipeline('automatic-speech-recognition', modelId, {
  cache_dir: cacheDir,
  local_files_only: false,
});

await transcriber.dispose?.();

console.log(`[LEXOIRE] Local STT model ready: ${modelId}`);
