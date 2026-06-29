import { NextRequest, NextResponse } from 'next/server';
import {
  normalizeReferenceImages,
  runImageGeneration,
  type ImageGenMode,
} from '@/lib/server/imageGeneration';

const MODES: ImageGenMode[] = ['generate', 'thumbnail', 'edit', 'upscale', 'unblur'];

function parseMode(raw: unknown): ImageGenMode {
  if (typeof raw === 'string' && MODES.includes(raw as ImageGenMode)) {
    return raw as ImageGenMode;
  }
  return 'generate';
}

function readProductContext(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const value = raw as Record<string, unknown>;
  const pieces = [
    typeof value.title === 'string' && value.title ? `Product: ${value.title}` : '',
    typeof value.vendor === 'string' && value.vendor ? `Brand/vendor: ${value.vendor}` : '',
    typeof value.description === 'string' && value.description ? `Product description: ${value.description.slice(0, 600)}` : '',
  ].filter(Boolean);

  return pieces.length ? `Product metadata for interpretation: ${pieces.join('. ')}.` : '';
}

function buildProductCreativeSetPrompts(basePrompt: string | undefined, productContext?: string): string[] {
  const base = (basePrompt ?? '').trim() || 'Create a premium ecommerce campaign image using the attached product reference images.';
  const shared = [
    base,
    productContext ?? '',
    'Before generating, visually analyze every attached Shopify reference image: product shape, packaging material, label layout, logo placement, text branding, color palette, finish, scale, proportions, and category cues.',
    'Generate exactly one standalone image, not a collage, contact sheet, grid, before-after view, or multi-panel layout.',
    'Use the references only to preserve the real product identity. Keep packaging geometry, label placement, logo area, colors, proportions, and recognizable details faithful to the source.',
    'No added text of any kind: no headlines, captions, slogans, price tags, promo badges, UI labels, watermarks, fake label copy, or readable scene typography. Only unavoidable real packaging marks from the reference may remain, and they must be faithful rather than invented.',
    'Make the result premium, aesthetic, realistic, editorial, and commercially usable for both Instagram feed/ads and Shopify product/collection imagery, with clean crop room and no clutter.',
    'Avoid distorted labels, wrong branding, extra products, messy hands, malformed anatomy, plastic skin, warped containers, duplicated packaging, and low-end stock-photo styling.',
  ].join(' ');

  return [
    `${shared} Direction 1: premium lifestyle campaign image with a tasteful human model naturally holding or using the product. Elegant wardrobe, refined skin tones, soft cinematic daylight, aspirational but believable setting, product clearly readable and heroed.`,
    `${shared} Direction 2: clean Shopify-ready studio product hero with only the product as the focal point. Sculptural lighting, soft contact shadow, premium background material, perfect ecommerce clarity, no model, no props that compete with the product.`,
    `${shared} Direction 3: sensory editorial still life focused on benefit cues and material feeling. Macro-inspired composition, elevated props or natural textures only when relevant to the product category, refined depth of field, no model.`,
    `${shared} Direction 4: Instagram-ready social creative with product-first composition and tasteful model/hand interaction or environment context. Modern campaign framing, strong negative space, premium palette, no text overlay, no ad copy.`,
  ];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const mode = parseMode(body.mode);

    const referenceImages = normalizeReferenceImages(body);
    if (referenceImages.length === 0) {
      return NextResponse.json(
        { error: 'At least one image (referenceImages or legacy referenceImage/sourceImages/imageUrl) is required' },
        { status: 400 }
      );
    }

    const prompt = typeof body.prompt === 'string' ? body.prompt : undefined;
    const model = typeof body.model === 'string' ? body.model : undefined;
    const aspectRatio = typeof body.aspectRatio === 'string' ? body.aspectRatio : undefined;
    const resolution = typeof body.resolution === 'string' ? body.resolution : undefined;
    const creativeSet = body.creativeSet === true && mode === 'generate';
    const productContext = readProductContext(body.productContext);

    if (creativeSet) {
      const prompts = buildProductCreativeSetPrompts(prompt, productContext);
      const generatedSets = await Promise.all(
        prompts.map((variantPrompt) => runImageGeneration({
          mode,
          referenceImages,
          prompt: variantPrompt,
          model,
          aspectRatio,
          resolution,
          persistToGenerationsTable: false,
        }))
      );
      const images = generatedSets.flatMap((generated) => generated.slice(0, 1));

      return NextResponse.json({
        success: true,
        images,
      });
    }

    const images = await runImageGeneration({
      mode,
      referenceImages,
      prompt,
      model,
      aspectRatio,
      resolution,
      persistToGenerationsTable: mode === 'generate',
    });

    return NextResponse.json({
      success: true,
      images,
    });
  } catch (error) {
    console.error('Generation error:', error);
    const message = error instanceof Error ? error.message : 'Generation failed';
    const status = message.includes('required') || message.includes('prompt') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
