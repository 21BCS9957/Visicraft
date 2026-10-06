import { createServiceClient } from '@/lib/supabase/server';
import { refundCreditsForUser } from '@/lib/server/usage';
import { safeVeoPrompt } from '@/lib/server/veo';
import { isSeedanceOperation } from '@/lib/server/seedance';
import { submitFaceSafeVideoJob, submitVideoJob, type VideoJob } from '@/lib/server/video';
import { seedanceSpec, videoAspectInfo, type VideoQuality } from '@/lib/videoModels';
import { isMusicFailure, withoutMusic } from '@/lib/video/shared';

/**
 * What happens when a video job ends without a video. Veo reports its safety filter (and
 * Seedance 2.5 a refused real face) only when the job finishes, long after credits were
 * charged at submission, so the charge is found here by operation id: a take stopped by
 * Seedance's music check is re-rendered once with the same prompt and no music, a filtered
 * take once with a neutral prompt, a refused face once on a model that takes it, and
 * anything that still fails is refunded exactly once.
 */

/** A policy-neutral Seedance reference film for the one retry after its safety check refused a take. */
function safeReferencePrompt(aspectRatio?: string): string {
  const orientation = videoAspectInfo(aspectRatio).orientation;
  return [
    `${orientation.charAt(0).toUpperCase()}${orientation.slice(1)} calm product film. The product in the reference images is the only subject: no people, no hands.`,
    'The product is exactly the one in the reference images; keep its colours, materials, shape and any printed text exactly as they are.',
    'Shot 1: Close-up. Soft warm light glides slowly across the product. Slow push-in.',
    'Shot 2: Wide shot. The product stands still in a softly lit, neutral room. Slow pull-back. Hold on this final frame.',
    // No music: the music check is the most common reason a Seedance take is stopped.
    'Sound: soft natural ambient sound only; no music, no voice.',
    'Constraints: keep it subtitle-free and avoid generating any text or subtitles; do not add any logo or watermark that is not on the product itself; no morphing; no flicker.',
  ].join('\n');
}

export interface VideoFailureOutcome {
  done: boolean;
  progress: number;
  error?: string;
  /** A retry was submitted; the client should poll this operation instead. */
  retryOperationId?: string;
  /** What the retry renders (it can be another model), so the client offers the right upgrades. */
  retryVideo?: { model: string; engine: string; quality: VideoQuality; durationSeconds: number; nativeDraft: boolean };
  message?: string;
}

interface ChargeRow {
  id: string;
  user_id: string;
  credit_cost: number;
  metadata: Record<string, unknown>;
}

async function findCharge(operationId: string): Promise<ChargeRow | null> {
  const admin = createServiceClient();
  const byList = await admin
    .from('usage_logs')
    .select('id,user_id,credit_cost,metadata')
    .eq('feature', 'video_generation')
    .contains('metadata', { operationIds: [operationId] })
    .limit(1);
  if (byList.data?.[0]) return byList.data[0] as ChargeRow;
  // Older rows (and plain img2vid) only recorded a single operationId.
  const bySingle = await admin
    .from('usage_logs')
    .select('id,user_id,credit_cost,metadata')
    .eq('feature', 'video_generation')
    .eq('metadata->>operationId', operationId)
    .limit(1);
  return (bySingle.data?.[0] as ChargeRow | undefined) ?? null;
}

export async function handleFailedVideo(operationId: string, error: string): Promise<VideoFailureOutcome> {
  const admin = createServiceClient();
  const engine = isSeedanceOperation(operationId) ? ('seedance' as const) : ('veo' as const);
  const engineName = engine === 'seedance' ? 'Seedance' : 'Veo';
  // Seedance 2.x refused a frame with a real person's face.
  const face = /PrivacyInformation/.test(error);
  // Seedance's music check: the music it generated sounded too close to an existing song.
  // The video itself was fine, so the same prompt is rendered again without music.
  const music = !face && isMusicFailure(error);
  const filtered = !face && !music && /filter|safety|polic|responsible ai|rai|sensitive/i.test(error);
  const row = await findCharge(operationId).catch((e) => {
    console.warn('Could not look up the video charge:', e);
    return null;
  });
  const meta = row?.metadata ?? {};
  const text = (key: string) => (typeof meta[key] === 'string' ? (meta[key] as string) : undefined);
  const retries = Number(meta.retries) || 0;
  const heroUrl = text('heroUrl');
  const operationIds = Array.isArray(meta.operationIds) ? (meta.operationIds as string[]) : [operationId];
  const prompt = text('prompt');
  // The take being retried keeps its length, quality (a draft stays a draft) and seed.
  const quality = text('quality') as VideoQuality | undefined;
  const duration = Number(meta.durationSeconds) || 8;
  const seed = typeof meta.seed === 'number' ? meta.seed : undefined;
  // And its shape.
  const aspectRatio = videoAspectInfo(text('aspectRatio')).id;
  const neutralNegative = 'people, person, hands, text, captions, logos, morphing, warped or changing product';
  // A Seedance reference film is rebuilt from its reference images, not from a first frame.
  const references = Array.isArray(meta.referenceImageUrls)
    ? (meta.referenceImageUrls as unknown[]).filter((url): url is string => typeof url === 'string')
    : [];
  const neutralPrompt = references.length ? safeReferencePrompt(aspectRatio) : safeVeoPrompt();

  // One more take where it can help: the same clip without music after the music check, on a
  // model that takes a real face, or with a neutral, product-only prompt after a safety rejection.
  const silentPrompt = music && prompt ? withoutMusic(prompt) : null;
  const retry: { submit: () => Promise<VideoJob>; message: (job: VideoJob) => string } | null =
    !row || retries >= 1 || !heroUrl
      ? null
      : silentPrompt
        ? {
            submit: () => submitVideoJob({
              engine,
              model: engine === 'seedance' ? text('videoModel') : undefined,
              imageUrl: heroUrl,
              lastFrameUrl: meta.lastFramePinned === true ? heroUrl : undefined,
              referenceImageUrls: references.length ? references : undefined,
              prompt: silentPrompt,
              promptIsFinal: meta.promptIsFinal === true,
              negativePrompt: text('negativePrompt'),
              aspectRatio,
              duration,
              quality,
              seed,
              cameraFixed: meta.cameraFixed === true,
              realFace: meta.realFace === true,
              needsAudio: meta.needsAudio === true,
            }),
            message: () => `${engineName}’s music check stopped the first take (the music it made sounded like an existing song). Rendering the same video again without music…`,
          }
      : face && prompt && references.length === 0
        ? {
            submit: () => submitFaceSafeVideoJob({
              engine: 'seedance',
              imageUrl: heroUrl,
              lastFrameUrl: meta.lastFramePinned === true ? heroUrl : undefined,
              prompt,
              negativePrompt: text('negativePrompt'),
              aspectRatio,
              duration,
              quality,
              seed,
              cameraFixed: meta.cameraFixed === true,
              needsAudio: meta.needsAudio === true,
              promptIsFinal: meta.promptIsFinal === true,
            }, text('videoModel') ?? ''),
            message: (job) => `${job.notice ?? 'Seedance refused the frame.'} Re-rendering…`,
          }
        : filtered
          ? {
              submit: () => submitVideoJob({
                engine,
                model: engine === 'seedance' ? text('videoModel') : undefined,
                imageUrl: heroUrl,
                referenceImageUrls: references.length ? references : undefined,
                prompt: neutralPrompt,
                promptIsFinal: references.length > 0,
                negativePrompt: neutralNegative,
                aspectRatio,
                duration,
                quality,
              }),
              message: () => `${engineName}’s safety filter rejected the first take. Re-rendering with a neutral, product-only prompt…`,
            }
          : null;

  if (retry && row) {
    try {
      const job = await retry.submit();
      // Claim the retry atomically so two polls cannot both resubmit.
      const claimed = await admin
        .from('usage_logs')
        .update({
          metadata: {
            ...meta,
            operationIds: [...operationIds, job.operationName],
            retries: retries + 1,
            lastError: error.slice(0, 300),
            // The row now describes the retried take, which is what the user sees and can upgrade.
            firstModel: meta.firstModel ?? meta.videoModel ?? null,
            videoEngine: job.engine,
            videoModel: job.model,
            quality: job.quality,
            draft: job.quality === 'draft',
            nativeDraft: job.nativeDraft === true,
            seed: job.seed ?? null,
            durationSeconds: job.durationSeconds,
            ...(face ? {} : silentPrompt ? { prompt: silentPrompt } : { prompt: neutralPrompt, negativePrompt: neutralNegative, promptIsFinal: references.length > 0 }),
          },
        })
        .eq('id', row.id)
        .eq('metadata->>retries', String(retries))
        .select('id');
      if (claimed.data?.length) {
        console.log(`Video ${operationId}: ${face ? 'real face refused' : music ? 'music check' : 'filtered'}; retrying once as ${job.operationName} (${job.model})`);
        return {
          done: false,
          progress: 0,
          retryOperationId: job.operationName,
          retryVideo: { model: job.model, engine: job.engine, quality: job.quality, durationSeconds: job.durationSeconds, nativeDraft: job.nativeDraft === true },
          message: retry.message(job),
        };
      }
    } catch (retryError) {
      console.warn('Video retry could not be submitted:', retryError);
    }
  }

  // Refund once: only the poll that flips `refunded` from null pays it back.
  let refunded = meta.refunded === true;
  if (row && !refunded && row.credit_cost > 0) {
    const claimed = await admin
      .from('usage_logs')
      .update({ metadata: { ...meta, refunded: true, refundReason: error.slice(0, 300), refundedAt: new Date().toISOString() } })
      .eq('id', row.id)
      .is('metadata->>refunded', null)
      .select('id');
    if (claimed.data?.length) {
      await refundCreditsForUser(row.user_id, row.credit_cost);
      refunded = true;
      console.log(`Video ${operationId}: refunded ${row.credit_cost} credits to ${row.user_id}`);
    }
  }

  const credits = row?.credit_cost ? `${row.credit_cost} video credits` : 'your video credits';
  const refundNote = refunded ? `Your ${credits} were refunded.` : '';
  return {
    done: true,
    progress: 0,
    error: face
      ? `${text('videoModel') ? seedanceSpec(text('videoModel') as string).name : 'Seedance 2.x'} does not accept a frame with a real person's face${retries > 0 ? ', and the retry did not render either' : ''}. ${refundNote} For photos of real models pick Seedance 1.0 Pro or Veo.`.replace(/\s+/g, ' ').trim()
      : music
        ? `${engineName}’s music check stopped this video${retries > 0 ? ' twice, the second time with no music' : ''}: the music it generated sounded too close to an existing song. The video itself was fine. ${refundNote} Tap “Try again”: the sound comes out different every time.`.replace(/\s+/g, ' ').trim()
        : filtered
          ? `${engineName}’s safety filter rejected this video${retries > 0 ? ', including a retry with a neutral product-only prompt' : ''}. ${refundNote} ${meta.sensitive === true ? 'Products like intimate wear trip this filter; a product photo without a model tends to get through.' : 'Tap “Try again” to change the shots before it renders again.'}`.replace(/\s+/g, ' ').trim()
          : `Video generation failed: ${error}. ${refundNote}`.trim(),
  };
}

/** A finished file in our own video bucket (not a provider's short-lived link or inline data). */
function isKeptVideoUrl(url: string): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  return Boolean(base) && url.startsWith(`${base}/storage/v1/object/public/generated-videos/`);
}

/** The saved file of a finished take, so polling it again (the Video Studio resuming) needs no download. */
export async function findSavedVideo(operationId: string): Promise<string | null> {
  const row = await findCharge(operationId);
  const urls = row?.metadata.videoUrls;
  const url = urls && typeof urls === 'object' ? (urls as Record<string, unknown>)[operationId] : undefined;
  return typeof url === 'string' ? url : null;
}

/** Keeps a finished take's file on its usage row, for the Video Studio's history. */
export async function saveFinishedVideo(operationId: string, url: string): Promise<void> {
  if (!isKeptVideoUrl(url)) return;
  const row = await findCharge(operationId);
  if (!row) return;
  const urls = row.metadata.videoUrls && typeof row.metadata.videoUrls === 'object' ? (row.metadata.videoUrls as Record<string, unknown>) : {};
  if (urls[operationId] === url) return;
  const { error } = await createServiceClient()
    .from('usage_logs')
    .update({ metadata: { ...row.metadata, videoUrl: url, videoUrls: { ...urls, [operationId]: url }, completedAt: new Date().toISOString() } })
    .eq('id', row.id);
  if (error) console.warn('Could not save the finished video:', error.message);
}
