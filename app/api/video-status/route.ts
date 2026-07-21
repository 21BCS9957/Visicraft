import { NextRequest, NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';

type JsonRecord = Record<string, unknown>;

interface VideoAsset {
  bytes?: string;
  uri?: string;
  mimeType: string;
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstString(record: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function isImageBytes(base64: string): boolean {
  const signature = Buffer.from(base64.slice(0, 32), 'base64');
  const isJpeg = signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
  const isPng = signature.length >= 8
    && signature[0] === 0x89
    && signature.toString('ascii', 1, 4) === 'PNG';
  const isGif = signature.toString('ascii', 0, 3) === 'GIF';
  const isWebp = signature.toString('ascii', 0, 4) === 'RIFF'
    && signature.toString('ascii', 8, 12) === 'WEBP';
  return isJpeg || isPng || isGif || isWebp;
}

function extractVideoAsset(payload: unknown): VideoAsset | null {
  const response = asRecord(payload);
  if (!response) return null;

  const queue: unknown[] = [
    ...asArray(response.videos),
    ...asArray(response.generatedVideos),
    ...asArray(response.generatedSamples),
    ...asArray(response.predictions),
  ];

  for (let index = 0; index < queue.length && index < 40; index += 1) {
    const candidate = asRecord(queue[index]);
    if (!candidate) continue;

    const mimeType = firstString(candidate, ['mimeType', 'mime_type']) || 'video/mp4';
    const bytes = firstString(candidate, ['bytesBase64Encoded', 'videoBytes', 'bytes']);
    const uri = firstString(candidate, ['videoUri', 'gcsUri', 'uri', 'url']);

    if (bytes && mimeType.startsWith('video/') && !isImageBytes(bytes)) {
      return { bytes, mimeType };
    }

    if (uri && (mimeType.startsWith('video/') || /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(uri))) {
      return { uri, mimeType: mimeType.startsWith('video/') ? mimeType : 'video/mp4' };
    }

    for (const key of ['video', 'generatedVideo', 'videos', 'generatedVideos', 'generatedSamples']) {
      const nested = candidate[key];
      if (Array.isArray(nested)) queue.push(...nested);
      else if (asRecord(nested)) queue.push(nested);
    }
  }

  return null;
}

async function materializeVideo(asset: VideoAsset, accessToken: string): Promise<string | null> {
  if (asset.bytes) {
    return `data:${asset.mimeType};base64,${asset.bytes}`;
  }

  if (!asset.uri) return null;
  if (asset.uri.startsWith('https://') || asset.uri.startsWith('http://')) return asset.uri;
  if (!asset.uri.startsWith('gs://')) return null;

  const match = asset.uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) return null;

  const [, bucket, objectName] = match;
  const downloadEndpoint = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}?alt=media`;
  const downloadResponse = await fetch(downloadEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!downloadResponse.ok) {
    console.error('Failed to download generated video from Cloud Storage:', await downloadResponse.text());
    return null;
  }

  const contentType = downloadResponse.headers.get('content-type') || asset.mimeType;
  if (!contentType.startsWith('video/')) return null;

  const bytes = Buffer.from(await downloadResponse.arrayBuffer());
  return `data:${contentType};base64,${bytes.toString('base64')}`;
}

function getFilteredReason(response: JsonRecord): string | null {
  const count = Number(response.raiMediaFilteredCount || 0);
  if (count <= 0) return null;

  const reasons = asArray(response.raiMediaFilteredReasons)
    .filter((reason): reason is string => typeof reason === 'string' && reason.length > 0);
  return reasons.length > 0
    ? `Veo filtered the generated video: ${reasons.join(', ')}`
    : 'Veo filtered the generated video under its safety policy.';
}

export async function POST(request: NextRequest) {
  try {
    const { operationId } = await request.json();

    if (typeof operationId !== 'string' || operationId.length === 0) {
      return NextResponse.json({ error: 'Operation ID is required' }, { status: 400 });
    }

    const operationMatch = operationId.match(
      /^projects\/([A-Za-z0-9._-]+)\/locations\/([a-z0-9-]+)\/publishers\/google\/models\/([A-Za-z0-9._-]+)\/operations\/[A-Za-z0-9._-]+$/
    );
    if (!operationMatch) {
      return NextResponse.json({ error: 'Invalid Vertex operation ID' }, { status: 400 });
    }

    const serviceAccountJsonStr = process.env.GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJsonStr) {
      return NextResponse.json({ error: 'Video generation is not configured yet.' }, { status: 500 });
    }

    const credentials = JSON.parse(serviceAccountJsonStr);
    const [endpointPath] = operationId.split('/operations/');
    const [, projectId, location] = operationMatch;
    if (credentials.project_id && projectId !== credentials.project_id) {
      return NextResponse.json({ error: 'Operation belongs to a different Google Cloud project' }, { status: 403 });
    }

    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;

    if (!accessToken) {
      throw new Error('Failed to obtain access token from Google Auth.');
    }

    const pollEndpoint = `https://${location}-aiplatform.googleapis.com/v1/${endpointPath}:fetchPredictOperation`;
    const pollRes = await fetch(pollEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ operationName: operationId }),
    });

    if (!pollRes.ok) {
      const errText = await pollRes.text();
      return NextResponse.json({ error: `Polling failed: ${errText}` }, { status: pollRes.status });
    }

    const pollData = await pollRes.json();
    const operationError = asRecord(pollData.error);
    if (operationError) {
      return NextResponse.json({
        done: true,
        progress: 0,
        error: firstString(operationError, ['message']) || 'Video generation failed',
      });
    }

    if (pollData.done) {
      const response = asRecord(pollData.response);
      if (!response) {
        return NextResponse.json({
          done: true,
          progress: 100,
          error: 'Veo completed without a video response. Please retry the generation.',
        });
      }

      const filteredReason = getFilteredReason(response);
      if (filteredReason) {
        return NextResponse.json({ done: true, progress: 100, error: filteredReason });
      }

      const asset = extractVideoAsset(response);
      const videoUrl = asset ? await materializeVideo(asset, accessToken) : null;
      if (!videoUrl) {
        console.error('Veo completed without a usable video asset:', JSON.stringify(response).slice(0, 1000));
        return NextResponse.json({
          done: true,
          progress: 100,
          error: 'Veo completed but did not return playable video data. No image fallback was used.',
        });
      }

      return NextResponse.json({ done: true, progress: 100, url: videoUrl, mediaType: 'video' });
    }

    const metadata = asRecord(pollData.metadata);
    const progressPercentage = metadata && typeof metadata.progressPercentage === 'number'
      ? metadata.progressPercentage
      : 0;

    return NextResponse.json({ done: false, progress: progressPercentage });
  } catch (error) {
    console.error('Video status polling error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Polling failed' },
      { status: 500 }
    );
  }
}
