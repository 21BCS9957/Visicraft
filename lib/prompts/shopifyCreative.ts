export interface ShopifyProductContext {
  title?: string;
  vendor?: string;
  description?: string;
}

export interface AdAngle {
  name: string;
  /** The single promise the ad makes, in the shopper's words. */
  promise?: string;
  scene: string;
  /** Present only for text-overlay slots. */
  headline?: string;
  subline?: string;
  /** Layout/design notes distilled from a winning ad this angle is modelled on. */
  design?: string;
  /** Advertiser page of the winning ad this angle is modelled on, for the UI. */
  modelledOn?: string;
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
PERFORMANCE AD STANDARD - this image exists to make money on Meta
It is a paid ad for Indian shoppers scrolling Instagram and Facebook on a phone. It has one job: stop the thumb in under a second and make the promise obvious at a glance, so the viewer taps. Everything in the frame serves that.

Composition: one clear focal point, the product large and sharp (roughly 35-55% of the frame height), placed on a rule-of-thirds line, standing on a real surface with a true contact shadow and reflections that match the scene light. Strong figure-ground contrast between product and background. Keep the top ~14% and bottom ~20% of the 9:16 frame free of the product and any headline so Meta's UI never covers them; leave a calm area of negative space where copy sits or could sit.

Photography: a real campaign photograph, not an illustration or 3D render. Name-the-camera realism: 50mm or 85mm lens, shallow but believable depth of field, one motivated key light with soft fill and a subtle rim, honest colour, fine grain. Settings and people are recognisably Indian and current (real homes, kitchens, desks, gyms, streets), styled like a premium D2C brand shoot, never like stock. People, if any, are adults 21-35 with natural skin texture, correct hands and proportions, candid expressions, and they never hide the product's front.

Persuasion: the scene itself should dramatise the benefit or the moment of use so the promise reads even with the sound off and the text removed. Only proof that is true may appear (nothing invented: no prices, discounts, ratings, awards, review counts or medical claims).

Never: clutter, cheap props, fake bokeh, floating objects, collage borders, UI chrome, platform logos, watermarks, badges, stars, extra products, mirrored or duplicated packs, gibberish text, deformed hands or faces.
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
${subline ? `- Supporting line: "${subline}"\n` : ''}Typography like a top D2C brand's paid ad: a bold, modern sans-serif headline (large enough to read on a phone at feed size, roughly 6-9% of frame height per line, maximum two lines), the supporting line smaller and lighter beneath it, tight consistent spacing, left- or centre-aligned as the composition demands. Guarantee legibility with real contrast (light type on a darker area or a subtle, natural darkening behind the type), never a slapped-on box. Place the copy in clear negative space in the upper-middle or lower-middle of the frame, never overlapping the product and never inside the top 14% or bottom 20%. No other words, prices, badges, logos or buttons.`.trim();
}

export function buildMetaAdCreativePrompt(options: {
  context?: ShopifyProductContext;
  userDirection?: string;
  identityManifest?: string;
  angle: AdAngle;
  withText: boolean;
  /** Fixes from a rejected render, applied on the regeneration. */
  critique?: string;
}): string {
  const manifest = clean(options.identityManifest, 3200);
  const direction = clean(options.userDirection, 1200);
  const angle = options.withText ? options.angle : { ...options.angle, headline: undefined, subline: undefined };

  const critique = clean(options.critique, 500);

  return `
You are the creative director of a top Indian D2C performance agency, making a Meta ad that has to earn its media spend. Create exactly one finished standalone 9:16 ad image by preserving the canonical product asset and building the scene around it.

${productBrief(options.context)}
${direction ? `User art direction: ${direction}` : ''}
${manifest ? `\nFORENSIC PRODUCT IDENTITY MANIFEST - use this only to verify the preserved pixels; never re-typeset from it:\n${manifest}\n` : ''}
CREATIVE ANGLE - ${clean(angle.name, 60)}
The one promise this ad makes: ${clean(angle.promise, 160) || 'the product\'s core benefit, shown not told'}
Scene: ${clean(angle.scene, 600)}
${angle.design ? `Design reference (structure of a long-running ad in this niche; reproduce the layout logic, product placement and visual hierarchy, never any brand, wording or claim from it): ${clean(angle.design, 500)}\n` : ''}
${textOverlayBlock(angle)}
${critique ? `\nFIXES FROM CREATIVE REVIEW - a previous render of this ad was rejected; apply every fix:\n${critique}\n` : ''}
${PRODUCT_LOCK}

${PERFORMANCE_STANDARD}

FINAL PRE-FLIGHT CHECK - perform silently before rendering
1. Product: compare it against reference image 1 at high magnification; if any character, logo, illustration, label geometry, silhouette, proportion, material or colour differs, simplify the composition rather than redraw the product.
2. Performance: at phone size, is the focal point instant, is the promise obvious, is the copy (if any) exactly as specified and legible, is nothing important in the top 14% or bottom 20%?
3. Craft: hands, faces, props and surfaces are physically correct; no artifacts.
Output only the final image.
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
