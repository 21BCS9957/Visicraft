import { GoogleAuth } from 'google-auth-library';
import { imageToBase64 } from '@/lib/banana/api';

/**
 * Submits an image-to-video job to Veo on Vertex AI and returns the long-running
 * operation name, which /api/video-status polls. Shared by the plain img2vid
 * route and the product-ad video flow.
 */
export interface VeoJobOptions {
  imageUrl: string;
  prompt: string;
  negativePrompt?: string;
  model?: string;
  aspectRatio?: string;
  duration?: string | number;
  numResults?: number;
}

/** VEO_MODEL overrides the default so a newer Veo can be adopted without a code change. */
export const DEFAULT_VEO_MODEL = process.env.VEO_MODEL || 'veo-3.1-generate-001';
const LOCATION = process.env.VEO_LOCATION || 'us-central1';

function isVeo3(model: string): boolean {
  return /veo-3/.test(model);
}

/** Veo 3.x renders 1080p and native audio; older models are limited to 720p, silent. */
export function veoCapabilities(model: string): { resolution: string; generateAudio: boolean } {
  return isVeo3(model)
    ? { resolution: process.env.VEO_RESOLUTION || '1080p', generateAudio: process.env.VEO_GENERATE_AUDIO !== 'false' }
    : { resolution: '720p', generateAudio: false };
}

export function isVideoGenerationConfigured(): boolean {
  return Boolean(process.env.GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON);
}

export function resolveVeoModel(model?: string): string {
  return model && model.includes('veo') ? model : DEFAULT_VEO_MODEL;
}

export async function submitVeoJob(options: VeoJobOptions): Promise<{ operationName: string; model: string }> {
  const serviceAccountJson = process.env.GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error('Video generation is not configured yet (missing GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON).');
  }
  const credentials = JSON.parse(serviceAccountJson) as { project_id?: string };
  const projectId = credentials.project_id;
  if (!projectId) throw new Error('GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON has no project_id.');

  const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const accessToken = (await client.getAccessToken()).token;
  if (!accessToken) throw new Error('Failed to obtain access token from Google Auth.');

  const dataUrl = await imageToBase64(options.imageUrl);
  const model = resolveVeoModel(options.model);
  const durationSeconds = Math.min(8, Math.max(4, Math.round(
    typeof options.duration === 'number' ? options.duration : parseFloat(String(options.duration || '8')) || 8
  )));
  const capabilities = veoCapabilities(model);
  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/${LOCATION}/publishers/google/models/${model}:predictLongRunning`;

  // Vertex Veo schema: prompt + image in the instance; everything else in parameters.
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{
        prompt: options.prompt || 'A smooth cinematic tracking shot',
        image: { bytesBase64Encoded: dataUrl.split(',')[1], mimeType: 'image/jpeg' },
      }],
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

  if (!response.ok) {
    throw new Error(`Failed to submit Vertex job: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as { name?: string };
  if (!data.name) throw new Error('Vertex did not return an operation name.');
  return { operationName: data.name, model };
}
