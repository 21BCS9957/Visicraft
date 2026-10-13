import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { imageToBase64 } from '@/lib/banana/api';
import { isOwnStorageUrl, loadVideoProject } from '@/lib/server/playground/db';
import { ApiError } from '@/lib/server/playground/http';
import { inspectFaces } from '@/lib/server/referenceImages';
import { resolveSeedanceModel, seedanceFaceModelReady } from '@/lib/server/seedance';
import { requireAuthenticatedUser } from '@/lib/server/usage';
import { readyFaceAssets } from '@/lib/server/videoFaces';
import { saveVideoReview, type VideoReview, type VideoReviewFrame } from '@/lib/server/videoReview';
import { normalizeVideoQuality, seedanceSpec, snapVideoAspect, snapVideoDuration, VIDEO_ASPECTS, videoCredits, videoEngineOf, type VideoAspect } from '@/lib/videoModels';

export const maxDuration = 60;

const MAX_PROMPT_CHARS = 1500;
/** Photos of a verified face sent with a video. */
const MAX_FACE_PHOTOS = 3;

/** The shape nearest to the image's own (Seedance 2.5 keeps a first frame's shape). */
async function imageShape(url: string): Promise<VideoAspect | null> {
  try {
    const dataUrl = await imageToBase64(url);
    const { width, height } = await sharp(Buffer.from(dataUrl.split(',')[1] ?? '', 'base64')).metadata();
    if (!width || !height) return null;
    const distance = (id: string) => {
      const [w, h] = id.split(':').map(Number);
      return Math.abs(Math.log((width / height) / (w / h)));
    };
    return VIDEO_ASPECTS.reduce((best, aspect) => (distance(aspect.id) < distance(best.id) ? aspect : best)).id;
  } catch {
    return null;
  }
}

/** A short title for the video's history, from the prompt's first words. */
function titleOf(prompt: string): string {
  const words = prompt.replace(/\s+/g, ' ').trim().split(' ');
  return words.length > 8 ? `${words.slice(0, 8).join(' ')}…` : words.join(' ');
}

/**
 * Quick video: the user's own prompt (and, if they want, one image to start from and/or a
 * verified face) goes straight to Seedance, with no product capture and no prompt writing.
 * Like every video, it is first saved for approval; nothing is charged until it is approved
 * (POST /api/video/render).
 *
 * - a verified face: a Seedance 2.x reference film (the face as Image 1, their image after);
 * - an image: Seedance animates it. A real person's face in it is checked for first: Seedance
 *   2.x refuses those, so it goes to the face model (Seedance 1.0 Pro, silent) when that is
 *   switched on, and is turned down here, before approval, when it isn't;
 * - neither: text-to-video in the shape picked.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json().catch(() => ({}))) as {
      prompt?: unknown; imageUrl?: unknown; faceId?: unknown; model?: unknown; durationSeconds?: unknown; quality?: unknown; aspectRatio?: unknown; projectId?: unknown;
    };
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (prompt.length < 3) throw new ApiError(400, 'Describe the video in a sentence or two.', 'bad_request');
    if (prompt.length > MAX_PROMPT_CHARS) throw new ApiError(400, `Keep the prompt under ${MAX_PROMPT_CHARS} characters.`, 'bad_request');
    const imageUrl = typeof body.imageUrl === 'string' && body.imageUrl ? body.imageUrl : null;
    if (imageUrl && !isOwnStorageUrl(imageUrl)) throw new ApiError(400, 'Upload the image first.', 'bad_request');
    const faceId = typeof body.faceId === 'string' && body.faceId ? body.faceId : null;

    // Quick videos are Seedance; a reference film (a verified face) needs the 2.x series.
    let model = resolveSeedanceModel(typeof body.model === 'string' ? body.model : undefined);
    if (videoEngineOf(model) !== 'seedance' || (faceId && seedanceSpec(model).family === '1.0')) model = resolveSeedanceModel(undefined);
    let aspect = snapVideoAspect(model, typeof body.aspectRatio === 'string' ? body.aspectRatio : undefined);
    let mode: VideoReview['mode'] = 'first_frame';
    let frames: VideoReviewFrame[] = [];
    let realFace = false;
    let finalPrompt = prompt;
    const notes: string[] = [];

    if (faceId) {
      const face = await readyFaceAssets(user.id, faceId);
      mode = 'reference';
      frames = face.assets.slice(0, MAX_FACE_PHOTOS).map((asset, index) => ({
        url: asset.url,
        preview: asset.preview,
        label: index === 0 ? `${face.name} · verified face` : `${face.name} · another photo`,
        kind: 'face',
      }));
      const faceImages = frames.map((_, index) => `Image ${index + 1}`).join(' and ');
      if (imageUrl) frames.push({ url: imageUrl, label: 'Your image', kind: 'photo' });
      finalPrompt = `${prompt}\n\nThe person in this video is ${face.name}, exactly as in ${faceImages}.${imageUrl ? ` Image ${frames.length} shows what else to feature.` : ''}`;
      notes.push(`${face.name}’s verified face is in this video, so Seedance keeps it and the video can have sound.`);
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
        aspect = (await imageShape(imageUrl)) ?? aspect;
        notes.push('The video starts from your image and keeps its shape.');
      } else {
        notes.push('The video starts from your image.');
      }
    } else {
      notes.push('No image: Seedance makes the whole video from your prompt.');
    }

    const seconds = snapVideoDuration(model, Number(body.durationSeconds));
    const quality = normalizeVideoQuality(model, typeof body.quality === 'string' ? body.quality : undefined);
    const review: VideoReview = {
      engine: 'seedance',
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
    const project = await loadVideoProject(user.id, body.projectId).catch(() => null);
    const reviewId = await saveVideoReview(user, review, {
      requestedVideoModel: model,
      projectId: project?.id ?? null,
      productTitle: titleOf(prompt),
      promptWriter: 'user',
      quick: true,
      textOnly: frames.length === 0,
      faceId,
      heroFrameUrl: imageUrl ?? frames.find((frame) => frame.preview)?.preview ?? null,
    });
    return NextResponse.json({ reviewId, review });
  } catch (error) {
    if (error instanceof ApiError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    const message = error instanceof Error ? error.message : 'The video could not be prepared';
    return NextResponse.json({ error: message }, { status: message.includes('Authentication required') ? 401 : 500 });
  }
}
