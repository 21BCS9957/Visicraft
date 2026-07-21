export interface ShopifyProductContext {
  title?: string;
  vendor?: string;
  description?: string;
}

const PRODUCT_LOCK = `
PRODUCT IDENTITY LOCK - HIGHEST PRIORITY
Reference image 1 is the canonical product and the single source of truth. It is an immutable product asset, not inspiration and not a design brief.

Perform an IMAGE EDIT / OUTPAINT operation around the canonical product. Do not redraw, re-render, reinterpret, typeset, reconstruct, or regenerate the product or its front artwork. Treat every logo, letter, numeral, icon, illustration, certification mark, border, color field, and spacing relationship on the product as one frozen photographic texture copied from reference image 1. Existing package text must remain exactly as photographed, including spelling, capitalization, line breaks, type style, hierarchy, placement, and relative size.

Keep the product in the same front-facing camera orientation and aspect proportions as reference image 1. You may scale and position the whole product uniformly, but may not perspective-warp, rotate, bend, crop, hide, relight destructively, or cover any identity-defining surface. Do not improve, simplify, restyle, relabel, rebrand, recolor, stretch, duplicate, stack, or substitute the product. Add no new text anywhere in the scene.

The complete product must be fully visible, tack-sharp, correctly scaled, and integrated using realistic contact shadows and environmental reflections around its perimeter. Never place fingers over the package or put the product into a pose that requires changing its perspective. The product is the hero; people and scenery are supporting elements.
`.trim();

const PHOTOGRAPHY_STANDARD = `
PHOTOGRAPHY STANDARD
Create a genuine luxury fashion and beauty campaign photograph, not an AI illustration and not a 3D render. Visual language: Vogue India cover story, high-end global beauty campaign, and contemporary Indian luxury editorial. Phase One XF IQ4 medium-format realism, refined 80mm lens compression, disciplined art direction, cinematic but physically plausible lighting, nuanced color separation, real optical depth, precise product highlights, natural grain, and premium retouching that retains texture.

When a person is appropriate, cast a striking Indian-origin adult aged 21-28 with authentic facial structure and skin tone, real pores and fine facial detail, natural asymmetry, believable eyes, anatomically correct hands, confident contemporary styling, and an unforced editorial pose. Avoid plastic skin, waxy faces, uncanny symmetry, beauty-filter smoothness, stiff stock-photo posing, malformed anatomy, or an aged/tired appearance.

The frame must feel art-directed, expensive, modern, and culturally current. Use material-rich sets, intentional negative space, controlled highlights, believable shadows, subtle imperfections, and a strong visual hook. No cheap props, visual clutter, neon overload, generic ecommerce staging, fake bokeh, floating objects, collage layouts, borders, UI, captions, badges, watermarks, or promotional typography.
`.trim();

function clean(value: string | undefined, maxLength: number): string {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function productBrief(context?: ShopifyProductContext): string {
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

function normalizeDirection(direction?: string): string {
  const value = clean(direction, 1800);
  return value || 'No additional user direction. Choose the strongest art direction for the real product.';
}

export function buildShopifyCreativePrompts(
  context: ShopifyProductContext | undefined,
  userDirection?: string,
  identityManifest?: string
): string[] {
  const forensicManifest = clean(identityManifest, 3200);
  const shared = `
You are the creative director and senior product photographer for an international luxury campaign. Create exactly one finished standalone 9:16 photograph by preserving the canonical product asset and building the campaign scene around it.

${productBrief(context)}
User art direction: ${normalizeDirection(userDirection)}
${forensicManifest ? `\nFORENSIC PRODUCT IDENTITY MANIFEST - use this only to verify the preserved pixels; never re-typeset from it:\n${forensicManifest}\n` : ''}

${PRODUCT_LOCK}

${PHOTOGRAPHY_STANDARD}

FINAL PRE-FLIGHT CHECK - perform silently before rendering
Compare the product in the proposed frame against reference image 1 at high magnification. Reject and correct the frame if any visible character, logo, icon, illustration, label geometry, artwork placement, package seam, silhouette, proportion, material, or color differs. If a creative composition would require redrawing the product, simplify the composition instead. Output only the final photograph: one frame, one scene, no explanation.
`.trim();

  return [
    `${shared}\n\nDIRECTION 1 - HIGH-VOGUE HUMAN EDITORIAL\nCreate a commanding magazine campaign frame with a young Indian model and the exact canonical product standing upright on a foreground plinth or table beside the model. The model must not hold or overlap packaged goods; preserving the front artwork matters more than interaction. For wearable products, keep the canonical logo and construction unchanged. Use sculptural wardrobe, poised body language, directional studio light, a restrained set, and rich tonal depth. The frame should feel like a global Vogue beauty or fashion commission, never influencer content.`,
    `${shared}\n\nDIRECTION 2 - LUXURY PRODUCT PORTRAIT\nCreate a model-free hero portrait of the exact real product. Build a museum-grade set from one or two category-relevant premium materials, with sculpted light, elegant reflections, precise contact shadow, generous negative space, and immaculate color fidelity. The result should feel like a luxury fragrance, beauty, fashion-accessory, or design campaign photographed in-camera, not a basic white-background listing and not a 3D render.`,
    `${shared}\n\nDIRECTION 3 - CINEMATIC RITUAL MOMENT\nCreate a believable editorial ritual with a young Indian model using the product category while the exact canonical packaged product remains upright, front-facing, unobstructed, and separate in the foreground. The person may interact with the product's outcome, such as a prepared drink or applied result, but must not grip, bend, rotate, or cover the package itself. Capture a candid micro-expression with cinematic environmental light and tactile detail. Make it emotionally magnetic, sophisticated, and premium rather than posed or commercial-looking.`,
    `${shared}\n\nDIRECTION 4 - AVANT-GARDE STILL LIFE\nCreate a bold high-fashion still life around the exact real product using disciplined composition, an unexpected but category-relevant material contrast, dramatic controlled light, and editorial negative space. The art direction may be surprising; the product may not change. Keep the canonical product singular, fully visible, perfectly scaled, photo-real, and sharply resolved. The result should feel suitable for a Vogue India inside cover or a global luxury launch campaign.`,
  ];
}

export function buildShopifyPackagingRepairPrompt(identityManifest: string): string {
  const forensicManifest = clean(identityManifest, 2400);
  return `You are performing a surgical product-identity repair on a finished luxury campaign photograph.

Image 1 is the canonical real product. Image 2 is the rejected campaign composition. Preserve the environment, model, lighting language, framing, and overall art direction from image 2, but remove its incorrect product rendering and replace it with the exact product from image 1.

Treat the complete product surface from image 1 as one immutable photographic asset. Preserve its silhouette, proportions, material, closure, seams, logo, every prominent word and number, illustration, label layout, colors, and spacing. Do not redraw, re-typeset, improve, reinterpret, or invent packaging. Keep the canonical product front-facing, fully visible, unobstructed, and large enough for its identity to remain readable. Integrate it only with physically plausible scale, contact shadow, reflections, and scene lighting around its perimeter.

${forensicManifest ? `Identity evidence:\n${forensicManifest}\n` : ''}
Do not add promotional text, badges, borders, watermarks, duplicate products, or a new composition. Output only the repaired 9:16 campaign photograph.`;
}
