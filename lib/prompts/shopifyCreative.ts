export interface ShopifyProductContext {
  title?: string;
  vendor?: string;
  description?: string;
  /** Selling price in major units; currency defaults to INR (research runs in India). */
  price?: number;
  currency?: string;
  /** Where the price sits within its own category, judged during research; overrides the fixed bands. */
  tier?: PriceTier;
}

export type PriceTier = 'mass' | 'mid' | 'premium' | 'luxury';

/** Market tier, so research compares against the same kind of buyer. Fixed bands are the fallback. */
export function priceTier(context?: ShopifyProductContext): PriceTier | undefined {
  if (context?.tier) return context.tier;
  const price = context?.price;
  if (!price || price <= 0) return undefined;
  const currency = (context?.currency || 'INR').toUpperCase();
  const bands: Record<string, [number, number, number]> = {
    INR: [1000, 5000, 25000],
    USD: [30, 150, 600],
    EUR: [30, 150, 600],
    GBP: [25, 120, 500],
    AED: [110, 550, 2200],
  };
  const [mid, premium, luxury] = bands[currency] ?? bands.INR;
  return price >= luxury ? 'luxury' : price >= premium ? 'premium' : price >= mid ? 'mid' : 'mass';
}

/** The price as a shopper sees it, e.g. "₹50,000". */
export function formatPrice(context?: ShopifyProductContext): string {
  const price = context?.price;
  if (!price || price <= 0) return '';
  const currency = (context?.currency || 'INR').toUpperCase();
  return currency === 'INR' ? `₹${Math.round(price).toLocaleString('en-IN')}` : `${currency} ${price.toLocaleString('en-US')}`;
}

export function priceLine(context?: ShopifyProductContext): string {
  const amount = formatPrice(context);
  const tier = priceTier(context);
  return amount && tier ? `Price: ${amount} (${tier} tier).` : '';
}

export interface AdAngle {
  name: string;
  /** The single promise the ad makes, in the shopper's words. */
  promise?: string;
  scene: string;
  /** Decided by the planner from what the winning ads do; falls back to the slot default. */
  withText?: boolean;
  /** The planner's full expert image brief for this creative (composition, subject, light, palette, type). */
  brief?: string;
  /** Mirrored winners: the creative director's detailed JSON shot spec (camera, lens, light, wardrobe...). */
  shot?: Record<string, unknown>;
  /** Present only for text-overlay slots. */
  headline?: string;
  subline?: string;
  /** Mirrored winners only: our words for the winner's small kicker line and in-image button, when it has them. */
  kicker?: string;
  cta?: string;
  /** Layout/design notes distilled from a winning ad this angle is modelled on. */
  design?: string;
  /** Advertiser page of the winning ad this angle is modelled on, for the UI. */
  modelledOn?: string;
  /** The winning ad this creative is modelled on; shown to the image model as a layout & style reference. */
  referenceImage?: string;
  /** Output format, matched to the winning ad (Meta feed 1:1 / 4:5, or 9:16). */
  aspectRatio?: '1:1' | '4:5' | '9:16';
  /** The winning ad's exact text treatment (font style, weight, case, size, colour, placement). */
  typography?: string;
}

/**
 * Default copy decision per slot when nothing better is known: clean. Copy comes only
 * from mirroring a winning ad that carries copy (or from the planner with winners).
 */
export const CREATIVE_SLOTS = [
  { withText: false },
  { withText: false },
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

const APPAREL_LOCK = `
PRODUCT IDENTITY LOCK - HIGHEST PRIORITY
Reference image 1 (with any closer views of it) shows the exact garment being advertised. The garment is immutable: its colour, fabric, weave, lace, print, embroidery and border patterns, cut and silhouette, blouse or lining, panels and boning, straps, hems, ruffles, trims, lacing, ribbons, hooks, garters and any label or logo must appear exactly as in the reference. Do not recolour, restyle, simplify, embellish, or swap it for a similar garment. Show it completely and clearly on the model, as the hero of the frame, with its construction visible. The model, pose, styling, setting and camera may change; the garment may not. Add no text on the garment.
SCALE: fine patterns must be copied, never invented, so frame the garment no tighter than the product photos show its detail. If the only photo is full length, keep the garment from at least the waist down to the knees in frame; go closer only where a closer product view shows that part.
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
    priceLine(context),
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
  /** Real product pixels will be pasted in afterwards: keep the pack face square to the camera. */
  frontalProduct?: boolean;
  productKind?: 'packaged' | 'apparel' | 'object';
  /** Garments: the exact pattern spec (compact JSON) written from the store photos. */
  productSpec?: string;
}): string {
  const manifest = clean(options.identityManifest, 3200);
  const specBlock = options.productSpec
    ? `\nGARMENT SPEC - reproduce every listed detail exactly; the product photos win if anything differs:\n${options.productSpec.slice(0, 4000)}\n`
    : '';
  const direction = clean(options.userDirection, 1200);
  const angle = options.withText ? options.angle : { ...options.angle, headline: undefined, subline: undefined, kicker: undefined, cta: undefined };

  const critique = clean(options.critique, 500);
  const lock = options.productKind === 'apparel' ? APPAREL_LOCK : PRODUCT_LOCK;

  // Modelled on a specific winning ad: the creative director's prompt is the shot.
  if (angle.brief && angle.modelledOn) {
    const format = angle.aspectRatio ?? '9:16';
    // Every text element of the winner gets our own words, so the model never fills a gap with theirs.
    const lines = [
      angle.kicker ? `- Kicker (the small line in the reference's kicker position): "${clean(angle.kicker, 60)}"` : '',
      `- Headline: "${clean(angle.headline, 60)}"`,
      angle.subline ? `- Supporting line: "${clean(angle.subline, 70)}"` : '',
      angle.cta ? `- Button label: "${clean(angle.cta, 24)}"` : '',
    ].filter(Boolean).join('\n');
    const textBlock = angle.withText && angle.headline && angle.typography
      ? `TEXT - render exactly these lines, spelled exactly; they are the ONLY words in the image:
${lines}
Typography and placement - match the reference ad's text treatment: ${clean(angle.typography, 500)}
If the reference has a text element not listed above, leave that space empty. Never reproduce any word from the reference ad; no prices, badges, logos, brand names or URLs. Never over the product.`
      : textOverlayBlock(angle);
    return `
Create exactly one finished, standalone ${format} Meta ad image for our product, modelled on a proven winning ad in this niche. Reference image 1 (and any closer views of it) is our product${angle.referenceImage ? '; the last reference image is the winning ad to follow for layout, light and typography' : ''}.

${productBrief(options.context)}
${direction ? `Client direction: ${direction}\n` : ''}${manifest ? `\nFORENSIC PRODUCT IDENTITY MANIFEST - use this only to verify the preserved product; never re-typeset from it:\n${manifest}\n` : ''}${specBlock}
THE SHOT (${angle.shot ? 'JSON spec' : 'brief'} written by our creative director from the winning ad; follow every detail):
${angle.shot ? JSON.stringify(angle.shot).slice(0, 6000) : clean(angle.brief, 1600)}

${textBlock}
${critique ? `\nFIXES FROM CREATIVE REVIEW - a previous render of this ad was rejected; apply every fix:\n${critique}\n` : ''}
${lock}

CRAFT STANDARD
A new, full-bleed ${format} photograph composed for this ad: never reproduce the product photo and pad or stretch it to fit, and no bands, borders, duplicated strips or mirrored edges. A real campaign photograph, not an illustration or 3D render; natural skin, hands and anatomy; physically correct props and light. No watermarks, UI chrome, platform logos, extra or duplicated products, gibberish text, or claims the product context does not support (no invented prices, discounts, ratings or medical claims).${format === '9:16' ? ' Keep the top 14% and bottom 20% of the frame free of key elements.' : ''}

FINAL PRE-FLIGHT CHECK - perform silently before rendering
1. Product: identical to reference image 1${options.productKind === 'apparel' ? ' (colour, pattern, cut, trims, closures)' : ' (shape, colours, logo, every printed word)'}; if the shot would require altering it, simplify the shot instead.
2. Text: ${angle.withText && angle.headline ? 'exactly the specified copy, legible on a phone, never over the product' : 'none anywhere in the image'}.
Output only the final image.
`.trim();
  }

  return `
You are the creative director of a top Indian D2C performance agency, making a Meta ad that has to earn its media spend. Create exactly one finished standalone 9:16 ad image by preserving the canonical product asset and building the scene around it.

${productBrief(options.context)}
${direction ? `User art direction: ${direction}` : ''}
${manifest ? `\nFORENSIC PRODUCT IDENTITY MANIFEST - use this only to verify the preserved pixels; never re-typeset from it:\n${manifest}\n` : ''}${specBlock}
CREATIVE ANGLE - ${clean(angle.name, 60)}
The one promise this ad makes: ${clean(angle.promise, 160) || 'the product\'s core benefit, shown not told'}
${angle.brief ? `CREATIVE BRIEF (written by the strategist after studying the winning ads in this niche; follow it closely):\n${clean(angle.brief, 1200)}\n` : `Scene: ${clean(angle.scene, 600)}\n`}${angle.design ? `Design reference (structure of a long-running ad in this niche; reproduce the layout logic, product placement and visual hierarchy, never any brand, wording or claim from it): ${clean(angle.design, 500)}\n` : ''}
${textOverlayBlock(angle)}
${options.frontalProduct ? `\nCAMERA ON THE PRODUCT: shoot the package at its own height with its front face parallel to the image plane (no top-down or three-quarter views of the pack); it stands on a level surface with a soft contact shadow. Props, people and the environment may be angled freely; only the package stays square-on.\n` : ''}${critique ? `\nFIXES FROM CREATIVE REVIEW - a previous render of this ad was rejected; apply every fix:\n${critique}\n` : ''}
${lock}

${PERFORMANCE_STANDARD}

FINAL PRE-FLIGHT CHECK - perform silently before rendering
1. Product: compare it against reference image 1 at high magnification; if any ${options.productKind === 'apparel' ? 'colour, pattern, cut, trim, closure or hardware' : 'character, logo, illustration, label geometry, silhouette, proportion, material or colour'} differs, simplify the composition rather than alter the product.
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

/** A shot without a person: the safety filter allows it, and it still sells the product. */
export function safeCompositionBrief(productKind: 'packaged' | 'apparel' | 'object', title?: string): string {
  const name = title ? `"${title}"` : 'the product';
  return productKind === 'apparel'
    ? `Luxurious editorial still life with no person in frame. The complete garment ${name} from reference image 1 is displayed front-on on an elegant tailored dress form, or laid out on a satin-draped bed, in a softly lit boudoir-style bedroom: warm bedside lamp glow, rich textiles, a few tasteful accessories arranged nearby. Every fabric, lace and trim detail is crisp and true to the reference, and the garment fills the centre of the frame. Premium, tasteful, high-end brand hero shot; 50mm lens, shallow depth of field, soft warm key light.`
    : `Premium editorial still life with no person in frame. ${name} from reference image 1 stands front-on as the clear hero on a styled surface, surrounded by a few props that suggest how and when it is used, in warm, directional natural light with a soft contact shadow. Product sharp and identical to the reference; high-end brand hero shot; 50mm lens, shallow depth of field.`;
}
