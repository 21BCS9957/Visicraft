/**
 * Motion presets of the Create tab: one camera or motion style each, written as a line the
 * prompt ends with (visible before Generate). Made for product ads; "General" adds nothing.
 * Each has a 5-second sample in public/presets/<id>.mp4 (+ .jpg poster).
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
  /** What the move is, in plain words, for people who don't know camera terms. */
  explain: string;
  bestFor: string;
  /** A 5-second sample of the move (public/presets), made with Seedance 2.5; none for General. */
  clip?: string;
}

export const MOTION_PRESETS: MotionPreset[] = [
  { id: 'general', name: 'General', blurb: 'No preset: your prompt decides the camera.', line: '', tint: ['#2a2a30', '#141417'], explain: 'Nothing is added: the camera does whatever your prompt says.', bestFor: 'When you describe the shot yourself' },
  { id: 'push-in', name: 'Slow push-in', blurb: 'The camera glides slowly towards the product.', line: 'Camera: one slow, smooth push-in towards the product, steady and cinematic, no cuts.', seconds: 5, tint: ['#3d2c12', '#15110a'], explain: 'The camera moves slowly closer to the product. It draws the eye in and makes the product feel premium.', bestFor: 'Hero shots of one product', clip: '/presets/push-in' },
  { id: 'orbit', name: 'Orbit 360', blurb: 'A full turn around the product on a clean set.', line: 'Camera: a smooth 360-degree orbit around the product at product height, constant speed, the product stays centred and sharp.', seconds: 8, tint: ['#10293b', '#0b1219'], explain: 'The camera circles all the way around the product, so every side is seen.', bestFor: 'Bottles, shoes, gadgets: anything with a shape worth showing', clip: '/presets/orbit' },
  { id: 'hand-reveal', name: 'Hand reveal', blurb: 'A hand brings the product into frame and shows it.', line: 'Action: a well-groomed hand brings the product into frame and turns it slowly towards the camera; handheld but steady close-up.', seconds: 5, tint: ['#3b1d2a', '#170c11'], explain: 'A hand brings the product into the shot and turns it to the camera, as if showing it to a friend.', bestFor: 'Beauty, food and small products', clip: '/presets/hand-reveal' },
  { id: 'model-walk', name: 'Model walk', blurb: 'A model walks towards the camera wearing it.', line: 'Action: an Indian model walks confidently towards the camera wearing the product; camera tracks backwards at walking pace, full body to waist-up.', seconds: 8, tint: ['#2b2340', '#110e1a'], explain: 'A model walks towards the camera wearing the product while the camera moves back with them.', bestFor: 'Clothing, sarees, jewellery', clip: '/presets/model-walk' },
  { id: 'fabric-flow', name: 'Fabric flow', blurb: 'Macro close-ups of texture, drape and detail.', line: 'Shots: macro close-ups of the fabric texture and details, the fabric moving softly in a gentle breeze; slow lateral slide.', seconds: 8, tint: ['#3d1414', '#170909'], explain: 'Very close shots of the fabric moving softly, so its texture, shine and border show.', bestFor: 'Sarees, silk, any fabric', clip: '/presets/fabric-flow' },
  { id: 'unboxing', name: 'Unboxing', blurb: 'Hands open the box and lift the product out.', line: 'Action: top-down view of hands opening the box and lifting the product out, then a close-up of it in hand; soft daylight.', seconds: 8, tint: ['#2e3311', '#121409'], explain: 'Seen from above, hands open the box and take the product out.', bestFor: 'D2C launches and gift boxes', clip: '/presets/unboxing' },
  { id: 'ugc-selfie', name: 'UGC selfie', blurb: 'A creator talks to a phone camera, holding the product.', line: 'Style: vertical selfie-style UGC; an Indian creator holds the product and talks to the phone camera, natural handheld movement, home setting.', seconds: 10, tint: ['#113330', '#081514'], explain: "Looks like a customer's phone video: a person holds the product up and talks about it.", bestFor: 'Ads that should feel real, not polished', clip: '/presets/ugc-selfie' },
  { id: 'floating', name: 'Floating product', blurb: 'The product floats and turns in mid-air.', line: 'Action: the product floats in mid-air and rotates slowly, soft shadows below, minimal studio background; camera holds still.', seconds: 5, tint: ['#1b2a40', '#0b111a'], explain: 'The product floats in the air and turns slowly on a clean background.', bestFor: 'Catchy, premium product shots', clip: '/presets/floating' },
  { id: 'dolly-zoom', name: 'Dolly zoom', blurb: 'The background stretches while the product stays.', line: 'Camera: a dolly-zoom (vertigo) effect, the product stays the same size while the background stretches behind it.', seconds: 5, tint: ['#40301b', '#1a130b'], explain: "The product stays the same size while the background stretches behind it: the 'vertigo' effect.", bestFor: 'A dramatic, scroll-stopping opening', clip: '/presets/dolly-zoom' },
];

export function motionPreset(id: string | null | undefined): MotionPreset {
  return MOTION_PRESETS.find((preset) => preset.id === id) ?? MOTION_PRESETS[0];
}
