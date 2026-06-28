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

function buildProductCreativeSetPrompts(basePrompt: string | undefined): string[] {
  const base = (basePrompt ?? '').trim() || 'Create a premium ecommerce campaign image using the attached product reference images.';
  const shared = [
    base,
    'Generate exactly one standalone image, not a collage, contact sheet, grid, or multi-panel layout.',
    'Use the attached Shopify product images only as product identity references. Preserve packaging, label, proportions, brand colors, and recognizable product details.',
    'Make the result aesthetic, premium, realistic, editorial, and commercially usable. Avoid fake text, distorted labels, extra products, watermarks, and messy hands.',
  ].join(' ');

  return [
    `${shared} Direction 1: premium lifestyle image with a tasteful human model naturally holding or using the product. Elegant wardrobe, refined lighting, aspirational but believable setting, high-end DTC campaign feel.`,
    `${shared} Direction 2: clean studio product hero image with only the product as the focal point. Sculptural lighting, soft shadow, premium background material, crisp packaging detail, no model.`,
    `${shared} Direction 3: sensory texture/detail image focused on product benefits and material cues. Macro-inspired composition, elevated props, natural ingredients or textures when appropriate, premium editorial still life, no model.`,
    `${shared} Direction 4: scroll-stopping social ad creative with a tasteful model or hand interaction plus product-first composition. Modern campaign framing, strong negative space, premium color palette, no text overlays unless already present on the product packaging.`,
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

    if (creativeSet) {
      const prompts = buildProductCreativeSetPrompts(prompt);
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
