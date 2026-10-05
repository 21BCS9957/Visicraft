import { NextRequest, NextResponse } from 'next/server';
import { PlaygroundGenerationError } from '@/lib/server/playground/errors';
import { savePlaygroundImage } from '@/lib/server/playground/images';
import { generateOpenAiImage } from '@/lib/server/playground/openai';
import { isPlaygroundModel, playgroundModel, runCost, sizeOption, type ImageQuality, type PlaygroundSize, type ReferenceRole } from '@/lib/playground/models';

export const maxDuration = 300;

/**
 * Development-only harness for the Playground's OpenAI models. Nothing is charged.
 * GET: which GPT Image models OPENAI_API_KEY can see (a free model list call).
 * POST { model, size, ratio, quality, prompt, references?: [{ url, role, label }] }: one real
 * image (billed by OpenAI), stored like a Playground image, with its measured token usage and
 * cost next to the credits the catalog would charge for it.
 */
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ configured: false, message: 'Add OPENAI_API_KEY to .env.local and restart the dev server.' });
  const response = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
  const data = (await response.json().catch(() => ({}))) as { data?: Array<{ id: string }>; error?: { message?: string } };
  if (!response.ok) return NextResponse.json({ configured: true, keyValid: false, status: response.status, error: data.error?.message }, { status: 200 });
  const imageModels = (data.data ?? []).map((model) => model.id).filter((id) => /image/i.test(id)).sort();
  return NextResponse.json({
    configured: true,
    keyValid: true,
    imageModels,
    playgroundModels: ['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare'].map((id) => ({ id, available: imageModels.includes(id) })),
  });
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = (await request.json()) as {
    model?: string;
    size?: PlaygroundSize;
    ratio?: string;
    quality?: ImageQuality;
    prompt?: string;
    references?: Array<{ url: string; role?: ReferenceRole; label?: string }>;
  };
  if (!isPlaygroundModel(body.model) || playgroundModel(body.model).provider !== 'openai') {
    return NextResponse.json({ error: 'model must be an OpenAI Playground model' }, { status: 400 });
  }
  const model = playgroundModel(body.model);
  const size = sizeOption(model, body.size ?? '1K');
  if (!size) return NextResponse.json({ error: `size must be one of ${model.sizes.filter((s) => !s.disabled).map((s) => s.id).join(', ')}` }, { status: 400 });
  const references = (body.references ?? []).map((reference, index) => ({
    id: `dev-${index}`,
    url: reference.url,
    role: reference.role ?? 'product',
    label: reference.label ?? '',
  }));
  const started = Date.now();
  try {
    const generated = await generateOpenAiImage({
      model: model.id,
      size: size.id,
      aspectRatio: body.ratio ?? '1:1',
      quality: body.quality ?? 'high',
      brief: '',
      references,
      prompt: body.prompt ?? 'A studio product photo of a ceramic coffee mug on a white table, soft daylight.',
      deadline: Date.now() + 270_000,
    });
    const saved = await savePlaygroundImage(generated.bytes, generated.mimeType);
    const catalog = runCost({ model: model.id, size: size.id, promptCount: 1, ratioCount: 1, variations: 1, referenceCount: references.length, quality: body.quality ?? 'high' });
    return NextResponse.json({
      ms: Date.now() - started,
      imageUrl: saved.imageUrl,
      width: saved.width,
      height: saved.height,
      usage: generated.usage,
      measuredUsd: generated.costUsd,
      catalogUsd: catalog.usd,
      catalogCredits: catalog.creditsPerImage,
    });
  } catch (error) {
    const kind = error instanceof PlaygroundGenerationError ? error.kind : 'failed';
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error), kind, ms: Date.now() - started }, { status: 500 });
  }
}
