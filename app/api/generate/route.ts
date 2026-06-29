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
    'The product package must keep the exact same physical format as the Shopify reference: same box/jar/bottle dimensions, silhouette, height-to-width ratio, cap size, label scale, front-facing layout, and relative product size. Do not resize, stretch, slim, widen, stack, duplicate, or redesign the package unless the direction explicitly asks for multiple real units.',
    'No added text of any kind: no headlines, captions, slogans, price tags, promo badges, UI labels, watermarks, fake label copy, or readable scene typography. Only unavoidable real packaging marks from the reference may remain, and they must be faithful rather than invented.',
    'Make the result premium, aesthetic, photorealistic, cinematic, editorial, and commercially usable for vertical Instagram stories/reels/ads and Shopify product/collection imagery, with clean crop room and no clutter.',
    'When a human model or hand appears, use Indian-origin young adult people, around 20-25 years old, with authentic Indian skin tones, real facial structure, natural body language, believable hands, modern premium styling, and documentary-level realism. Do not make the model look aged, elderly, tired, waxy, or artificial.',
    'Use real camera language: Vogue India editorial meets premium Nykaa campaign, medium-format commercial photography, natural lens compression, realistic depth of field, true-to-life skin texture, grounded shadows, believable contact points, imperfect human nuance, crisp product focus, and cinematic commercial lighting.',
    'Product is the hero and model is supporting character. The client will reject the image if the package changes by even 1%. Build lighting, background, and pose around a locked, rigid, photo-accurate product anchor.',
    'Avoid distorted labels, wrong branding, extra products, messy hands, malformed anatomy, plastic skin, waxy faces, uncanny eyes, aged-looking models, fake AI model posing, warped containers, changed package size, floating/composited product, duplicated packaging, and low-end stock-photo styling.',
  ].join(' ');

  return [
    `${shared} Direction 1: premium Indian lifestyle campaign image with a tasteful young adult Indian-origin model naturally holding or using the exact product package. Elegant wardrobe, refined skin tones, soft cinematic daylight, aspirational but believable setting, product clearly readable and heroed.`,
    `${shared} Direction 2: clean Shopify-ready studio product hero with only the exact same product package as the focal point. Sculptural lighting, soft contact shadow, premium background material, perfect ecommerce clarity, no model, no props that compete with the product.`,
    `${shared} Direction 3: sensory editorial still life focused on benefit cues and material feeling. Macro-inspired composition, elevated props or natural textures only when relevant to the product category, refined depth of field, no model.`,
    `${shared} Direction 4: Instagram-ready vertical social creative with product-first composition and tasteful young adult Indian-origin model or hand interaction when useful. Modern campaign framing, strong negative space, premium palette, no text overlay, no ad copy.`,
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
