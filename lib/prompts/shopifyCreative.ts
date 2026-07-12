export interface ShopifyProductContext {
  title?: string;
  vendor?: string;
  description?: string;
}

const PRODUCT_LOCK = `
PRODUCT IDENTITY LOCK - HIGHEST PRIORITY
Reference image 1 is the canonical product and the single source of truth. References 2 onward are supporting views of that same product and may only clarify details hidden in reference 1. If references conflict, reference 1 wins.

Treat the product as an immutable photographed asset, not an object to redesign. Reproduce the same real product from the references. Preserve its exact category, silhouette, construction, dimensions, height-to-width ratio, volume, scale, color, material, finish, closures, cap or lid, seams, hardware, pattern, print, logo position, label shape, label proportions, artwork placement, and every distinctive feature. For apparel, preserve the exact cut, neckline, sleeve, hem, drape, fabric, stitching, print scale, and color blocking. For packaging, preserve the exact bottle, jar, tube, pouch, carton, cap, dispenser, label, and pack proportions. For jewelry or accessories, preserve the exact geometry, stone setting, links, hardware, and relative scale.

Do not reinterpret, improve, simplify, restyle, relabel, rebrand, recolor, resize, stretch, slim, widen, duplicate, stack, crop, hide, or invent any part of the product. Do not substitute a generic product from the same category. Do not invent label copy. Existing packaging artwork must remain visually faithful to the reference; add no new text anywhere in the scene.

The product must be fully visible, physically believable, correctly scaled, in sharp focus, and share the same perspective, light direction, contact shadows, reflections, and depth of field as the scene. Hands may support the product naturally but must not cover identity-defining details. The product is the hero; people and scenery are supporting elements.
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
  userDirection?: string
): string[] {
  const shared = `
You are the creative director and senior product photographer for an international luxury campaign. First inspect every attached reference and form one consistent product identity. Then create exactly one finished standalone 9:16 photograph for this direction.

${productBrief(context)}
User art direction: ${normalizeDirection(userDirection)}

${PRODUCT_LOCK}

${PHOTOGRAPHY_STANDARD}

FINAL PRE-FLIGHT CHECK - perform silently before rendering
Compare the product in the proposed frame against reference image 1. Reject and correct the frame if the product category, shape, proportions, color, construction, artwork placement, label geometry, logo position, material, scale, or count differs. Reject any generic substitute or invented packaging. Output only the final photograph: one frame, one scene, no explanation.
`.trim();

  return [
    `${shared}\n\nDIRECTION 1 - HIGH-VOGUE HUMAN EDITORIAL\nCreate a commanding magazine campaign frame with a young Indian model and the exact real product. Adapt the interaction to the product category: wear wearable products correctly, hold handheld products naturally, or stage larger products beside the model. Use sculptural wardrobe, poised body language, directional studio light, a restrained set, and rich tonal depth. Keep the entire product unobstructed and tack-sharp; the frame should feel like a global Vogue beauty or fashion commission, never influencer content.`,
    `${shared}\n\nDIRECTION 2 - LUXURY PRODUCT PORTRAIT\nCreate a model-free hero portrait of the exact real product. Build a museum-grade set from one or two category-relevant premium materials, with sculpted light, elegant reflections, precise contact shadow, generous negative space, and immaculate color fidelity. The result should feel like a luxury fragrance, beauty, fashion-accessory, or design campaign photographed in-camera, not a basic white-background listing and not a 3D render.`,
    `${shared}\n\nDIRECTION 3 - CINEMATIC IN-USE MOMENT\nCreate a believable editorial moment showing the exact real product in use by a young Indian model only when appropriate for its category. Capture a candid micro-expression or purposeful gesture with cinematic environmental light and tactile detail. Preserve an unobstructed hero view of the product; the interaction, anatomy, scale, reflections, and shadows must be physically convincing. Make it emotionally magnetic, sophisticated, and premium rather than posed or commercial-looking.`,
    `${shared}\n\nDIRECTION 4 - AVANT-GARDE STILL LIFE\nCreate a bold high-fashion still life around the exact real product using disciplined composition, an unexpected but category-relevant material contrast, dramatic controlled light, and editorial negative space. The art direction may be surprising; the product may not change. Keep the canonical product singular, fully visible, perfectly scaled, photo-real, and sharply resolved. The result should feel suitable for a Vogue India inside cover or a global luxury launch campaign.`,
  ];
}
