import { mkdirSync } from 'fs';
import path from 'path';
import { env as transformersEnv, pipeline } from '@huggingface/transformers';
import logger from './logger';

const DEFAULT_LOCAL_STT_MODEL = process.env.LEXOIRE_LOCAL_STT_MODEL?.trim() || 'Xenova/whisper-base.en';
const DEFAULT_LOCAL_STT_CACHE_DIR = process.env.LEXOIRE_LOCAL_STT_CACHE_DIR?.trim()
  || path.resolve(__dirname, '..', '..', 'models', 'transformers');
const TARGET_SAMPLE_RATE = 16000;

export interface LocalTranscriptionRuntimeStatus {
  backendSpeechRecognition: boolean;
  modelId: string;
  cacheDir: string;
  offlineOnly: boolean;
}

function normalizeLanguage(language?: string): string {
  const normalized = language?.trim().toLowerCase();
  if (!normalized) {
    return 'english';
  }

  if (normalized.startsWith('en')) {
    return 'english';
  }

  return normalized;
}

function clampSample(sample: number): number {
  if (sample > 1) return 1;
  if (sample < -1) return -1;
  return sample;
}

function resampleMonoAudio(samples: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  if (sourceRate === targetRate) {
    return samples;
  }

  const outputLength = Math.max(1, Math.round(samples.length * targetRate / sourceRate));
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const position = index * (sourceRate / targetRate);
    const leftIndex = Math.floor(position);
    const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
    const weight = position - leftIndex;
    output[index] = samples[leftIndex] * (1 - weight) + samples[rightIndex] * weight;
  }

  return output;
}

function decodeWavAudio(audioBuffer: Buffer): Float32Array {
  if (audioBuffer.length < 44) {
    throw new Error('Recorded audio is too small to decode.');
  }

  const view = new DataView(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.byteLength);
  const riffHeader = audioBuffer.toString('ascii', 0, 4);
  const waveHeader = audioBuffer.toString('ascii', 8, 12);
  if (riffHeader !== 'RIFF' || waveHeader !== 'WAVE') {
    throw new Error('Recorded audio must be WAV format.');
  }

  let offset = 12;
  let audioFormat = 0;
  let channelCount = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= view.byteLength) {
    const chunkId = audioBuffer.toString('ascii', offset, offset + 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;

    if (chunkId === 'fmt ' && chunkSize >= 16) {
      audioFormat = view.getUint16(chunkDataOffset, true);
      channelCount = view.getUint16(chunkDataOffset + 2, true);
      sampleRate = view.getUint32(chunkDataOffset + 4, true);
      bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
    } else if (chunkId === 'data') {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
      break;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0 || dataSize <= 0) {
    throw new Error('Recorded audio is missing PCM data.');
  }
  if (!sampleRate || !channelCount) {
    throw new Error('Recorded audio is missing WAV format metadata.');
  }

  const bytesPerSample = bitsPerSample / 8;
  if (!Number.isInteger(bytesPerSample) || bytesPerSample <= 0) {
    throw new Error('Recorded audio uses an unsupported WAV bit depth.');
  }
  if (audioFormat !== 1 && audioFormat !== 3) {
    throw new Error(`Recorded audio format ${audioFormat} is unsupported.`);
  }

  const frameCount = Math.floor(dataSize / (channelCount * bytesPerSample));
  const mono = new Float32Array(frameCount);

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    let mixedSample = 0;

    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sampleOffset = dataOffset + (frameIndex * channelCount + channelIndex) * bytesPerSample;

      if (audioFormat === 1 && bitsPerSample === 16) {
        mixedSample += view.getInt16(sampleOffset, true) / 32768;
      } else if (audioFormat === 3 && bitsPerSample === 32) {
        mixedSample += view.getFloat32(sampleOffset, true);
      } else {
        throw new Error(`Recorded audio bit depth ${bitsPerSample} is unsupported.`);
      }
    }

    mono[frameIndex] = clampSample(mixedSample / channelCount);
  }

  return resampleMonoAudio(mono, sampleRate, TARGET_SAMPLE_RATE);
}

class LocalTranscriptionService {
  private readonly modelId = DEFAULT_LOCAL_STT_MODEL;

  private readonly cacheDir = DEFAULT_LOCAL_STT_CACHE_DIR;

  private readonly offlineOnly = process.env.LEXOIRE_LOCAL_STT_OFFLINE_ONLY === '1';

  private transcriberPromise: Promise<any> | null = null;

  constructor() {
    mkdirSync(this.cacheDir, { recursive: true });
    transformersEnv.allowLocalModels = true;
    transformersEnv.allowRemoteModels = !this.offlineOnly;
    transformersEnv.useFS = true;
    transformersEnv.useFSCache = true;
    transformersEnv.cacheDir = this.cacheDir;
  }

  getRuntimeStatus(): LocalTranscriptionRuntimeStatus {
    return {
      backendSpeechRecognition: true,
      modelId: this.modelId,
      cacheDir: this.cacheDir,
      offlineOnly: this.offlineOnly,
    };
  }

  async warmup(): Promise<void> {
    await this.getTranscriber();
  }

  async transcribe(audioBuffer: Buffer, language?: string): Promise<{ text: string; model: string }> {
    const transcriber = await this.getTranscriber();
    const decodedAudio = decodeWavAudio(audioBuffer);
    const requestOptions: Record<string, unknown> = {
      chunk_length_s: 30,
      stride_length_s: 5,
    };

    if (!this.modelId.endsWith('.en')) {
      requestOptions.language = normalizeLanguage(language);
      requestOptions.task = 'transcribe';
    }

    const result = await transcriber(decodedAudio, requestOptions);

    const text = typeof result?.text === 'string' ? result.text.trim() : '';
    return {
      text,
      model: this.modelId,
    };
  }

  private async getTranscriber(): Promise<any> {
    if (!this.transcriberPromise) {
      this.transcriberPromise = pipeline('automatic-speech-recognition', this.modelId, {
        cache_dir: this.cacheDir,
        local_files_only: this.offlineOnly,
      }).catch((error: unknown) => {
        this.transcriberPromise = null;
        const message = error instanceof Error ? error.message : String(error);
        if (this.offlineOnly) {
          throw new Error(`Local speech model is unavailable in the packaged build cache. Rebuild with npm run speech:model:prepare. ${message}`);
        }
        throw new Error(`Failed to load the local speech model "${this.modelId}". ${message}`);
      });

      this.transcriberPromise.then(() => {
        logger.info(`Local STT model ready: ${this.modelId}`);
      }).catch((error: unknown) => {
        logger.error('Local STT model failed to initialize:', error instanceof Error ? error.message : String(error));
      });
    }

    return this.transcriberPromise;
  }
}

export default LocalTranscriptionService;
