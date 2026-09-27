import axios from 'axios';
import { GoogleAuth } from 'google-auth-library';
import { imageToBase64 } from '@/lib/banana/api';
import { uploadBufferToBucket } from '@/lib/server/supabaseStorage';

/**
 * Image-to-video with Google Veo through either provider:
 *  - "gemini": the Gemini API with the same GEMINI_API_KEY (needs billing on the
 *    AI Studio project; no service account). Preferred when available.
 *  - "vertex": Vertex AI with GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON.
 * Shared by the plain img2vid route and the product-ad video flow.
 */

export type VideoProvider = 'gemini' | 'vertex';

export interface VeoJobOptions {
  imageUrl: string;
  prompt: string;
  negativePrompt?: string;
  model?: string;
  aspectRatio?: string;
  duration?: string | number;
  numResults?: number;
}

export interface VeoJob {
  operationName: string;
  model: string;
  provider: VideoProvider;
}

export interface VeoPoll {
  done: boolean;
  progress: number;
  url?: string;
  error?: string;
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** VEO_MODEL overrides the default so a newer Veo can be adopted without a code change. */
export const DEFAULT_VEO_MODEL = process.env.VEO_MODEL || 'veo-3.1-generate-001';
const LOCATION = process.env.VEO_LOCATION || 'us-central1';
const MODEL_CACHE_TTL_MS = 60 * 60 * 1000;

let geminiModelCache: { resolvedAt: number; model: string } | null = null;

export function getVideoProvider(): VideoProvider | null {
  const forced = process.env.VIDEO_PROVIDER;
  if (forced === 'vertex') return process.env.GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON ? 'vertex' : null;
  if (forced === 'gemini') return process.env.GEMINI_API_KEY ? 'gemini' : null;
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON) return 'vertex';
  return null;
}

export function isVideoGenerationConfigured(): boolean {
  return getVideoProvider() !== null;
}

function isVeo3(model: string): boolean {
  return /veo-3/.test(model);
}

/** Veo 3.x renders 1080p and native audio; older models are limited to 720p, silent. */
export function veoCapabilities(model: string): { resolution: string; generateAudio: boolean } {
  return isVeo3(model)
    ? { resolution: process.env.VEO_RESOLUTION || '1080p', generateAudio: process.env.VEO_GENERATE_AUDIO !== 'false' }
    : { resolution: '720p', generateAudio: false };
}

export function resolveVeoModel(model?: string): string {
  return model && model.includes('veo') ? model : DEFAULT_VEO_MODEL;
}

/** Version number of a Veo model id, e.g. veo-3.1-fast-generate-preview → 3.1. */
function veoVersion(name: string): number {
  const match = name.match(/veo-(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Picks the strongest Veo the key can use on the Gemini API: highest version,
 * standard quality over "fast"/"lite", GA over preview. VEO_MODEL wins when the
 * key actually lists it. Cached for an hour.
 */
export async function resolveGeminiVeoModel(): Promise<string> {
  if (geminiModelCache && Date.now() - geminiModelCache.resolvedAt < MODEL_CACHE_TTL_MS) return geminiModelCache.model;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  const response = await axios.get<{ models?: Array<{ name: string; supportedGenerationMethods?: string[] }> }>(
    `${GEMINI_BASE}/models?pageSize=200`,
    { headers: { 'x-goog-api-key': apiKey }, timeout: 20000 }
  );
  const candidates = (response.data.models ?? [])
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((name, i, all) => name.includes('veo') && (response.data.models?.[i]?.supportedGenerationMethods ?? []).includes('predictLongRunning') && all.indexOf(name) === i);
  if (candidates.length === 0) {
    throw new Error('This Gemini API key lists no Veo models. Veo needs billing enabled on the Google AI Studio project.');
  }

  const preferred = process.env.VEO_MODEL;
  const rank = (name: string) =>
    veoVersion(name) * 100 + (/fast|lite/.test(name) ? 0 : 10) + (/preview|exp/.test(name) ? 0 : 1);
  const model = preferred && candidates.includes(preferred)
    ? preferred
    : [...candidates].sort((a, b) => rank(b) - rank(a))[0];
  geminiModelCache = { resolvedAt: Date.now(), model };
  console.log(`Veo on Gemini API: using ${model} (available: ${candidates.join(', ')})`);
  return model;
}

/** Minimal, policy-neutral motion for a retry after Veo's safety filter rejected a take. */
export function safeVeoPrompt(): string {
  return 'A slow, steady cinematic push-in toward the product shown in the first frame. Soft warm light glides gently across it and a subtle sheen moves over the material. The product stays perfectly still, sharp and unchanged, centred in frame. No people appear. No text, captions or logos. Calm ambient room tone with a soft, warm music bed; no voice.';
}

function clampDuration(duration: string | number | undefined): number {
  const raw = typeof duration === 'number' ? duration : parseFloat(String(duration || '8')) || 8;
  return Math.min(8, Math.max(4, Math.round(raw)));
}

export async function submitVeoJob(options: VeoJobOptions): Promise<VeoJob> {
  const provider = getVideoProvider();
  if (!provider) {
    throw new Error('Video generation is not configured yet (set GEMINI_API_KEY with billing, or GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON).');
  }
  const dataUrl = await imageToBase64(options.imageUrl);
  const imageBase64 = dataUrl.split(',')[1];
  const durationSeconds = clampDuration(options.duration);

  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY as string;
    const model = await resolveGeminiVeoModel();
    const capabilities = veoCapabilities(model);
    const response = await axios.post<{ name?: string }>(
      `${GEMINI_BASE}/models/${model}:predictLongRunning`,
      {
        instances: [{ prompt: options.prompt || 'A smooth cinematic tracking shot', image: { bytesBase64Encoded: imageBase64, mimeType: 'image/jpeg' } }],
        parameters: {
          aspectRatio: options.aspectRatio || '16:9',
          resolution: capabilities.resolution,
          durationSeconds,
          negativePrompt: options.negativePrompt || undefined,
          personGeneration: 'allow_adult',
        },
      },
      { headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' }, timeout: 60000 }
    ).catch((error: unknown) => {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { error?: { message?: string } } | undefined)?.error?.message || error.message
        : String(error);
      throw new Error(`Veo (Gemini API) rejected the job: ${message}`);
    });
    if (!response.data.name) throw new Error('Veo (Gemini API) did not return an operation name.');
    return { operationName: response.data.name, model, provider };
  }

  // Vertex AI
  const credentials = JSON.parse(process.env.GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON as string) as { project_id?: string };
  const projectId = credentials.project_id;
  if (!projectId) throw new Error('GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON has no project_id.');
  const accessToken = await vertexAccessToken(credentials);
  const model = resolveVeoModel(options.model);
  const capabilities = veoCapabilities(model);
  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/${LOCATION}/publishers/google/models/${model}:predictLongRunning`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt: options.prompt || 'A smooth cinematic tracking shot', image: { bytesBase64Encoded: imageBase64, mimeType: 'image/jpeg' } }],
      parameters: {
        sampleCount: options.numResults || 1,
        durationSeconds,
        resolution: capabilities.resolution,
        aspectRatio: options.aspectRatio || '16:9',
        negativePrompt: options.negativePrompt || undefined,
        generateAudio: capabilities.generateAudio,
        personGeneration: 'allow_adult',
      },
    }),
  });
  if (!response.ok) throw new Error(`Failed to submit Vertex job: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as { name?: string };
  if (!data.name) throw new Error('Vertex did not return an operation name.');
  return { operationName: data.name, model, provider };
}

async function vertexAccessToken(credentials: object): Promise<string> {
  const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  if (!token) throw new Error('Failed to obtain access token from Google Auth.');
  return token;
}

/** True for operation names issued by the Gemini API (`models/<veo>/operations/<id>`). */
export function isGeminiOperation(operationName: string): boolean {
  return operationName.startsWith('models/') || operationName.startsWith('operations/');
}

/**
 * Polls a Gemini-API Veo operation. When finished, downloads the clip (the URI
 * needs the API key) and stores it in Supabase so the client gets a plain URL.
 */
export async function pollGeminiVeoJob(operationName: string): Promise<VeoPoll> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');
  const response = await axios.get<{
    done?: boolean;
    error?: { message?: string };
    metadata?: { progressPercent?: number; progressPercentage?: number };
    response?: {
      generateVideoResponse?: {
        generatedSamples?: Array<{ video?: { uri?: string } }>;
        raiMediaFilteredCount?: number;
        raiMediaFilteredReasons?: string[];
      };
    };
  }>(`${GEMINI_BASE}/${operationName}`, { headers: { 'x-goog-api-key': apiKey }, timeout: 20000 });
  const data = response.data;
  if (data.error) return { done: true, progress: 0, error: data.error.message || 'Generation failed' };
  if (!data.done) {
    const progress = Number(data.metadata?.progressPercent ?? data.metadata?.progressPercentage) || 0;
    return { done: false, progress };
  }
  const generated = data.response?.generateVideoResponse;
  const uri = generated?.generatedSamples?.[0]?.video?.uri;
  if (!uri) {
    const reason = generated?.raiMediaFilteredReasons?.[0];
    return { done: true, progress: 100, error: reason ? `Veo filtered this video: ${reason}` : 'Veo finished without a video.' };
  }
  const file = await axios.get<ArrayBuffer>(uri, {
    headers: { 'x-goog-api-key': apiKey },
    responseType: 'arraybuffer',
    timeout: 120000,
    maxContentLength: 200 * 1024 * 1024,
    maxBodyLength: 200 * 1024 * 1024,
  });
  const bytes = Buffer.from(file.data);
  const url = await uploadBufferToBucket(bytes, 'generated-videos', 'video/mp4').catch((error) => {
    console.warn('Video upload failed, returning inline data URL:', error);
    return `data:video/mp4;base64,${bytes.toString('base64')}`;
  });
  return { done: true, progress: 100, url };
}
