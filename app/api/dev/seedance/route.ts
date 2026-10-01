import { NextRequest, NextResponse } from 'next/server';
import { checkSeedanceAccess, isSeedanceConfigured, pollSeedanceJob, seedancePrompt, seedanceResolution } from '@/lib/server/seedance';
import { submitVideoJob } from '@/lib/server/video';
import { SEEDANCE_MODELS, seedanceUsdPerSecond } from '@/lib/videoModels';

/**
 * Development-only Seedance harness.
 * GET: which Seedance models ARK_API_KEY can use (each gets a request ModelArk rejects
 *   before generating, so nothing is billed), with every model's limits and list price.
 * POST { prompt, negativePrompt?, cameraFixed? }: the prompt Seedance would receive (no API call).
 * POST { frameUrl, prompt, model?, ... , submit: true }: a real Seedance job (billed).
 * POST { operationId }: polls it.
 */
function catalog() {
  return SEEDANCE_MODELS.map((model) => ({
    id: model.id,
    name: model.name,
    resolutions: model.resolutions,
    seconds: `${model.minSeconds}-${model.maxSeconds}`,
    pinnedLastFrame: model.lastFrame,
    sound: model.audio,
    lockedCamera: model.cameraFixed,
    acceptsRealFaces: model.realFaces,
    // What the app uses now: SEEDANCE_RESOLUTION capped to the model.
    appResolution: seedanceResolution(model.id),
    usdPer8sVertical: Object.fromEntries(model.resolutions.map((r) => [r, Number((seedanceUsdPerSecond(model.id, r) * 8).toFixed(2))])),
  }));
}

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!isSeedanceConfigured()) {
    return NextResponse.json({
      configured: false,
      message: 'Set ARK_API_KEY (BytePlus ModelArk → API keys) in .env.local and restart the dev server, then open this page again.',
      models: catalog(),
    });
  }
  try {
    const access = await checkSeedanceAccess();
    const byId = new Map(access.models.map((m) => [m.id, m]));
    return NextResponse.json({
      configured: true,
      keyValid: access.keyValid,
      baseUrl: access.baseUrl,
      note: access.note,
      models: catalog().map((model) => ({ ...model, access: byId.get(model.id)?.status ?? 'unknown', detail: byId.get(model.id)?.detail })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = (await request.json()) as {
    operationId?: string;
    frameUrl?: string;
    prompt?: string;
    negativePrompt?: string;
    model?: string;
    resolution?: string;
    duration?: number;
    pinLastFrame?: boolean;
    cameraFixed?: boolean;
    realFace?: boolean;
    needsAudio?: boolean;
    submit?: boolean;
  };
  try {
    if (body.operationId) return NextResponse.json(await pollSeedanceJob(body.operationId));
    if (!body.prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    if (!body.submit || !body.frameUrl) {
      return NextResponse.json({ prompt: seedancePrompt(body.prompt, { negativePrompt: body.negativePrompt, cameraFixed: body.cameraFixed }) });
    }
    const job = await submitVideoJob({
      engine: 'seedance',
      model: body.model,
      imageUrl: body.frameUrl,
      lastFrameUrl: body.pinLastFrame ? body.frameUrl : undefined,
      prompt: body.prompt,
      negativePrompt: body.negativePrompt,
      resolution: body.resolution,
      aspectRatio: '9:16',
      duration: body.duration ?? 8,
      cameraFixed: body.cameraFixed,
      realFace: body.realFace,
      needsAudio: body.needsAudio,
    });
    return NextResponse.json(job);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
