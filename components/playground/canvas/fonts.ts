import {
  Bebas_Neue,
  DM_Serif_Display,
  Great_Vibes,
  Inter,
  Lora,
  Montserrat,
  Noto_Sans_Devanagari,
  Oswald,
  Playfair_Display,
  Poppins,
} from 'next/font/google';

/**
 * The Canvas's ad fonts. Layers store the font's key (not the generated family name, which
 * changes between builds), so saved designs reopen with the right font.
 */

const inter = Inter({ subsets: ['latin'], display: 'swap' });
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '600', '700', '800'], display: 'swap' });
const montserrat = Montserrat({ subsets: ['latin'], display: 'swap' });
const playfair = Playfair_Display({ subsets: ['latin'], display: 'swap' });
const dmSerif = DM_Serif_Display({ subsets: ['latin'], weight: '400', display: 'swap' });
const bebas = Bebas_Neue({ subsets: ['latin'], weight: '400', display: 'swap' });
const oswald = Oswald({ subsets: ['latin'], display: 'swap' });
const lora = Lora({ subsets: ['latin'], display: 'swap' });
const greatVibes = Great_Vibes({ subsets: ['latin'], weight: '400', display: 'swap' });
const devanagari = Noto_Sans_Devanagari({ subsets: ['devanagari', 'latin'], weight: ['400', '600', '700'], display: 'swap' });

export interface CanvasFont {
  key: string;
  label: string;
  family: string;
  className: string;
  /** Weights the font really has; the bold button picks the heaviest. */
  weights: number[];
}

export const CANVAS_FONTS: CanvasFont[] = [
  { key: 'inter', label: 'Inter', family: inter.style.fontFamily, className: inter.className, weights: [400, 500, 600, 700, 800] },
  { key: 'poppins', label: 'Poppins', family: poppins.style.fontFamily, className: poppins.className, weights: [400, 600, 700, 800] },
  { key: 'montserrat', label: 'Montserrat', family: montserrat.style.fontFamily, className: montserrat.className, weights: [400, 500, 600, 700, 800] },
  { key: 'bebas', label: 'Bebas Neue', family: bebas.style.fontFamily, className: bebas.className, weights: [400] },
  { key: 'oswald', label: 'Oswald', family: oswald.style.fontFamily, className: oswald.className, weights: [400, 500, 600, 700] },
  { key: 'playfair', label: 'Playfair Display', family: playfair.style.fontFamily, className: playfair.className, weights: [400, 600, 700, 800] },
  { key: 'dmserif', label: 'DM Serif Display', family: dmSerif.style.fontFamily, className: dmSerif.className, weights: [400] },
  { key: 'lora', label: 'Lora', family: lora.style.fontFamily, className: lora.className, weights: [400, 600, 700] },
  { key: 'greatvibes', label: 'Great Vibes', family: greatVibes.style.fontFamily, className: greatVibes.className, weights: [400] },
  { key: 'devanagari', label: 'Noto Sans (हिंदी)', family: devanagari.style.fontFamily, className: devanagari.className, weights: [400, 600, 700] },
];

export function canvasFont(key: string | undefined | null): CanvasFont {
  return CANVAS_FONTS.find((font) => font.key === key) ?? CANVAS_FONTS[0];
}

/** Waits until the browser has the font, so Fabric measures and draws it correctly. */
export async function loadCanvasFont(font: CanvasFont, weight = 400): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const family = font.family.split(',')[0].trim();
  await Promise.all([
    document.fonts.load(`${weight} 48px ${family}`),
    document.fonts.load(`${weight} 48px ${family}`, 'हिंदी'),
  ]).catch(() => undefined);
}
