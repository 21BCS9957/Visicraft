import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import type { User } from '@supabase/supabase-js';
import { imageToBase64 } from '@/lib/banana/api';
import { isOwnStorageUrl, loadVideoProject } from '@/lib/server/playground/db';
import { ExtendRejected, extendImage } from '@/lib/server/playground/extend';
import { ApiError } from '@/lib/server/playground/http';
import { savePlaygroundImage, type SavedImage } from '@/lib/server/playground/images';
import { inspectFaces } from '@/lib/server/referenceImages';
import { requireAgency, requireClient } from '@/lib/server/clients';
import { createServiceClient } from '@/lib/supabase/server';
import { resolveSeedanceModel, seedanceFaceModelReady } from '@/lib/server/seedance';
import { deductCreditsForUser, logUsage, refundCreditsForUser, requireAuthenticatedUser } from '@/lib/server/usage';
import { readyFaceAssets } from '@/lib/server/videoFaces';
import { saveVideoReview, type VideoReview, type VideoReviewFrame } from '@/lib/server/videoReview';
import { START_EXTEND_CREDITS, START_EXTEND_MODEL, START_EXTEND_PRICE, START_EXTEND_SIZE } from '@/lib/video/startExtend';
import { isVideoAspect, normalizeVideoQuality, seedanceSpec, snapVideoAspect, snapVideoDuration, VIDEO_ASPECTS, videoCredits, videoEngineOf, type VideoAspect } from '@/lib/videoModels';

/** Extending a start image to another shape takes up to about a minute and a half. */
export const maxDuration = 150;

/** The Studio's box stops at 1,500; the Create tab's "Improve prompt" writes up to about 3,000. */
const MAX_PROMPT_CHARS = 4000;
/** Photos of a verified face sent with a video. */
const MAX_FACE_PHOTOS = 3;
/** Images a Seedance 2.x reference film takes (the render route sends at most 9). */
const MAX_REFERENCE_IMAGES = 9;
const VEO_START_IMAGE = 'Google Veo needs a start image: add one, or pick Seedance to make a video from words alone.';

/** An image's width ÷ height, or null if it can't be read. */
async function imageRatio(url: string): Promise<number | null> {
  try {
    const dataUrl = await imageToBase64(url);
    const { width, height } = await sharp(Buffer.from(dataUrl.split(',')[1] ?? '', 'base64')).metadata();
    return width && height ? width / height : null;
  } catch {
    return null;
  }
}

/** How far a ratio is from a shape (0 = the same). */
const shapeDistance = (ratio: number, aspect: string) => {
  const [w, h] = aspect.split(':').map(Number);
  return Math.abs(Math.log(ratio / (w / h)));
};

/** The shape nearest to an image's own (Seedance 2.5 keeps a first frame's shape). */
function nearestShape(ratio: number | null): VideoAspect | null {
  if (!ratio) return null;
  return VIDEO_ASPECTS.reduce((best, aspect) => (shapeDistance(ratio, aspect.id) < shapeDistance(ratio, best.id) ? aspect : best)).id;
}

/**
 * The start image extended to the video's shape (the Playground's Extend: the image itself stays
 * exact, new space is painted around it). Charged here, before the video's approval, and
 * refunded if it fails.
 */
async function extendStartImage(user: User, url: string, ratio: VideoAspect, videoCost: number, metadata: Record<string, unknown>): Promise<SavedImage> {
  // Both must be affordable, so an image is never extended for a video that can't then be made.
  if (!(await deductCreditsForUser(user.id, START_EXTEND_CREDITS + videoCost))) {
    throw new ApiError(402, `Extending your image to ${ratio} (${START_EXTEND_CREDITS} credits) and the video (${videoCost}) need ${START_EXTEND_CREDITS + videoCost} credits, and you don’t have enough. Top up, or pick “Match image”.`, 'insufficient_credits');
  }
  await refundCreditsForUser(user.id, videoCost);
  try {
    const extended = await extendImage({ sourceUrl: url, model: START_EXTEND_MODEL, size: START_EXTEND_SIZE, ratio, deadline: Date.now() + 110_000 });
    const saved = await savePlaygroundImage(extended.bytes, extended.mimeType);
    await logUsage({
      user,
      provider: 'google',
      model: START_EXTEND_MODEL,
      feature: 'image_generation',
      inputTokens: extended.usage.inputTokens,
      outputTokens: extended.usage.outputTokens,
      totalTokens: extended.usage.totalTokens,
      // A step towards the video, not a creative of its own.
      imageCount: 0,
      estimatedCostUsd: START_EXTEND_PRICE.usd * extended.calls,
      creditCost: START_EXTEND_CREDITS,
      metadata: { ...metadata, mode: 'video_start_extend', ratio, calls: extended.calls },
    });
    return saved;
  } catch (error) {
    await refundCreditsForUser(user.id, START_EXTEND_CREDITS);
    if (error instanceof ExtendRejected && error.calls > 0) {
      await logUsage({
        user,
        provider: 'google',
        model: START_EXTEND_MODEL,
        feature: 'image_generation',
        inputTokens: error.usage.inputTokens,
        outputTokens: error.usage.outputTokens,
        totalTokens: error.usage.totalTokens,
        imageCount: 0,
        estimatedCostUsd: START_EXTEND_PRICE.usd * error.calls,
        creditCost: 0,
        metadata: { ...metadata, mode: 'video_start_extend', ratio, rejected: error.reason },
      }).catch(() => undefined);
    }
    const reason = error instanceof Error && error.message ? ` (${error.message.replace(/\.$/, '')})` : '';
    throw new ApiError(502, `Your image couldn’t be extended to ${ratio}${reason}. Nothing was charged. Try again, or pick “Match image”.`, 'extend_failed');
  }
}

/** The images that can't be opened (deleted since they were picked), by number. */
async function missingImages(urls: string[]): Promise<number[]> {
  const opens = await Promise.all(urls.map(async (url) => {
    try {
      const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
      return response.ok;
    } catch {
      // A slow answer isn't proof it's gone; the render will tell.
      return true;
    }
  }));
  return opens.map((ok, index) => (ok ? 0 : index + 1)).filter(Boolean);
}

/** A short title for the video's history, from the prompt's first words. */
function titleOf(prompt: string): string {
  const words = prompt.replace(/\s+/g, ' ').trim().split(' ');
  return words.length > 8 ? `${words.slice(0, 8).join(' ')}…` : words.join(' ');
}

/**
 * Quick video: the user's own prompt (and, if they want, images and/or a verified face) goes
 * straight to the engine, with no product capture and no prompt writing. Like every video, it
 * is first saved for approval; nothing is charged until it is approved (POST /api/video/render).
 * The Studio approves it on its card; the Create tab approves it at once (its panel is the review).
 *
 * Seedance:
 * - a verified face: a Seedance 2.x reference film (the face as Image 1, their images after);
 * - several images, or one used as a reference (`imageRole: 'reference'`): a 2.x reference
 *   film, Image 1..N. Seedance 2.x refuses real faces, so a face in any of them is turned down;
 * - one image as the start: Seedance animates it. A real person's face in it is checked for
 *   first: it goes to the face model (Seedance 1.0 Pro, silent) when that is switched on, and
 *   is turned down here, before approval, when it isn't;
 * - none: text-to-video in the shape picked.
 *
 * Google Veo animates one start image (it takes real people; it has no text-only mode here).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json().catch(() => ({}))) as {
      prompt?: unknown; imageUrl?: unknown; imageUrls?: unknown; imageRole?: unknown; faceId?: unknown; model?: unknown; durationSeconds?: unknown;
      quality?: unknown; aspectRatio?: unknown; projectId?: unknown; clientId?: unknown; surface?: unknown;
      /** 'extend': a Seedance 2.5 start image is extended to `aspectRatio` first (it keeps its own shape otherwise). */
      reshape?: unknown;
    };
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (prompt.length < 3) throw new ApiError(400, 'Describe the video in a sentence or two.', 'bad_request');
    if (prompt.length > MAX_PROMPT_CHARS) throw new ApiError(400, `Keep the prompt under ${MAX_PROMPT_CHARS} characters.`, 'bad_request');
    // One image (the Studio) or several (the Create tab), in order, each one of ours.
    const images = [...new Set([
      ...(Array.isArray(body.imageUrls) ? body.imageUrls : []),
      ...(typeof body.imageUrl === 'string' ? [body.imageUrl] : []),
    ].filter((url): url is string => typeof url === 'string' && url.length > 0))];
    if (images.some((url) => !isOwnStorageUrl(url))) throw new ApiError(400, 'Upload the image first.', 'bad_request');
    if (images.length > MAX_REFERENCE_IMAGES) throw new ApiError(400, `Use at most ${MAX_REFERENCE_IMAGES} images.`, 'bad_request');
    // An image deleted since it was picked would only fail at render: say so now.
    const missing = images.length ? await missingImages(images) : [];
    if (missing.length) {
      throw new ApiError(400, `${missing.length === 1 ? `Image ${missing[0]} can’t` : `Images ${missing.join(', ')} can’t`} be opened any more (deleted?). Remove ${missing.length === 1 ? 'it' : 'them'} and add ${missing.length === 1 ? 'it' : 'them'} again.`, 'missing_image');
    }
    const imageUrl = images[0] ?? null;
    const asReferences = images.length > 1 || (images.length === 1 && body.imageRole === 'reference');
    const faceId = typeof body.faceId === 'string' && body.faceId ? body.faceId : null;
    const asked = typeof body.model === 'string' ? body.model : undefined;
    const veo = videoEngineOf(asked) === 'veo';

    // The client the video is for (GoGrowth accounts only): its spend counts for that client.
    let clientId: string | null = null;
    if (typeof body.clientId === 'string' && body.clientId) {
      await requireAgency(user.id);
      clientId = (await requireClient(createServiceClient(), body.clientId)).id;
    }

    // Seedance unless Veo is asked for; a reference film (several images, a verified face) needs the 2.x series.
    let model = veo ? asked! : resolveSeedanceModel(asked);
    if (!veo && (videoEngineOf(model) !== 'seedance' || ((faceId || asReferences) && seedanceSpec(model).family === '1.0'))) model = resolveSeedanceModel(undefined);
    let aspect = snapVideoAspect(model, typeof body.aspectRatio === 'string' ? body.aspectRatio : undefined);
    let mode: VideoReview['mode'] = 'first_frame';
    let frames: VideoReviewFrame[] = [];
    let realFace = false;
    let finalPrompt = prompt;
    const notes: string[] = [];
    /** The shape the start image is extended to before the video (Seedance 2.5 keeps an image's shape). */
    let extendTo: VideoAspect | null = null;

    if (veo) {
      if (faceId) throw new ApiError(400, 'Verified faces are for Seedance. Google Veo takes the person straight from your image.', 'bad_request');
      if (!imageUrl) throw new ApiError(400, VEO_START_IMAGE, 'needs_image');
      frames = [{ url: imageUrl, label: 'Your image', kind: 'photo' }];
      notes.push('The video starts from your image. Veo keeps real people as they are.');
      if (images.length > 1) notes.push(`Veo takes one start image, so only the first of your ${images.length} images is used.`);
    } else if (faceId) {
      const face = await readyFaceAssets(user.id, faceId);
      mode = 'reference';
      frames = face.assets.slice(0, MAX_FACE_PHOTOS).map((asset, index) => ({
        url: asset.url,
        preview: asset.preview,
        label: index === 0 ? `${face.name} · verified face` : `${face.name} · another photo`,
        kind: 'face',
      }));
      const faceImages = frames.map((_, index) => `Image ${index + 1}`).join(' and ');
      const faces = frames.length;
      for (const url of images.slice(0, MAX_REFERENCE_IMAGES - faces)) frames.push({ url, label: 'Your image', kind: 'photo' });
      const extra = frames.length - faces;
      finalPrompt = `${prompt}\n\nThe person in this video is ${face.name}, exactly as in ${faceImages}.${extra === 1 ? ` Image ${frames.length} shows what else to feature.` : extra > 1 ? ` Images ${faces + 1}–${frames.length} show what else to feature.` : ''}`;
      notes.push(`${face.name}’s verified face is in this video, so Seedance keeps it and the video can have sound.`);
    } else if (asReferences) {
      // A reference film: Seedance builds the video from all the images; the prompt names them.
      mode = 'reference';
      frames = images.map((url, index) => ({ url, label: `Image ${index + 1}`, kind: 'photo' }));
      const { faces } = await inspectFaces(images).catch(() => ({ faces: images.map(() => false) }));
      const withFace = faces.map((face, index) => (face ? index + 1 : 0)).filter(Boolean);
      if (withFace.length) {
        throw new ApiError(409, `${withFace.length === 1 ? `Image ${withFace[0]} shows` : `Images ${withFace.join(', ')} show`} a real person’s face, which Seedance 2.5 refuses. Use images without faces, or Google Veo (it keeps real people).`, 'real_face');
      }
      notes.push(`Seedance builds the video from your ${images.length === 1 ? 'image' : `${images.length} images`}; name ${images.length === 1 ? 'it “Image 1”' : 'them “Image 1”, “Image 2”…'} in the prompt to say which goes where.`);
    } else if (imageUrl) {
      frames = [{ url: imageUrl, label: 'Your image', kind: 'photo' }];
      // The face check costs nothing to the user; if it can't run, Seedance's own check still catches a face at render.
      const { faces } = await inspectFaces([imageUrl]).catch(() => ({ faces: [false] }));
      realFace = faces[0] === true && !seedanceSpec(model).realFaces;
      if (realFace) {
        const faceModel = await seedanceFaceModelReady();
        if (!faceModel.ready || !faceModel.model) {
          throw new ApiError(409, 'This image shows a real person’s face. Seedance 2.5 can’t use real faces, and Seedance 1.0 Pro (which can) isn’t switched on in your BytePlus account yet. Use an image without a face, or add the person under Faces.', 'real_face');
        }
        model = faceModel.model;
        aspect = snapVideoAspect(model, aspect);
        notes.push(`This image shows a real person’s face, which Seedance 2.5 refuses, so it renders with ${seedanceSpec(model).name}: no sound, up to ${seedanceSpec(model).maxSeconds} seconds.`);
      } else if (seedanceSpec(model).family === '2.5') {
        const own = await imageRatio(imageUrl);
        const wanted = body.reshape === 'extend' && isVideoAspect(body.aspectRatio) ? body.aspectRatio : null;
        if (wanted && own && shapeDistance(own, wanted) > 0.04) {
          extendTo = wanted;
          aspect = wanted;
        } else {
          aspect = wanted ?? nearestShape(own) ?? aspect;
          notes.push('The video starts from your image and keeps its shape.');
        }
      } else {
        notes.push('The video starts from your image.');
      }
    } else {
      notes.push('No image: Seedance makes the whole video from your prompt.');
    }

    const seconds = snapVideoDuration(model, Number(body.durationSeconds));
    const quality = normalizeVideoQuality(model, typeof body.quality === 'string' ? body.quality : undefined);
    const project = await loadVideoProject(user.id, body.projectId).catch(() => null);
    if (extendTo && imageUrl) {
      const extended = await extendStartImage(user, imageUrl, extendTo, videoCredits(model, quality, seconds, extendTo), {
        ...(project ? { projectId: project.id } : {}),
        ...(clientId ? { clientId } : {}),
        ...(body.surface === 'create' ? { surface: 'create' } : {}),
      });
      frames = [{ url: extended.imageUrl, preview: extended.previewUrl, label: `Your image, extended to ${extendTo}`, kind: 'photo' }];
      notes.push(`Your image was extended to ${extendTo} first (${START_EXTEND_CREDITS} credits, the product untouched), so the video comes out ${extendTo}.`);
    }
    const review: VideoReview = {
      engine: veo ? 'veo' : 'seedance',
      model,
      quality,
      durationSeconds: seconds,
      aspectRatio: aspect,
      mode,
      frames,
      prompt: finalPrompt,
      credits: videoCredits(model, quality, seconds, aspect),
      notes,
      lastFramePinned: false,
      cameraFixed: false,
      realFace,
      needsAudio: false,
      writtenBy: 'Your prompt, sent as you wrote it',
    };
    const reviewId = await saveVideoReview(user, review, {
      requestedVideoModel: model,
      projectId: project?.id ?? null,
      productTitle: titleOf(prompt),
      promptWriter: 'user',
      quick: true,
      textOnly: frames.length === 0,
      faceId,
      heroFrameUrl: (extendTo ? frames[0]?.url : imageUrl) ?? frames.find((frame) => frame.preview)?.preview ?? null,
      ...(extendTo ? { startExtended: { ratio: extendTo, from: imageUrl, credits: START_EXTEND_CREDITS } } : {}),
      ...(clientId ? { clientId } : {}),
      // Where it was made: the Create tab lists only its own videos.
      ...(body.surface === 'create' ? { surface: 'create' } : {}),
    });
    return NextResponse.json({ reviewId, review });
  } catch (error) {
    if (error instanceof ApiError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    const message = error instanceof Error ? error.message : 'The video could not be prepared';
    return NextResponse.json({ error: message }, { status: message.includes('Authentication required') ? 401 : 500 });
  }
}
