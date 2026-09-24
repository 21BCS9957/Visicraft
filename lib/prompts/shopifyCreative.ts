export interface ShopifyProductContext {
  title?: string;
  vendor?: string;
  description?: string;
}

export interface AdAngle {
  name: string;
  scene: string;
  /** Present only for text-overlay slots. */
  headline?: string;
  subline?: string;
}

/** Slots 1-2 carry Meta-style text overlays, slots 3-4 are clean. */
export const CREATIVE_SLOTS = [
  { withText: true },
  { withText: true },
  { withText: false },
  { withText: false },
] as const;

const PRODUCT_LOCK = `
PRODUCT IDENTITY LOCK - HIGHEST PRIORITY
Reference image 1 is the canonical product and the single source of truth. It is an immutable product asset, not inspiration and not a design brief.

Perform an IMAGE EDIT / OUTPAINT operation around the canonical product. Do not redraw, re-render, reinterpret, typeset, reconstruct, or regenerate the product or its front artwork. Treat every logo, letter, numeral, icon, illustration, certification mark, border, color field, and spacing relationship on the product as one frozen photographic texture copied from reference image 1. Existing package text must remain exactly as photographed, including spelling, capitalization, line breaks, type style, hierarchy, placement, and relative size.

Keep the product in the same front-facing camera orientation and aspect proportions as reference image 1. You may scale and position the whole product uniformly, but may not perspective-warp, rotate, bend, crop, hide, relight destructively, or cover any identity-defining surface. Do not improve, simplify, restyle, relabel, rebrand, recolor, stretch, duplicate, stack, or substitute the product. Never add or alter text on the product itself.

The complete product must be fully visible, tack-sharp, correctly scaled, and integrated using realistic contact shadows and environmental reflections around its perimeter. Never place fingers over the package or put the product into a pose that requires changing its perspective. The product is the hero; people and scenery are supporting elements.
`.trim();

const PERFORMANCE_STANDARD = `
PERFORMANCE AD STANDARD
This is a paid Meta ad (Instagram/Facebook feed, Stories and Reels) for Indian shoppers. Its job is to stop the scroll in under one second and make the product instantly understood. Photoreal, in-camera look, never an AI illustration or 3D render. Bright, clean, high-contrast lighting with the product as the unmistakable focal point; the product should occupy roughly 35-55% of the frame. Use real, relatable Indian settings and people when a person fits the angle: adults 21-35, authentic skin texture, natural anatomy, believable expressions, anatomically correct hands. Keep the top 14% and bottom 20% of the 9:16 frame free of key product detail so Meta's UI never covers it.

Avoid: clutter, cheap props, fake bokeh, floating objects, collage borders, UI chrome, watermarks, platform logos, price tags, invented discounts, star ratings, or claims not supported by the product context.
`.trim();

function clean(value: string | undefined, maxLength: number): string {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function productBrief(context?: ShopifyProductContext): string {
  if (!context) return 'Product metadata is unavailable; derive identity only from the attached references.';
  const title = clean(context.title, 180);
  const vendor = clean(context.vendor, 120);
  const description = clean(context.description, 700);
  return [
    title ? `Product name: ${title}.` : '',
    vendor ? `Brand: ${vendor}.` : '',
    description ? `Product context (context only, never permission to alter the references): ${description}.` : '',
  ].filter(Boolean).join(' ');
}

export const DEFAULT_AD_ANGLES: AdAngle[] = [
  {
    name: 'Core benefit',
    scene: 'Bold product hero on a clean, colour-blocked set that echoes the packaging palette, with one category-relevant prop that signals the main benefit.',
    headline: 'Made for everyday you',
    subline: 'See why people switch',
  },
  {
    name: 'Problem to solution',
    scene: 'Relatable Indian person in a real home setting at the moment the problem is solved, product standing upright and unobstructed in the foreground.',
    headline: 'Finally, one that works',
    subline: 'Your daily routine, upgraded',
  },
  {
    name: 'Lifestyle moment',
    scene: 'Candid, warm lifestyle scene with a young Indian adult enjoying the result of the product, the exact product placed upright and front-facing beside them.',
  },
  {
    name: 'Premium still life',
    scene: 'Scroll-stopping still life with dramatic, controlled light and one striking category-relevant material contrast; the product is the single hero.',
  },
];

function textOverlayBlock(angle: AdAngle): string {
  const headline = clean(angle.headline, 60);
  const subline = clean(angle.subline, 70);
  if (!headline) return 'TEXT: none. Add no text anywhere in the scene.';
  return `
TEXT OVERLAY - render exactly this ad copy, spelled exactly, nothing else:
- Headline: "${headline}"
${subline ? `- Supporting line: "${subline}"\n` : ''}Set it in bold, modern, highly legible sans-serif type with strong contrast against the background, as a native Meta ad would. Place it in clear negative space in the upper-middle or lower-middle area, never overlapping the product and never inside the top 14% or bottom 20% of the frame. No other words, prices, badges, logos or buttons.`.trim();
}

export function buildMetaAdCreativePrompt(options: {
  context?: ShopifyProductContext;
  userDirection?: string;
  identityManifest?: string;
  angle: AdAngle;
  withText: boolean;
}): string {
  const manifest = clean(options.identityManifest, 3200);
  const direction = clean(options.userDirection, 1200);
  const angle = options.withText ? options.angle : { ...options.angle, headline: undefined, subline: undefined };

  return `
You are the creative director of a top Indian D2C performance agency. Create exactly one finished standalone 9:16 Meta ad image by preserving the canonical product asset and building the scene around it.

${productBrief(options.context)}
${direction ? `User art direction: ${direction}` : ''}
${manifest ? `\nFORENSIC PRODUCT IDENTITY MANIFEST - use this only to verify the preserved pixels; never re-typeset from it:\n${manifest}\n` : ''}
CREATIVE ANGLE - ${clean(angle.name, 60)}
Scene: ${clean(angle.scene, 600)}

${textOverlayBlock(angle)}

${PRODUCT_LOCK}

${PERFORMANCE_STANDARD}

FINAL PRE-FLIGHT CHECK - perform silently before rendering
Compare the product in the proposed frame against reference image 1 at high magnification. Reject and correct the frame if any visible character, logo, icon, illustration, label geometry, artwork placement, package seam, silhouette, proportion, material, or color on the product differs. If the composition would require redrawing the product, simplify the composition instead. Output only the final image.
`.trim();
}

export function buildMetaVideoPrompt(options: {
  context?: ShopifyProductContext;
  userDirection?: string;
  adPatterns?: string;
}): string {
  const direction = clean(options.userDirection, 800);
  const patterns = clean(options.adPatterns, 1500);
  return `
Vertical 9:16 Meta Reels ad for ${clean(options.context?.title, 140) || 'this product'}${options.context?.vendor ? ` by ${clean(options.context.vendor, 80)}` : ''}.
Open with a scroll-stopping first second: immediate motion toward the product, bright clean light, product fully visible and unchanged from the reference frame. One smooth, purposeful camera move (slow push-in or orbit), product stays sharp and front-facing, packaging text and logo never warp or change. Realistic Indian setting, photoreal, no on-screen text.
${patterns ? `Borrow the pacing and hook structure of the longest-running ads in this niche (never their branding):\n${patterns}` : ''}
${direction ? `User direction: ${direction}` : ''}
`.trim();
}
