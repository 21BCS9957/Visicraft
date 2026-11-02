import { playgroundModel, sizeOption, sizePrice, type ImageQuality } from '@/lib/playground/models';

/**
 * Image sizes in Chat: a shape from the Size chip or any size typed in the message ("1080x1350",
 * "a 9:16 story", "square"), planned into what GPT Image renders (multiples of 16, 1:3 to 3:1,
 * 0.66–8.3 MP, at most the 2K price tier here) and the exact pixels the saved image gets.
 */

export type ChatRatio = '1:1' | '4:5' | '9:16' | '16:9' | '3:4' | '4:3' | '2:3' | '3:2' | '3:1';
export type SizeChoice = { kind: 'auto' } | { kind: 'ratio'; ratio: ChatRatio } | { kind: 'custom'; width: number; height: number };

/** The exact pixels each shape is saved at (Instagram and YouTube sizes). */
export const RATIO_PIXELS: Record<ChatRatio, [number, number]> = {
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
  '9:16': [1080, 1920],
  '16:9': [1920, 1080],
  '3:4': [1080, 1440],
  '4:3': [1440, 1080],
  '2:3': [1080, 1620],
  '3:2': [1620, 1080],
  '3:1': [1920, 640],
};

export const SIZE_PRESETS: Array<{ id: 'auto' | ChatRatio; label: string; hint: string }> = [
  { id: 'auto', label: 'Auto', hint: 'The model picks' },
  { id: '1:1', label: 'Square', hint: '1080 × 1080' },
  { id: '4:5', label: 'Portrait', hint: '1080 × 1350 · feed' },
  { id: '9:16', label: 'Story', hint: '1080 × 1920 · Reels' },
  { id: '16:9', label: 'Landscape', hint: '1920 × 1080' },
  { id: '3:1', label: 'Banner', hint: '1920 × 640 · website' },
];

const MIN_PIXELS = 655_360;
/** The 2K price tier's largest image here (about 2048 × 2048); bigger asks are upscaled. */
const MAX_PIXELS = 4_194_304;
/** Up to this many pixels an image is priced as 1K. */
const ONE_K_PIXELS = 1_700_000;
const MAX_EDGE = 3840;
const MAX_EXACT_EDGE = 8000;

const WORDS: Array<[RegExp, ChatRatio]> = [
  [/\bsquare\b/i, '1:1'],
  [/\b(website|web|hero|homepage|home page|shopify|slider)\s+banners?\b/i, '3:1'],
  [/\b(stor(y|ies)|reels?|tiktok|shorts|vertical|full[- ]?screen)\b/i, '9:16'],
  [/\b(portrait|feed post|instagram post|insta post)\b/i, '4:5'],
  [/\b(landscape|widescreen|horizontal|youtube thumbnail|thumbnail|banner)\b/i, '16:9'],
];

/** A size sent by the browser or saved on a chat, checked; null when it isn't one. */
export function readSizeChoice(raw: unknown): SizeChoice | null {
  const value = (raw ?? {}) as { kind?: unknown; ratio?: unknown; width?: unknown; height?: unknown };
  if (value.kind === 'auto') return { kind: 'auto' };
  if (value.kind === 'ratio' && typeof value.ratio === 'string' && value.ratio in RATIO_PIXELS) return { kind: 'ratio', ratio: value.ratio as ChatRatio };
  const width = Number(value.width);
  const height = Number(value.height);
  if (value.kind === 'custom' && width >= 64 && height >= 64 && width <= 8000 && height <= 8000) return { kind: 'custom', width: Math.round(width), height: Math.round(height) };
  return null;
}

const NUMBER_WORDS: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', sixteen: '16' };
const NUM = String.raw`(\d{1,2}(?:\.\d{1,2})?)`;
/** "3:1", "2.8:1", "3 ratio 1", "3 is to 1"; "3 by 1", "3x1", "3 to 1" and "3/1" only when the message says ratio or aspect. */
const RATIO = new RegExp(String.raw`(?<![\d.])${NUM}\s*(:|∶|ratio|is\s+to|by|x|×|to|/)\s*${NUM}(?![\d])`, 'gi');
/** Just before a ratio: words that describe the image as it is now ("it is 16:9, I want 3:1"). */
const NOW_BEFORE = /\b(is|was|are|it'?s|came out|you made|made|created|generated|gave|got|instead of|rather than|from|currently)\s+(?:(?:of|in|a|an|the|size|ratio)\s+)*$/;
/** ...and words that ask for one ("make it 3:1", "banner of size 3:1"). */
const WANT_BEFORE = /\b(want|need|make|should be|convert|change|resize|turn|give me|create|into|to|in|as|size|ratio|aspect)\s+(?:(?:it|this|that|a|an|the|image|banner|in|to|of|size|ratio)\s+)*$/;
/** Shapes beyond these are made at 3:1 (1:3) and cropped. */
const WIDEST = 6;

/** A clock time, not a shape: "at 10:30", "7:45 pm", "10:05". */
function looksLikeTime(a: string, b: string, before: string, after: string): boolean {
  if (/^\s*(am|pm|a\.m|p\.m|hrs|hours|o'?clock)\b/.test(after)) return true;
  if (/\b(at|till|until|clock|time|showing|shows|watch|hands)\s*$/.test(before)) return true;
  return (b.length === 2 && b.startsWith('0')) || (!b.includes('.') && Number(a) <= 12 && Number(b) >= 20);
}

/** The ratio a message asks for, as [width, height] parts; when it names several, the one it asks for. */
export function ratioFromText(text: string): [number, number] | null {
  const source = text.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|sixteen)\b/gi, (word) => NUMBER_WORDS[word.toLowerCase()]);
  const saysRatio = /\b(ratio|aspect)\b/i.test(source);
  let best: { parts: [number, number]; score: number } | null = null;
  for (const match of source.matchAll(RATIO)) {
    const [all, a, separator, b] = match;
    const index = match.index ?? 0;
    const loose = /^(by|x|×|to|\/)$/i.test(separator);
    if (loose && !saysRatio) continue;
    const width = Number(a);
    const height = Number(b);
    if (!(width > 0 && height > 0) || width / height > WIDEST || height / width > WIDEST) continue;
    const before = source.slice(Math.max(0, index - 32), index).toLowerCase();
    const after = source.slice(index + all.length, index + all.length + 10).toLowerCase();
    if ((separator === ':' || separator === '∶') && looksLikeTime(a, b, before, after)) continue;
    const score = NOW_BEFORE.test(before) ? -2 : WANT_BEFORE.test(before) ? 1 : 0;
    if (!best || score > best.score) best = { parts: [width, height], score };
  }
  return best?.parts ?? null;
}

/** The pixels a ratio is saved at: 1080 on the short side, at most 1920 on the long side. */
function ratioPixels(width: number, height: number): [number, number] {
  const ratio = width / height;
  const wide = Math.max(ratio, 1 / ratio);
  let long = 1080 * wide;
  let short = 1080;
  if (long > 1920) {
    long = 1920;
    short = 1920 / wide;
  }
  const even = (value: number) => Math.round(value / 2) * 2;
  return ratio >= 1 ? [even(long), even(short)] : [even(short), even(long)];
}

/** The size a message asks for, if it names one: pixels first, then a ratio, then a word. */
export function sizeFromText(text: string): SizeChoice | null {
  const pixels = /(\d{3,4})\s*(?:px)?\s*[x×*]\s*(\d{3,4})\s*(?:px)?/i.exec(text);
  if (pixels) {
    const width = Number(pixels[1]);
    const height = Number(pixels[2]);
    if (width >= 64 && height >= 64 && width <= MAX_EXACT_EDGE && height <= MAX_EXACT_EDGE) return { kind: 'custom', width, height };
  }
  const ratio = ratioFromText(text);
  if (ratio) {
    const [width, height] = ratio;
    const named = (Object.keys(RATIO_PIXELS) as ChatRatio[]).find((key) => {
      const [w, h] = key.split(':').map(Number);
      return Math.abs(w / h - width / height) < 0.001;
    });
    if (named) return { kind: 'ratio', ratio: named };
    const [w, h] = ratioPixels(width, height);
    return { kind: 'custom', width: w, height: h };
  }
  for (const [pattern, word] of WORDS) if (pattern.test(text)) return { kind: 'ratio', ratio: word };
  return null;
}

export interface SizePlan {
  /** What GPT Image is asked for: "auto" or "WxH". */
  generation: string;
  /** The exact pixels saved, or null to keep what the model made. */
  width: number | null;
  height: number | null;
  tier: '1K' | '2K';
  /** "1080 × 1350", "Auto". */
  label: string;
  /** Bigger than GPT Image renders here: the render is enlarged to it. */
  upscaled: boolean;
  /** The shape was outside 1:3–3:1 and was brought inside it. */
  clamped: boolean;
}

const multiple16 = (value: number) => Math.max(16, Math.round(value / 16) * 16);

export function planSize(choice: SizeChoice): SizePlan {
  if (choice.kind === 'auto') return { generation: 'auto', width: null, height: null, tier: '1K', label: 'Auto', upscaled: false, clamped: false };
  const [w, h] = choice.kind === 'ratio' ? RATIO_PIXELS[choice.ratio] : [Math.round(choice.width), Math.round(choice.height)];
  let ratio = w / h;
  const clamped = ratio > 3 || ratio < 1 / 3;
  ratio = Math.min(3, Math.max(1 / 3, ratio));
  // The render: the asked area within the tier's bounds, at the asked shape.
  const pixels = Math.min(MAX_PIXELS, Math.max(MIN_PIXELS, w * h));
  let gw = multiple16(Math.sqrt(pixels * ratio));
  let gh = multiple16(gw / ratio);
  if (Math.max(gw, gh) > MAX_EDGE) {
    const scale = MAX_EDGE / Math.max(gw, gh);
    gw = multiple16(gw * scale);
    gh = multiple16(gh * scale);
  }
  while (gw * gh < MIN_PIXELS) {
    gw += 16;
    gh = multiple16(gw / ratio);
  }
  while (gw * gh > MAX_PIXELS) {
    gw -= 16;
    gh = multiple16(gw / ratio);
  }
  return {
    generation: `${gw}x${gh}`,
    width: w,
    height: h,
    tier: gw * gh <= ONE_K_PIXELS ? '1K' : '2K',
    label: `${w} × ${h}`,
    upscaled: w * h > gw * gh * 1.02,
    clamped,
  };
}

/** Credits attached images add, as in the Playground. */
export const CHAT_CREDITS_PER_ATTACHMENT = 5;

/** What one image costs in credits, and the provider's price, at a plan's tier and a quality. */
export function chatImagePrice(plan: SizePlan, quality: ImageQuality, attachments: number): { credits: number; usd: number } {
  const model = playgroundModel('gpt-image-2.5-flare');
  const option = sizeOption(model, plan.tier) ?? sizeOption(model, '1K')!;
  const price = sizePrice(option, quality);
  return { credits: price.credits + attachments * CHAT_CREDITS_PER_ATTACHMENT, usd: price.usd + attachments * 0.012 };
}

export function sameChoice(a: SizeChoice, b: SizeChoice): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function choiceLabel(choice: SizeChoice): string {
  if (choice.kind === 'auto') return 'Auto';
  if (choice.kind === 'custom') return `${choice.width} × ${choice.height}`;
  return SIZE_PRESETS.find((preset) => preset.id === choice.ratio)?.label ?? choice.ratio;
}
