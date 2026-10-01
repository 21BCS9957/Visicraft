import { getVideoProvider, resolveVeoModel, submitVeoJob, veoCapabilities, type VeoJobOptions } from '@/lib/server/veo';
import {
  isSeedanceConfigured,
  resolveSeedanceModel,
  seedanceFaceModel,
  SeedanceFaceRejected,
  seedanceResolution,
  submitSeedanceJob,
} from '@/lib/server/seedance';
import { seedanceSpec, snapVideoDuration, videoEngineOf, type VideoEngine, type VideoQuality } from '@/lib/videoModels';

/**
 * One way in for rendering a clip with either engine: Google Veo or ByteDance Seedance.
 * The model picked in the app decides; without one, VIDEO_PROVIDER=seedance makes Seedance
 * the default and anything else keeps Veo.
 */

export interface VideoJobOptions extends VeoJobOptions {
  engine: VideoEngine;
  /** Keep the camera still for the whole clip (a worn garment is filmed as a living photograph). */
  cameraFixed?: boolean;
  /** The frame shows a real person (a store photo), which Seedance 2.x refuses. */
  realFace?: boolean;
  /** Someone speaks in the clip, so a silent model cannot stand in. */
  needsAudio?: boolean;
  /** draft, 720p, 1080p or 4k; without it the engine's configured resolution. */
  quality?: VideoQuality;
  /** Seedance 1.x: render from this seed (an upgrade reuses its draft's). */
  seed?: number;
  /** Seedance 2.5: render the final of this draft task (the same take, in 1080p). */
  fromDraftTaskId?: string;
  /** Seedance 2.x reference-to-video: person-free product images instead of a first frame. */
  referenceImageUrls?: string[];
  /** Send the prompt exactly as it is (written for the engine, or approved by the user). */
  promptIsFinal?: boolean;
}

export interface VideoJob {
  operationName: string;
  model: string;
  engine: VideoEngine;
  resolution: string;
  quality: VideoQuality;
  durationSeconds: number;
  seed?: number;
  /** A Seedance 2.5 draft: its final reuses this exact take. */
  nativeDraft?: boolean;
  /** Tell the user: the job went to another model than the one picked, or lost a feature. */
  notice?: string;
}

/** A clip's quality from the resolution it renders at (480p is only ever a draft). */
function qualityOf(resolution: string): VideoQuality {
  return /4k/i.test(resolution) ? '4k' : resolution === '720p' ? '720p' : resolution === '480p' ? 'draft' : '1080p';
}

function seconds(duration: string | number | undefined): number {
  return typeof duration === 'number' ? duration : parseFloat(String(duration || '8')) || 8;
}

function seedanceJobOptions(options: VideoJobOptions, model: string) {
  const draft = options.quality === 'draft';
  return { ...options, model, draft, resolution: draft ? undefined : options.quality ?? options.resolution };
}

async function submitSeedance(options: VideoJobOptions, model: string): Promise<VideoJob> {
  const job = await submitSeedanceJob(seedanceJobOptions(options, model));
  return {
    operationName: job.operationName,
    model: job.model,
    engine: 'seedance',
    resolution: job.resolution,
    quality: options.quality === 'draft' ? 'draft' : qualityOf(job.resolution),
    durationSeconds: job.durationSeconds,
    seed: job.seed,
    nativeDraft: job.nativeDraft,
    notice: job.notice,
  };
}

export function pickVideoEngine(model?: string): VideoEngine {
  return videoEngineOf(model) ?? (process.env.VIDEO_PROVIDER === 'seedance' ? 'seedance' : 'veo');
}

export function resolveVideoModel(engine: VideoEngine, model?: string): string {
  return engine === 'seedance' ? resolveSeedanceModel(model) : resolveVeoModel(model);
}

export function isVideoEngineConfigured(engine: VideoEngine): boolean {
  return engine === 'seedance' ? isSeedanceConfigured() : getVideoProvider() !== null;
}

export function videoEngineLabel(engine: VideoEngine, model?: string): string {
  return engine === 'seedance' ? (model ? seedanceSpec(model).name : 'Seedance') : 'Veo';
}

/** What to set when the engine is missing, for messages. */
export function videoEngineSetup(engine: VideoEngine): string {
  return engine === 'seedance'
    ? 'ARK_API_KEY (BytePlus ModelArk) for Seedance'
    : 'a GEMINI_API_KEY with billing, or GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON, for Veo';
}

/** The resolution a clip will render at: it sets the credit price and the size of the hero frame. */
export function videoOutputResolution(engine: VideoEngine, model: string): string {
  return engine === 'seedance' ? seedanceResolution(model) : veoCapabilities(model).resolution;
}

export async function submitVideoJob(options: VideoJobOptions): Promise<VideoJob> {
  if (options.engine === 'veo') {
    const draft = options.quality === 'draft';
    const durationSeconds = snapVideoDuration(options.model ?? 'veo', seconds(options.duration));
    // Veo's first/last-frame mode only runs 8-second clips.
    const pin = Boolean(options.lastFrameUrl) && durationSeconds === 8;
    // A draft is Veo Fast at 720p.
    const resolution = draft ? '720p' : options.quality ?? options.resolution;
    const job = await submitVeoJob({
      ...options,
      lastFrameUrl: pin ? options.lastFrameUrl : undefined,
      duration: durationSeconds,
      resolution,
      tier: draft ? 'fast' : options.tier,
    });
    const rendered = resolution || veoCapabilities(job.model).resolution;
    return {
      operationName: job.operationName,
      model: job.model,
      engine: 'veo',
      resolution: rendered,
      quality: draft ? 'draft' : qualityOf(rendered),
      durationSeconds,
      notice: options.lastFrameUrl && !pin
        ? `Veo pins the last frame only on 8-second clips, so this ${durationSeconds}-second clip holds the product by the prompt alone; pick 8 s for the steadiest garment.`
        : undefined,
    };
  }
  const model = resolveSeedanceModel(options.model);
  // Reference films are built from person-free images; a refusal means one slipped through.
  if (options.referenceImageUrls?.length) {
    try {
      return await submitSeedance(options, model);
    } catch (error) {
      if (error instanceof SeedanceFaceRejected) {
        throw new Error(`${seedanceSpec(model).name} saw a person in one of the reference images. Remove that image and approve again.`);
      }
      throw error;
    }
  }
  // A known real face goes straight to a model that takes it; 2.x would only refuse it.
  if (options.realFace && !seedanceSpec(model).realFaces && !options.fromDraftTaskId) return submitFaceSafeVideoJob(options, model);
  try {
    return await submitSeedance(options, model);
  } catch (error) {
    if (error instanceof SeedanceFaceRejected) return submitFaceSafeVideoJob(options, model);
    throw error;
  }
}

/**
 * A frame Seedance 2.x will not take (a real person's face): a clip where someone speaks
 * goes to Veo, which voices it; anything else to SEEDANCE_FACE_MODEL (Seedance 1.0 Pro,
 * which takes real faces but renders no sound).
 */
export async function submitFaceSafeVideoJob(options: VideoJobOptions, refusedModel: string): Promise<VideoJob> {
  const refused = refusedModel ? seedanceSpec(refusedModel).name : 'Seedance 2.x';
  const faceModel = seedanceFaceModel();
  const faceSpec = faceModel ? seedanceSpec(faceModel) : null;
  if (options.needsAudio && !faceSpec?.audio && isVideoEngineConfigured('veo')) {
    const job = await submitVideoJob({ ...options, engine: 'veo', model: undefined, seed: undefined, fromDraftTaskId: undefined });
    return { ...job, notice: `${refused} does not accept a frame with a real person's face, and this clip has a spoken line, so it was rendered with Veo.${job.notice ? ` ${job.notice}` : ''}` };
  }
  if (!faceModel || !faceSpec) {
    throw new Error(`${refused} does not accept a frame with a real person's face. Set SEEDANCE_FACE_MODEL (e.g. seedance-1-0-pro-250528) or pick Veo.`);
  }
  const job = await submitSeedance({ ...options, fromDraftTaskId: undefined }, faceModel);
  const sound = faceSpec.audio ? '' : options.needsAudio ? ', which renders no sound, so the line is not voiced' : ' (silent)';
  return {
    ...job,
    notice: `${refused} does not accept a frame with a real person's face, so the clip was rendered with ${faceSpec.name}${sound}.${job.notice ? ` ${job.notice}` : ''}`,
  };
}
