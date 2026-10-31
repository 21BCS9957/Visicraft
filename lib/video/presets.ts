/**
 * Motion presets of the Create tab: one camera or motion style each, written as a line the
 * prompt ends with (visible before Generate). Made for product ads; "General" adds nothing.
 */

export interface MotionPreset {
  id: string;
  name: string;
  /** What it looks like, for the gallery. */
  blurb: string;
  /** Appended to the prompt; empty for General. */
  line: string;
  /** A length it suits, used when the preset is picked. */
  seconds?: number;
  /** Two colours for the tile. */
  tint: [string, string];
}

export const MOTION_PRESETS: MotionPreset[] = [
  { id: 'general', name: 'General', blurb: 'No preset: your prompt decides the camera.', line: '', tint: ['#2a2a30', '#141417'] },
  { id: 'push-in', name: 'Slow push-in', blurb: 'The camera glides slowly towards the product.', line: 'Camera: one slow, smooth push-in towards the product, steady and cinematic, no cuts.', seconds: 5, tint: ['#3d2c12', '#15110a'] },
  { id: 'orbit', name: 'Orbit 360', blurb: 'A full turn around the product on a clean set.', line: 'Camera: a smooth 360-degree orbit around the product at product height, constant speed, the product stays centred and sharp.', seconds: 8, tint: ['#10293b', '#0b1219'] },
  { id: 'hand-reveal', name: 'Hand reveal', blurb: 'A hand brings the product into frame and shows it.', line: 'Action: a well-groomed hand brings the product into frame and turns it slowly towards the camera; handheld but steady close-up.', seconds: 5, tint: ['#3b1d2a', '#170c11'] },
  { id: 'model-walk', name: 'Model walk', blurb: 'A model walks towards the camera wearing it.', line: 'Action: an Indian model walks confidently towards the camera wearing the product; camera tracks backwards at walking pace, full body to waist-up.', seconds: 8, tint: ['#2b2340', '#110e1a'] },
  { id: 'fabric-flow', name: 'Fabric flow', blurb: 'Macro close-ups of texture, drape and detail.', line: 'Shots: macro close-ups of the fabric texture and details, the fabric moving softly in a gentle breeze; slow lateral slide.', seconds: 8, tint: ['#3d1414', '#170909'] },
  { id: 'unboxing', name: 'Unboxing', blurb: 'Hands open the box and lift the product out.', line: 'Action: top-down view of hands opening the box and lifting the product out, then a close-up of it in hand; soft daylight.', seconds: 8, tint: ['#2e3311', '#121409'] },
  { id: 'ugc-selfie', name: 'UGC selfie', blurb: 'A creator talks to a phone camera, holding the product.', line: 'Style: vertical selfie-style UGC; an Indian creator holds the product and talks to the phone camera, natural handheld movement, home setting.', seconds: 10, tint: ['#113330', '#081514'] },
  { id: 'floating', name: 'Floating product', blurb: 'The product floats and turns in mid-air.', line: 'Action: the product floats in mid-air and rotates slowly, soft shadows below, minimal studio background; camera holds still.', seconds: 5, tint: ['#1b2a40', '#0b111a'] },
  { id: 'dolly-zoom', name: 'Dolly zoom', blurb: 'The background stretches while the product stays.', line: 'Camera: a dolly-zoom (vertigo) effect, the product stays the same size while the background stretches behind it.', seconds: 5, tint: ['#40301b', '#1a130b'] },
];

export function motionPreset(id: string | null | undefined): MotionPreset {
  return MOTION_PRESETS.find((preset) => preset.id === id) ?? MOTION_PRESETS[0];
}
