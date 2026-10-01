import axios from 'axios';
import sharp from 'sharp';
import { imageToBase64 } from '@/lib/banana/api';
import { uploadBufferToBucket } from '@/lib/server/supabaseStorage';
import type { VeoPoll } from '@/lib/server/veo';
import { SEEDANCE_MODELS, seedanceFrameSize, seedanceSpec } from '@/lib/videoModels';

/**
 * Image-to-video with ByteDance Seedance on BytePlus ModelArk (API key in ARK_API_KEY).
 * A job is a task: created with POST /contents/generations/tasks and read with
 * GET /contents/generations/tasks/{id}. The finished clip's URL lasts 24 hours, so it is
 * copied into our storage. Our operation ids carry a "seedance/" prefix so
 * /api/video-status knows which service to ask.
 */

const DEFAULT_BASE_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3';
const OPERATION_PREFIX = 'seedance/';
export const DEFAULT_SEEDANCE_MODEL = 'dreamina-seedance-2-0-260128';
/** Takes a frame with a real person's face, which the 2.x series refuses. */
export const DEFAULT_SEEDANCE_FACE_MODEL = 'seedance-1-0-pro-250528';
const RESOLUTIONS = ['480p', '720p', '1080p', '4k'];
const RATIOS = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'];
/** Seedance's guide advises at most about 1,000 English words. */
const MAX_PROMPT_CHARS = 6000;

export interface SeedanceJobOptions {
  imageUrl: string;
  /** Pins the clip's final frame (first + last frame mode); dropped for a model without it. */
  lastFrameUrl?: string;
  prompt: string;
  /** Seedance has no negative prompt; these become constraint sentences in the prompt. */
  negativePrompt?: string;
  model?: string;
  resolution?: string;
  aspectRatio?: string;
  duration?: string | number;
  /** Keep the camera still for the whole clip (`camera_fixed` on 1.x, a prompt line on all). */
  cameraFixed?: boolean;
  /** A 480p draft to test with (Seedance 2.5 renders a true draft its final can reuse). */
  draft?: boolean;
  /** Seed for 1.x models; a draft gets one so its upgrade renders from the same seed. */
  seed?: number;
  /** Render the final of this Seedance 2.5 draft task (same take, 1080p); everything else is reused from it. */
  fromDraftTaskId?: string;
  /**
   * Reference-to-video (2.x): the film is built from these product images and the prompt,
   * with no first frame. imageUrl and lastFrameUrl are then ignored.
   */
  referenceImageUrls?: string[];
  /** The prompt is exactly what Seedance should receive (written for it, or approved by the user). */
  promptIsFinal?: boolean;
}

export interface SeedanceJob {
  operationName: string;
  model: string;
  resolution: string;
  durationSeconds: number;
  /** The seed sent (1.x models), kept so an upgrade can render from it again. */
  seed?: number;
  /** A Seedance 2.5 draft task: its final can be rendered from the task id. */
  nativeDraft?: boolean;
  /** Something about the request the user should know (e.g. the last frame could not be pinned). */
  notice?: string;
}

/** Seedance refused the frame because it shows a real person's face (the 2.x series does). */
export class SeedanceFaceRejected extends Error {
  constructor(readonly model: string, message: string) {
    super(message);
    this.name = 'SeedanceFaceRejected';
  }
}

function baseUrl(): string {
  return (process.env.ARK_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function authHeaders(): Record<string, string> {
  const key = process.env.ARK_API_KEY;
  if (!key) throw new Error('Seedance is not configured yet (set ARK_API_KEY, the BytePlus ModelArk API key).');
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

export function isSeedanceConfigured(): boolean {
  return Boolean(process.env.ARK_API_KEY);
}

/** The model to use: the one picked in the app, else SEEDANCE_MODEL, else Seedance 2.0. */
export function resolveSeedanceModel(model?: string): string {
  return model && /seedance|^ep-/i.test(model) ? model : process.env.SEEDANCE_MODEL || DEFAULT_SEEDANCE_MODEL;
}

/** Where a frame with a real person's face goes (SEEDANCE_FACE_MODEL=none turns this off). */
export function seedanceFaceModel(): string | null {
  const configured = process.env.SEEDANCE_FACE_MODEL;
  if (configured && /^(none|off|false)$/i.test(configured)) return null;
  return configured || DEFAULT_SEEDANCE_FACE_MODEL;
}

/** Output resolution: the requested one (else SEEDANCE_RESOLUTION, else 1080p), capped to what the model renders. */
export function seedanceResolution(model: string, requested?: string): string {
  const spec = seedanceSpec(model);
  const wanted = RESOLUTIONS.indexOf((requested || process.env.SEEDANCE_RESOLUTION || '1080p').toLowerCase());
  const cap = wanted < 0 ? RESOLUTIONS.indexOf('1080p') : wanted;
  return spec.resolutions.filter((r) => RESOLUTIONS.indexOf(r) <= cap).at(-1) ?? spec.resolutions[0];
}

function clampSeconds(duration: string | number | undefined, min: number, max: number): number {
  const raw = typeof duration === 'number' ? duration : parseFloat(String(duration || '8')) || 8;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

/** The frame as a JPEG data URL, cover-fitted to the clip's exact output size when it is known. */
async function frameDataUrl(url: string, size: { width: number; height: number } | null): Promise<string> {
  const dataUrl = await imageToBase64(url);
  const bytes = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
  const fitted = size
    ? sharp(bytes).resize(size.width, size.height, { fit: 'cover', position: 'centre', kernel: 'lanczos3' })
    : sharp(bytes).resize({ width: 6000, height: 6000, fit: 'inside', withoutEnlargement: true });
  const jpeg = await fitted.jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

function straightQuotes(text: string): string {
  return text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}

function prose(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(prose).filter(Boolean).join('; ');
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, inner]) => {
        const text = prose(inner);
        return text ? `${key.replace(/_/g, ' ')}: ${text}` : '';
      })
      .filter(Boolean)
      .join('; ');
  }
  return '';
}

function beat(value: unknown): string {
  const b = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const text = (key: string) => (typeof b[key] === 'string' ? (b[key] as string).trim() : '');
  const line = text('line').replace(/^["“]|["”]$/g, '');
  const parts = [
    text('action'),
    text('camera') ? `Camera: ${text('camera')}` : '',
    line && !/^none$/i.test(line) ? `Says: "${line}"` : '',
  ].filter(Boolean);
  const sentence = parts.map((part) => part.replace(/[.\s]+$/, '')).join('. ');
  return sentence ? `${text('t') || '-'}: ${sentence}${/[.!?"]$/.test(sentence) ? '' : '.'}` : '';
}

/**
 * Seedance reads plain, engineering-style direction (who, where, what happens in which
 * order, how the camera moves) and has no negative prompt. The JSON prompt written for Veo
 * becomes labelled lines, spoken lines keep straight double quotes (how Seedance voices
 * dialogue), and what to avoid becomes constraint sentences in the wording of Seedance's
 * prompt guide.
 */
export function seedancePrompt(prompt: string, options: { negativePrompt?: string; cameraFixed?: boolean } = {}): string {
  let body = prompt.trim();
  if (body.startsWith('{')) {
    try {
      const json = JSON.parse(body) as Record<string, unknown>;
      // Duration, ratio, resolution and frame rate are request parameters; of "format" only the look is direction.
      const format = json.format && typeof json.format === 'object' ? (json.format as Record<string, unknown>) : null;
      const { format: _format, ...rest } = json;
      void _format;
      const fields: Array<[string, unknown]> = [...(format?.look ? [['look', format.look] as [string, unknown]] : []), ...Object.entries(rest)];
      body = fields
        .map(([key, value]) => {
          const text = key === 'timeline' && Array.isArray(value) ? value.map(beat).filter(Boolean).join(' ') : prose(value);
          if (!text) return '';
          const label = key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
          // "Sound: Sound: ..." when the value already carries its label.
          return text.toLowerCase().startsWith(`${label.toLowerCase()}:`) ? text : `${label}: ${text}`;
        })
        .filter(Boolean)
        .join('\n');
    } catch {
      // Not JSON after all: send it as written.
    }
  }
  const avoid = (options.negativePrompt ?? '')
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 30)
    .join(', ');
  return [
    straightQuotes(body),
    options.cameraFixed ? 'Fixed camera position for the whole clip: no zoom, push-in, pan, tilt or reframing.' : '',
    `Constraints: keep it subtitle-free and avoid generating any text or subtitles; do not generate a logo; do not generate a watermark.${avoid ? ` Avoid: ${avoid}.` : ''}`,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_PROMPT_CHARS);
}

interface ArkFailure {
  status?: number;
  code?: string;
  message?: string;
}

function arkFailure(error: unknown): ArkFailure {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: { code?: string; message?: string } } | undefined;
    return { status: error.response?.status, code: data?.error?.code, message: data?.error?.message || error.message };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}

/** A short, actionable reason for a Seedance error code. */
export function explainSeedanceError(model: string, code?: string, message?: string): string {
  const name = model ? seedanceSpec(model).name : 'Seedance';
  if (!code) return message || 'unknown error';
  if (code === 'ModelNotOpen') {
    return `your BytePlus account has not activated ${name} (${model}). Activate it in the ModelArk console (the 2.x models need a balance over USD 30, an AI Savings Plan or a Seedance resource pack), or pick another model.`;
  }
  if (code.startsWith('InvalidEndpointOrModel')) return `${name} (${model}) is not available to this API key.`;
  if (code === 'AuthenticationError') return 'BytePlus rejected ARK_API_KEY (missing or invalid).';
  if (code.startsWith('AccountOverdue')) return 'the BytePlus account has an overdue balance; top it up to keep generating.';
  if (code.endsWith('PrivacyInformation')) return `${name} does not accept a frame with a real person's face.`;
  if (/SensitiveContentDetected/.test(code)) return `Seedance's safety check stopped this video.`;
  if (/RateLimit|ServerOverloaded|QuotaExceeded/.test(code)) return 'Seedance is busy right now; try again in a minute.';
  return message || code;
}

/** The Seedance task id inside one of our operation ids. */
export function seedanceTaskId(operationName: string): string {
  return operationName.slice(OPERATION_PREFIX.length);
}

async function createTask(model: string, body: Record<string, unknown>, headers: Record<string, string>): Promise<string> {
  try {
    const response = await axios.post<{ id?: string }>(`${baseUrl()}/contents/generations/tasks`, body, {
      headers,
      timeout: 60000,
      maxBodyLength: 64 * 1024 * 1024,
    });
    if (!response.data.id) throw new Error('Seedance did not return a task id.');
    return response.data.id;
  } catch (error) {
    const failure = arkFailure(error);
    if (failure.code?.endsWith('PrivacyInformation') && !seedanceSpec(model).realFaces) {
      throw new SeedanceFaceRejected(model, explainSeedanceError(model, failure.code, failure.message));
    }
    throw new Error(`Seedance rejected the job: ${explainSeedanceError(model, failure.code, failure.message)}${failure.code ? ` [${failure.code}]` : ''}`);
  }
}

export async function submitSeedanceJob(options: SeedanceJobOptions): Promise<SeedanceJob> {
  const headers = authHeaders();
  const model = resolveSeedanceModel(options.model);
  const spec = seedanceSpec(model);

  // The final of a 2.5 draft: prompt, frames, duration, ratio, seed and sound all come from
  // the draft task, and repeating any of them is an error. Only 1080p is offered.
  if (options.fromDraftTaskId) {
    const id = await createTask(model, {
      model,
      content: [{ type: 'draft_task', draft_task: { id: options.fromDraftTaskId } }],
      resolution: '1080p',
      watermark: false,
    }, headers);
    return { operationName: `${OPERATION_PREFIX}${id}`, model, resolution: '1080p', durationSeconds: clampSeconds(options.duration, spec.minSeconds, spec.maxSeconds) };
  }

  const nativeDraft = Boolean(options.draft) && spec.family === '2.5';
  const resolution = options.draft ? '480p' : seedanceResolution(model, options.resolution);
  const promptText = options.promptIsFinal
    ? options.prompt.trim().slice(0, MAX_PROMPT_CHARS)
    : seedancePrompt(options.prompt || 'A smooth, natural cinematic shot.', { negativePrompt: options.negativePrompt, cameraFixed: options.cameraFixed });

  // Reference-to-video: the product images guide every shot; there is no first frame, and
  // neither camera_fixed nor seed apply.
  if (options.referenceImageUrls?.length) {
    if (spec.family === '1.0') throw new Error(`${spec.name} cannot build a video from reference images; pick a Seedance 2.x model.`);
    const images = await Promise.all(options.referenceImageUrls.slice(0, spec.family === '2.5' ? 30 : 9).map((url) => frameDataUrl(url, null)));
    const aspectRatio = options.aspectRatio || '9:16';
    const durationSeconds = clampSeconds(options.duration, spec.minSeconds, spec.maxSeconds);
    const id = await createTask(model, {
      model,
      content: [
        { type: 'text', text: promptText },
        ...images.map((url) => ({ type: 'image_url', image_url: { url }, role: 'reference_image' })),
      ],
      resolution,
      ratio: RATIOS.includes(aspectRatio) ? aspectRatio : 'adaptive',
      duration: durationSeconds,
      watermark: false,
      ...(spec.audio ? { generate_audio: process.env.SEEDANCE_GENERATE_AUDIO !== 'false' } : {}),
      ...(nativeDraft ? { draft: true } : {}),
    }, headers);
    return { operationName: `${OPERATION_PREFIX}${id}`, model, resolution, durationSeconds, nativeDraft };
  }
  // 1.x drafts get a seed, so the upgrade renders from the same one.
  const seed = spec.cameraFixed ? options.seed ?? (options.draft ? Math.floor(Math.random() * 2_147_483_647) : undefined) : undefined;
  const aspectRatio = options.aspectRatio || '16:9';
  const durationSeconds = clampSeconds(options.duration, spec.minSeconds, spec.maxSeconds);
  const size = seedanceFrameSize(spec, resolution, aspectRatio);
  const first = await frameDataUrl(options.imageUrl, size);
  const pinLast = Boolean(options.lastFrameUrl) && spec.lastFrame;
  const last = pinLast
    ? options.lastFrameUrl === options.imageUrl ? first : await frameDataUrl(options.lastFrameUrl as string, size)
    : null;

  const body = {
    model,
    content: [
      { type: 'text', text: promptText },
      { type: 'image_url', image_url: { url: first }, role: 'first_frame' },
      ...(last ? [{ type: 'image_url', image_url: { url: last }, role: 'last_frame' }] : []),
    ],
    resolution,
    // 2.5 keeps the first frame's shape for image-to-video and takes no other ratio.
    ratio: spec.family === '2.5' || !RATIOS.includes(aspectRatio) ? 'adaptive' : aspectRatio,
    duration: durationSeconds,
    watermark: false,
    // Strict validation: parameters a model does not support are errors, so each goes only where it applies.
    ...(spec.audio ? { generate_audio: process.env.SEEDANCE_GENERATE_AUDIO !== 'false' } : {}),
    ...(spec.cameraFixed && options.cameraFixed ? { camera_fixed: true } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(nativeDraft ? { draft: true } : {}),
  };

  const id = await createTask(model, body, headers);
  return {
    operationName: `${OPERATION_PREFIX}${id}`,
    model,
    resolution,
    durationSeconds,
    seed,
    nativeDraft,
    notice: options.lastFrameUrl && !pinLast
      ? `${spec.name} cannot pin the last frame, so the product is held by the prompt alone; Seedance 1.0 Pro or 2.x pin it.`
      : undefined,
  };
}

/** True for operation ids of Seedance tasks (`seedance/<task id>`). */
export function isSeedanceOperation(operationName: string): boolean {
  return operationName.startsWith(OPERATION_PREFIX);
}

/**
 * Polls a Seedance task. When it has finished, the clip is copied into our storage (its
 * own URL expires after 24 hours). Failures carry the ModelArk error code in brackets.
 */
export async function pollSeedanceJob(operationName: string): Promise<VeoPoll> {
  const taskId = seedanceTaskId(operationName);
  const { data } = await axios.get<{
    model?: string;
    status?: string;
    created_at?: number;
    resolution?: string;
    content?: { video_url?: string };
    error?: { code?: string; message?: string } | null;
  }>(`${baseUrl()}/contents/generations/tasks/${encodeURIComponent(taskId)}`, { headers: authHeaders(), timeout: 20000 });

  if (data.status === 'queued' || data.status === 'running') {
    // Seedance reports no progress; estimate it from the time since the task was created.
    const elapsed = data.created_at ? Date.now() / 1000 - data.created_at : 0;
    const expected = /4k/i.test(data.resolution ?? '') ? 480 : 240;
    return { done: false, progress: data.status === 'queued' ? 5 : Math.min(95, Math.round(10 + (elapsed / expected) * 85)) };
  }
  if (data.status === 'succeeded') {
    const videoUrl = data.content?.video_url;
    if (!videoUrl) return { done: true, progress: 100, error: 'Seedance finished without a video.' };
    const file = await axios.get<ArrayBuffer>(videoUrl, {
      responseType: 'arraybuffer',
      timeout: 180000,
      maxContentLength: 400 * 1024 * 1024,
      maxBodyLength: 400 * 1024 * 1024,
    });
    const url = await uploadBufferToBucket(Buffer.from(file.data), 'generated-videos', 'video/mp4').catch((error) => {
      console.warn('Seedance video upload failed, returning its 24-hour URL:', error);
      return videoUrl;
    });
    return { done: true, progress: 100, url };
  }
  // failed, expired or cancelled
  const code = data.error?.code;
  return {
    done: true,
    progress: 0,
    error: code
      ? `${explainSeedanceError(data.model ?? '', code, data.error?.message)} [${code}]`
      : `Seedance task ${data.status ?? 'failed'}${data.error?.message ? `: ${data.error.message}` : ''}`,
  };
}

export interface SeedanceAccess {
  id: string;
  name: string;
  status: 'available' | 'not_activated' | 'no_access' | 'unknown';
  detail?: string;
}

/**
 * Which Seedance models this key can call, without generating anything. Each model gets a
 * request with an impossible duration (1 s): a model the account has not activated answers
 * ModelNotOpen, one it can use answers with a parameter error, and nothing is queued or
 * billed. A made-up model id first shows whether ModelArk checks the model before the
 * parameters; if it does not, the answers cannot be told apart and are marked unknown.
 * Should a task ever be created, it is cancelled while still queued.
 */
export async function checkSeedanceAccess(): Promise<{ keyValid: boolean; baseUrl: string; models: SeedanceAccess[]; note?: string }> {
  const headers = authHeaders();
  const probe = async (model: string): Promise<ArkFailure> => {
    try {
      const response = await axios.post<{ id?: string }>(
        `${baseUrl()}/contents/generations/tasks`,
        { model, content: [{ type: 'text', text: 'Access check.' }], resolution: '480p', duration: 1, watermark: false },
        { headers, timeout: 30000 }
      );
      if (response.data.id) {
        await axios.delete(`${baseUrl()}/contents/generations/tasks/${encodeURIComponent(response.data.id)}`, { headers, timeout: 20000 }).catch(() => undefined);
      }
      return { status: response.status, code: 'Created' };
    } catch (error) {
      return arkFailure(error);
    }
  };

  const control = await probe('seedance-access-check-no-such-model');
  if (control.status === 401 || control.code === 'AuthenticationError') {
    return { keyValid: false, baseUrl: baseUrl(), models: [], note: 'BytePlus rejected ARK_API_KEY. Check the key (ModelArk console → API keys) and the region in ARK_BASE_URL.' };
  }
  const modelFirst = control.status === 404 || Boolean(control.code?.startsWith('InvalidEndpointOrModel'));

  const models: SeedanceAccess[] = [];
  for (const spec of SEEDANCE_MODELS) {
    const result = await probe(spec.id);
    const code = result.code ?? '';
    const status: SeedanceAccess['status'] = code === 'ModelNotOpen'
      ? 'not_activated'
      : code.startsWith('InvalidEndpointOrModel') || code === 'AccessDenied'
        ? 'no_access'
        : code === 'Created' || (modelFirst && result.status === 400)
          ? 'available'
          : 'unknown';
    models.push({ id: spec.id, name: spec.name, status, detail: code ? `${code}${result.message ? `: ${result.message}` : ''}`.slice(0, 240) : result.message?.slice(0, 240) });
  }
  return {
    keyValid: true,
    baseUrl: baseUrl(),
    models,
    note: modelFirst ? undefined : 'ModelArk checked the parameters before the model, so access could not be read from the answers; the ModelArk console lists activated models.',
  };
}
