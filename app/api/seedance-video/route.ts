import { NextRequest, NextResponse } from 'next/server';
import { normalizeSeedanceDuration } from '@/lib/workflow/seedance';

type MediaKind = 'image' | 'video' | 'audio';

const VALID_ASPECT_RATIOS = new Set(['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'auto']);

export async function POST(request: NextRequest) {
  try {
    const {
      referenceUrls = [],
      prompt,
      model,
      mode,
      aspectRatio,
      duration,
      resolution,
    } = await request.json();

    const apiKey = process.env.PIAPI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Seedance is not configured yet. Add PIAPI_API_KEY to the environment.' },
        { status: 500 }
      );
    }

    const selectedModel = model === 'seedance-2-fast' ? 'seedance-2-fast' : 'seedance-2';
    const selectedMode = typeof mode === 'string' ? mode : (referenceUrls.length > 0 ? 'omni_reference' : 'text_to_video');
    const selectedAspectRatio = VALID_ASPECT_RATIOS.has(aspectRatio) ? aspectRatio : '16:9';
    const selectedDuration = normalizeSeedanceDuration(duration);
    const refs = Array.isArray(referenceUrls)
      ? referenceUrls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
      : [];

    const classified = classifyReferenceUrls(refs);
    validateSeedanceRequest(selectedMode, classified);

    const input: Record<string, unknown> = {
      prompt: typeof prompt === 'string' ? prompt : '',
      mode: selectedMode,
      duration: selectedDuration,
      aspect_ratio: selectedAspectRatio,
    };

    if (resolution) input.resolution = resolution;
    if (classified.image.length > 0) input.image_urls = classified.image;
    if (classified.video.length > 0) input.video_urls = classified.video;
    if (classified.audio.length > 0) input.audio_urls = classified.audio;

    const response = await fetch('https://api.piapi.ai/api/v1/task', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        model: 'seedance',
        task_type: selectedModel,
        input,
        config: {
          service_mode: '',
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || data?.message || 'Failed to create Seedance task' },
        { status: response.status }
      );
    }

    const taskId = data?.data?.task_id || data?.task_id;
    const videoUrl = data?.data?.output?.video || data?.data?.output?.video_url;

    if (!taskId && !videoUrl) {
      return NextResponse.json({ error: 'Seedance did not return a task id' }, { status: 500 });
    }

    return NextResponse.json({ success: true, taskId, videoUrl });
  } catch (error) {
    console.error('Seedance video API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Seedance generation failed' },
      { status: 500 }
    );
  }
}

function classifyReferenceUrls(urls: string[]): Record<MediaKind, string[]> {
  return urls.reduce<Record<MediaKind, string[]>>(
    (groups, url) => {
      groups[getMediaKind(url)].push(url);
      return groups;
    },
    { image: [], video: [], audio: [] }
  );
}

function getMediaKind(url: string): MediaKind {
  if (url.startsWith('data:')) {
    throw new Error('Seedance references must be public HTTP(S) URLs, not browser-only data URLs.');
  }

  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.mp4') || clean.endsWith('.mov')) return 'video';
  if (clean.endsWith('.mp3') || clean.endsWith('.wav')) return 'audio';
  return 'image';
}

function validateSeedanceRequest(
  mode: string,
  refs: Record<MediaKind, string[]>
) {
  const totalReferences = refs.image.length + refs.video.length + refs.audio.length;

  if (mode === 'text_to_video') {
    if (totalReferences > 0) {
      throw new Error('Seedance text-to-video does not accept image, video, or audio references.');
    }
    return;
  }

  if (mode === 'first_last_frames') {
    if (refs.image.length < 1 || refs.image.length > 2) {
      throw new Error('Seedance first/last frames requires 1-2 image references.');
    }
    if (refs.video.length > 0 || refs.audio.length > 0) {
      throw new Error('Seedance first/last frames accepts images only.');
    }
    return;
  }

  if (mode !== 'omni_reference') {
    throw new Error('Unsupported Seedance mode.');
  }

  if (totalReferences < 1 || totalReferences > 12) {
    throw new Error('Seedance omni reference requires 1-12 references.');
  }

  if (refs.audio.length > 0 && refs.image.length === 0 && refs.video.length === 0) {
    throw new Error('Seedance audio references require at least one image or video reference.');
  }
}
