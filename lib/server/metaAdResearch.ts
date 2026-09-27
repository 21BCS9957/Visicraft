import axios from 'axios';
import { loadPreparedReferences, requestGeminiText, uploadGeminiFile } from '@/lib/banana/api';
import type { ProviderUsage } from '@/lib/server/usage';
import { formatPrice, priceLine, priceTier, type PriceTier, type ShopifyProductContext } from '@/lib/prompts/shopifyCreative';
import { videoStyleLabel, type ClassifiedVideoStyle, type VideoStyle } from '@/lib/videoStyles';

export type AdMediaType = 'image' | 'video';

export interface WinningAd {
  id: string;
  pageName: string;
  startDate: string;
  daysRunning: number;
  body?: string;
  title?: string;
  ctaText?: string;
  /** Landing-page domain shown under the ad, a strong hint of what is being sold. */
  landingDomain?: string;
  imageUrl?: string;
  videoUrl?: string;
  /** Video ads can still serve as design references (via their cover frame) when image ads are scarce. */
  mediaKind: 'image' | 'video';
  /** How many ad variants share this creative: advertisers duplicate what makes money. */
  collationCount: number;
  /** Ranking score: run length weighted by collation. */
  winScore: number;
  libraryUrl: string;
  /** Video ads: creative style, first read from the cover frame and copy, then from the video itself. */
  style?: ClassifiedVideoStyle;
  /** True once the style was confirmed by watching the actual video. */
  styleConfirmed?: boolean;
}

/** One beat of a video ad's timeline. */
export interface AdSequenceShot {
  /** Time range, e.g. "0-2s". */
  t: string;
  shot: string;
  camera?: string;
  text?: string;
  purpose?: string;
}

/** How one winning ad is built, so a new creative can be modelled on it. */
export interface AdDesign {
  id: string;
  pageName: string;
  daysRunning: number;
  format: string;
  layout: string;
  hook: string;
  textPlacement: string;
  colorMood: string;
  proofOrOffer: string;
  whyItWorks: string;
  /** Video ads only: the timed shot sequence. */
  sequence?: AdSequenceShot[];
  /** Video ads only: voice-over / music / sound style. */
  audio?: string;
  /** Video ads only: creative style, and whether it was judged from the video itself. */
  style?: ClassifiedVideoStyle;
  watched?: boolean;
}

export interface AdResearchResult {
  niche: string;
  keywords: string[];
  country: string;
  mediaType: AdMediaType;
  ads: WinningAd[];
  patterns: string;
  designs: AdDesign[];
  /** The price tier winners were screened against. */
  tier?: PriceTier;
  /** The video style the user asked for. */
  videoStyle?: VideoStyle;
  /** No long-running ads of that style were found, so the best video ads of any style were used. */
  styleFallback?: boolean;
  /** That style did not exist at the product's price tier, so ads of the style from other price points were used. */
  styleTierRelaxed?: boolean;
  /** True when sample ads were used instead of a live Ad Library scrape (AD_RESEARCH_MOCK). */
  mock: boolean;
  usage: ProviderUsage;
}

const DEFAULT_ACTOR = 'apify~facebook-ads-scraper';
const ADS_PER_KEYWORD = 40;
// Longest-running first: only ads already live this many days ago (and still active) qualify.
const MIN_AGE_CASCADE_DAYS: Array<number | null> = [180, 60, null];
const ADS_PER_COMPETITOR = 25;
const MIN_USABLE_ADS = 3;
const TOP_ADS = 6;
const CANDIDATE_POOL = 80; // ads screened by the relevance gate before ranking by age
const MAX_VIDEO_BYTES = 12 * 1024 * 1024;
// Gemini's inline request limit is ~20 MB in total; keep headroom for the images and text.
const MAX_INLINE_VIDEO_TOTAL_BYTES = 15 * 1024 * 1024;
const MAX_VIDEOS_TO_WATCH = 3;
// With a chosen style, more candidates are watched so the style is confirmed on the video itself.
const MAX_VIDEOS_TO_WATCH_STYLED = 5;
// Relevant video ads whose cover frame and copy are style-labelled before the visual check.
const STYLE_POOL = 24;
const CLASSIFIED_STYLES: ClassifiedVideoStyle[] = ['ugc', 'talking_head', 'demo', 'cinematic', 'other'];
const STYLE_DEFINITIONS = `- ugc: a creator or customer filming themselves, or handheld phone footage; casual real settings; reviewing, unboxing, trying on or reacting.
- talking_head: one person speaking straight to the camera in a steady, composed shot (founder, expert, doctor, stylist, presenter).
- demo: the product being used or demonstrated up close (applying, pouring, draping, assembling), with or without narration.
- cinematic: a polished brand film or lifestyle montage with models and music; nobody addresses the camera.
- other: slideshow of stills, animation, motion graphics, text cards or catalogue.
Tie-breaks: handheld try-on, haul or get-ready footage filmed on a phone is ugc even with music and no speech; cinematic needs professional camera work, lighting and grading. A person speaking to camera in a composed, steady shot is talking_head; the same on a handheld phone selfie is ugc.`;
// Search phrases per style, so the Ad Library query itself finds more ads of that style.
const STYLE_SEARCH_HINT: Partial<Record<VideoStyle, string>> = {
  ugc: 'phrases review-style and creator ads put in their copy, e.g. "honest review", "haul", "try on", "unboxing", combined with the category',
  talking_head: 'phrases founder- or expert-led ads put in their copy, e.g. "dermatologist recommended", "founder story", "why I started", combined with the category',
  demo: 'phrases demo and how-to ads put in their copy, e.g. "how to use", "how to drape", "watch how", combined with the category',
};
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type RawAd = Record<string, unknown>;

const researchCache = new Map<string, { createdAt: number; result: AdResearchResult }>();
const scrapeCache = new Map<string, { createdAt: number; items: RawAd[] }>();

function clean(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';
}

function geminiText(response: Awaited<ReturnType<typeof requestGeminiText>>['response']): string {
  return response.data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((text): text is string => typeof text === 'string')
    .join('')
    .trim() ?? '';
}

function geminiUsage(
  response: Awaited<ReturnType<typeof requestGeminiText>>['response'],
  providerModel: string
): ProviderUsage {
  const meta = response.data.usageMetadata;
  const inputTokens = Number(meta?.promptTokenCount) || 0;
  const outputTokens = Number(meta?.candidatesTokenCount) || 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: Number(meta?.totalTokenCount) || inputTokens + outputTokens,
    providerModel,
  };
}

function addUsage(a: ProviderUsage, b?: ProviderUsage): ProviderUsage {
  if (!b) return a;
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    providerModel: a.providerModel ?? b.providerModel,
  };
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const withoutFences = raw.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(withoutFences.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface NicheInfo {
  niche: string;
  keywords: string[];
  competitors: string[];
  /** Where the price sits within this category in India (₹6,000 is mid for a saree, luxury for a serum). */
  tier?: PriceTier;
  /** Extra search phrases for the chosen video style ("saree haul", "how to drape"). */
  styleKeywords?: string[];
  usage: ProviderUsage;
}

/** What the product is, the niche it sells in, and who else sells it in this market. */
export async function describeProductNiche(product: ShopifyProductContext, imageUrls: string[] = [], videoStyle?: VideoStyle): Promise<NicheInfo> {
  return deriveNicheKeywords(product, imageUrls, videoStyle);
}

async function deriveNicheKeywords(
  product: ShopifyProductContext,
  imageUrls: string[] = [],
  videoStyle?: VideoStyle
): Promise<NicheInfo> {
  const styleHint = videoStyle ? STYLE_SEARCH_HINT[videoStyle] : undefined;
  // The photos settle what the product actually is when the listing text is vague.
  const price = formatPrice(product);
  const parts: Parameters<typeof requestGeminiText>[0] = [{
    text: `You pick Meta Ad Library search keywords for competitor research in India. Study the product photos (if attached) together with the listing to understand exactly what kind of product this is, who buys it and why.

Product name: ${clean(product.title, 180) || 'unknown'}
Brand: ${clean(product.vendor, 120) || 'unknown'}
${price ? `Price: ${price}` : 'Price: unknown'}
Description: ${clean(product.description, 700) || 'unknown'}

Return JSON only: {"niche":"2-4 word product category","keywords":["kw1","kw2"],"competitors":["Brand A","Brand B","Brand C","Brand D"]${price ? ',"tier":"mass|mid|premium|luxury"' : ''}${styleHint ? ',"styleKeywords":["phrase 1","phrase 2"]' : ''}}
Rules: exactly 2 keywords, each 1-3 words, the terms a shopper at this price point searches and competitors at this price point use in ad copy (e.g. "protein powder", "hair oil"; for premium goods "designer saree", "luxury handbag"). competitors: 3-4 brands that sell this same product type in India at the same price tier as ours and advertise on Meta, by the name their Facebook page would use (for premium or luxury products: designer labels and premium D2C brands, never mass-market or marketplace sellers). Never include this brand's own name.${price ? ' tier: where this price sits among products of this same category in India (e.g. ₹6,000 is mid for a saree but luxury for a face serum; ₹50,000 is luxury for a saree).' : ''}${styleHint ? ` styleKeywords: exactly 2 search phrases of 2-4 words that ${videoStyleLabel(videoStyle)} video ads for this product type in India would contain: ${styleHint}.` : ''}`,
  }];
  if (imageUrls.length > 0) {
    const { images } = await loadPreparedReferences(imageUrls.slice(0, 3)).catch(() => ({ images: [] as Array<{ mimeType: string; data: string }> }));
    images.forEach((image, index) => {
      parts.push({ text: `PRODUCT PHOTO ${index + 1}:` }, { inlineData: { mimeType: image.mimeType, data: image.data } });
    });
  }
  const { response, providerModel } = await requestGeminiText(parts, { temperature: 0.2 }, 'Ad research keyword planning');
  const parsed = parseJsonObject(geminiText(response));
  const keywords = Array.isArray(parsed?.keywords)
    ? parsed.keywords.map((k) => clean(k, 40)).filter(Boolean).slice(0, 2)
    : [];
  const fallback = clean(product.title, 60).split(' ').slice(-2).join(' ');
  const ownBrand = clean(product.vendor, 60).toLowerCase();
  const competitors = Array.isArray(parsed?.competitors)
    ? parsed.competitors.map((c) => clean(c, 40)).filter((c) => c && c.toLowerCase() !== ownBrand).slice(0, 4)
    : [];
  const tiers: PriceTier[] = ['mass', 'mid', 'premium', 'luxury'];
  const judgedTier = tiers.find((t) => t === parsed?.tier);
  const styleKeywords = styleHint && Array.isArray(parsed?.styleKeywords)
    ? parsed.styleKeywords.map((k) => clean(k, 50)).filter(Boolean).slice(0, 2)
    : [];
  return {
    niche: clean(parsed?.niche, 60) || fallback || 'product',
    keywords: keywords.length > 0 ? keywords : [fallback || 'product'],
    competitors,
    tier: price ? judgedTier ?? priceTier(product) : undefined,
    styleKeywords,
    usage: geminiUsage(response, providerModel),
  };
}

function adLibrarySearchUrl(keyword: string, country: string, mediaType: AdMediaType | 'all'): string {
  const params = new URLSearchParams({
    active_status: 'active',
    ad_type: 'all',
    country,
    q: keyword,
    search_type: 'keyword_unordered',
    media_type: mediaType,
  });
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

/**
 * Test mode: AD_RESEARCH_MOCK=true skips Apify and feeds sample ads shaped like the
 * scraper output, so ranking, Gemini analysis and generation still run end to end.
 */
function sampleAdLibraryItems(niche: string, mediaType: AdMediaType): RawAd[] {
  const now = Math.floor(Date.now() / 1000);
  const samples = [
    { page: 'Sample Brand A', days: 412, title: `India's favourite ${niche}`, body: `Loved by 1 lakh+ customers. Try the ${niche} everyone is switching to. Free shipping across India.`, cta: 'Shop now' },
    { page: 'Sample Brand B', days: 287, title: 'Before vs after in 14 days', body: `Tired of ${niche} that does nothing? See real results in two weeks or your money back.`, cta: 'Learn more' },
    { page: 'Sample Brand C', days: 190, title: 'Made in India, made for you', body: `Clean, honest ${niche} with no nasties. Rated 4.6 by verified buyers.`, cta: 'Shop now' },
    { page: 'Sample Brand D', days: 121, title: 'Buy 2 get 1 free', body: `Stock up on your daily ${niche}. Limited time combo offer.`, cta: 'Get offer' },
    { page: 'Sample Brand E', days: 64, title: 'Why doctors recommend it', body: `The science-backed ${niche} built for Indian weather and routines.`, cta: 'Shop now' },
    { page: 'Sample Brand D', days: 20, title: 'New launch', body: 'Newer ad from the same advertiser, should be ranked out.', cta: 'Shop now' },
  ];
  return samples.map((sample, index) => ({
    ad_archive_id: `sample-${mediaType}-${index + 1}`,
    page_name: sample.page,
    is_active: true,
    start_date: now - sample.days * 86_400,
    snapshot: {
      title: sample.title,
      body: { text: sample.body },
      cta_text: sample.cta,
      images: mediaType === 'image' ? [{ original_image_url: '' }] : [],
      videos: mediaType === 'video' ? [{ video_sd_url: 'sample', video_preview_image_url: '' }] : [],
    },
  }));
}

const SC_BASE = 'https://api.scrapecreators.com/v1/facebook/adLibrary';
const SC_PAGES_PER_KEYWORD = 3; // ~25-30 ads per page, 1 credit each
const SC_PAGES_PER_COMPANY = 2;

export type ResearchProvider = 'selfhosted' | 'scrapecreators' | 'apify';

/** Self-hosted scraper first when configured; ScrapeCreators next; Apify last. */
export function getResearchProvider(): ResearchProvider | null {
  const forced = process.env.RESEARCH_PROVIDER;
  if (forced === 'selfhosted' && process.env.AD_SCRAPER_URL) return 'selfhosted';
  if (forced === 'scrapecreators' && process.env.SCRAPECREATORS_API_KEY) return 'scrapecreators';
  if (forced === 'apify' && process.env.APIFY_API_TOKEN) return 'apify';
  if (process.env.AD_SCRAPER_URL) return 'selfhosted';
  if (process.env.SCRAPECREATORS_API_KEY) return 'scrapecreators';
  if (process.env.APIFY_API_TOKEN) return 'apify';
  return null;
}

// ---------- self-hosted sidecar (scraper/app.py) ----------
/** When Meta throttles our IP, skip the sidecar for a while and use the API directly. */
const SELFHOSTED_COOLDOWN_MS = 15 * 60 * 1000;
let selfhostedCooldownUntil = 0;

function selfhostedAvailable(): boolean {
  return Date.now() >= selfhostedCooldownUntil;
}

async function shGet<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const base = (process.env.AD_SCRAPER_URL || '').replace(/\/$/, '');
  if (!base) throw new Error('AD_SCRAPER_URL is not configured.');
  const query = Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
  const headers: Record<string, string> = {};
  if (process.env.SCRAPER_TOKEN) headers['x-scraper-token'] = process.env.SCRAPER_TOKEN;
  const response = await axios.get<T>(`${base}/${path}?${query}`, { headers, timeout: 170000 }).catch((error: unknown) => {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const message = axios.isAxiosError(error)
      ? (error.response?.data as { detail?: string } | undefined)?.detail || error.message
      : String(error);
    if (status === 429 || !status) {
      selfhostedCooldownUntil = Date.now() + SELFHOSTED_COOLDOWN_MS;
      console.warn(`Self-hosted scraper unavailable (${status ?? 'no response'}: ${message}); using the API for the next ${SELFHOSTED_COOLDOWN_MS / 60000} minutes`);
    }
    throw new Error(`Self-hosted scraper ${path} failed: ${message}`);
  });
  return response.data;
}

async function shSearchAds(keyword: string, country: string, mediaType: AdMediaType | 'all', max: number): Promise<RawAd[]> {
  const cacheKey = `sh|search|${country}|${mediaType}|${keyword.toLowerCase()}`;
  const cached = scrapeCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.items;
  const data = await shGet<{ items?: RawAd[] }>('search', { query: keyword, country, media_type: mediaType, max });
  const items = data.items ?? [];
  scrapeCache.set(cacheKey, { createdAt: Date.now(), items });
  return items;
}

async function shCompanyAds(brand: string, country: string, max: number): Promise<RawAd[]> {
  const cacheKey = `sh|company|${country}|${brand.toLowerCase()}`;
  const cached = scrapeCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.items;
  const found = await shGet<{ items?: Array<{ page_id: string; name: string }> }>('companies', { query: brand, country });
  const pages = found.items ?? [];
  if (pages.length === 0) return [];
  const brandLower = brand.toLowerCase();
  const countryWords: Record<string, string[]> = { IN: ['india', 'in'], US: ['usa', 'us', 'united states'], GB: ['uk', 'united kingdom'] };
  const wanted = countryWords[country] ?? [country.toLowerCase()];
  const best = [...pages].sort((a, b) => {
    const score = (name: string) => {
      const n = name.toLowerCase();
      let v = n.startsWith(brandLower) ? 2 : n.includes(brandLower) ? 1 : 0;
      if (wanted.some((w) => n.split(/\s+/).includes(w))) v += 3;
      if (/\b(uk|usa|us|uae|singapore|canada|australia|europe)\b/.test(n) && !wanted.some((w) => n.includes(w))) v -= 2;
      return v;
    };
    return score(b.name) - score(a.name);
  })[0];
  const data = await shGet<{ items?: RawAd[] }>('page', { page_id: best.page_id, country, media_type: 'all', max });
  const items = data.items ?? [];
  console.log(`Ad research: ${items.length} active ads on page "${best.name}" (${best.page_id}) for competitor ${brand} [self-hosted]`);
  scrapeCache.set(cacheKey, { createdAt: Date.now(), items });
  return items;
}

async function scGet<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  if (!apiKey) throw new Error('Winning-ad research is not configured (missing SCRAPECREATORS_API_KEY).');
  const query = Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`).join('&');
  const attempt = () => axios.get<T & { success?: boolean; error?: string; message?: string }>(`${SC_BASE}/${path}?${query}`, {
    headers: { 'x-api-key': apiKey },
    timeout: 60000,
  });
  // The upstream scrape occasionally stalls; one retry recovers it without re-paying (cached server side).
  const response = await attempt().catch(() => attempt()).catch((error: unknown) => {
    const message = axios.isAxiosError(error)
      ? (error.response?.data as { message?: string; error?: string } | undefined)?.message || (error.response?.data as { error?: string } | undefined)?.error || error.message
      : String(error);
    throw new Error(`ScrapeCreators ${path} failed: ${message}`);
  });
  if (response.data.success === false) throw new Error(`ScrapeCreators ${path} failed: ${response.data.message || response.data.error || 'unknown error'}`);
  return response.data;
}

/** Keyword search on the Ad Library via ScrapeCreators, following the cursor for a few pages. */
async function scSearchAds(
  keyword: string,
  country: string,
  mediaType: AdMediaType | 'all',
  pages: number,
  /** Only ads that already had impressions on/before this date (still active now = long-runner). */
  impressionsBefore?: string
): Promise<RawAd[]> {
  const cacheKey = `sc|search|${country}|${mediaType}|${impressionsBefore ?? ''}|${keyword.toLowerCase()}`;
  const cached = scrapeCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.items;
  const items: RawAd[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < pages; page++) {
    const data = await scGet<{ searchResults?: RawAd[]; cursor?: string | null }>('search/ads', {
      query: keyword,
      country,
      media_type: mediaType.toUpperCase(),
      status: 'ACTIVE',
      sort_by: 'total_impressions',
      end_date: impressionsBefore,
      cursor,
    });
    items.push(...(data.searchResults ?? []));
    cursor = data.cursor || undefined;
    if (!cursor) break;
  }
  scrapeCache.set(cacheKey, { createdAt: Date.now(), items });
  return items;
}

/** A brand's own active ads: resolve its page (prefer the country's page), then page ads. */
async function scCompanyAds(brand: string, country: string, pages: number): Promise<RawAd[]> {
  const cacheKey = `sc|company|${country}|${brand.toLowerCase()}`;
  const cached = scrapeCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.items;
  const found = await scGet<{ searchResults?: Array<{ name?: string; page_id?: string; id?: string }> }>('search/companies', { query: brand });
  const candidates = (found.searchResults ?? []).filter((c) => c.page_id || c.id);
  if (candidates.length === 0) return [];
  const countryWords: Record<string, string[]> = { IN: ['india', 'in'], US: ['usa', 'us', 'united states'], GB: ['uk', 'united kingdom'] };
  const wanted = countryWords[country] ?? [country.toLowerCase()];
  const brandLower = brand.toLowerCase();
  const scored = candidates.map((c) => {
    const name = (c.name ?? '').toLowerCase();
    let score = name.startsWith(brandLower) ? 2 : name.includes(brandLower) ? 1 : 0;
    if (wanted.some((w) => name.split(/\s+/).includes(w))) score += 3;
    // A page for another country loses to a bare brand page.
    if (/\b(uk|usa|us|uae|singapore|canada|australia|europe)\b/.test(name) && !wanted.some((w) => name.includes(w))) score -= 2;
    return { c, score };
  }).sort((a, b) => b.score - a.score);
  const pageId = String(scored[0].c.page_id || scored[0].c.id);
  const items: RawAd[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < pages; page++) {
    const data = await scGet<{ results?: RawAd[]; cursor?: string | null }>('company/ads', { pageId, status: 'ACTIVE', sort_by: 'total_impressions', cursor });
    items.push(...(data.results ?? []));
    cursor = data.cursor || undefined;
    if (!cursor) break;
  }
  console.log(`Ad research: ${items.length} active ads on page "${scored[0].c.name}" (${pageId}) for competitor ${brand}`);
  scrapeCache.set(cacheKey, { createdAt: Date.now(), items });
  return items;
}

async function scrapeAdLibrary(
  keywords: string[],
  country: string,
  mediaType: AdMediaType | 'all',
  minAgeDays: number | null,
  limitPerKeyword = ADS_PER_KEYWORD
): Promise<RawAd[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error('Winning-ad research is not configured (missing APIFY_API_TOKEN).');
  const actor = process.env.APIFY_META_ADS_ACTOR || DEFAULT_ACTOR;
  const cacheKey = `${actor}|${country}|${mediaType}|${minAgeDays ?? 0}|${keywords.join(',').toLowerCase()}`;
  const cached = scrapeCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.items;

  // apify/facebook-ads-scraper input; the Ad Library search URL carries country, keyword and media type.
  const response = await axios.post<unknown>(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=150`,
    {
      startUrls: keywords.map((keyword) => ({ url: adLibrarySearchUrl(keyword, country, mediaType) })),
      resultsLimit: limitPerKeyword * keywords.length,
      activeStatus: 'active',
      sorting: '',
      ...(minAgeDays
        ? { onlyAdsOlderThan: new Date(Date.now() - minAgeDays * 86_400_000).toISOString().slice(0, 10) }
        : {}),
      isDetailsPerAd: false,
      enrichWithEcommerceData: false,
    },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 170000,
    }
  );

  const items = Array.isArray(response.data) ? response.data.filter((item): item is RawAd => !!item && typeof item === 'object') : [];
  scrapeCache.set(cacheKey, { createdAt: Date.now(), items });
  return items;
}

function pick(record: RawAd | undefined, ...keys: string[]): unknown {
  if (!record) return undefined;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function toStartDate(raw: RawAd): Date | null {
  const value = pick(raw, 'startDateFormatted', 'start_date_formatted', 'start_date', 'startDate', 'ad_delivery_start_time');
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value);
  if (typeof value === 'string' && value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric < 1e12 ? numeric * 1000 : numeric);
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function firstMedia(snapshot: RawAd | undefined): { imageUrl?: string; videoUrl?: string } {
  // Field names differ between Ad Library scrapers (snake_case vs camelCase); accept both.
  const images = pick(snapshot, 'images') as RawAd[] | undefined;
  const videos = pick(snapshot, 'videos') as RawAd[] | undefined;
  const cards = pick(snapshot, 'cards') as RawAd[] | undefined;
  const videoKeys = ['video_sd_url', 'videoSdUrl', 'video_hd_url', 'videoHdUrl'];
  const imageKeys = ['original_image_url', 'originalImageUrl', 'resized_image_url', 'resizedImageUrl'];
  const video = (Array.isArray(videos) && videos[0]) || (Array.isArray(cards) && cards.find((c) => pick(c, ...videoKeys))) || undefined;
  const image = (Array.isArray(images) && images[0]) || (Array.isArray(cards) && cards.find((c) => pick(c, ...imageKeys))) || undefined;
  const videoUrl = pick(video, ...videoKeys);
  const imageUrl = pick(image, ...imageKeys) ?? pick(video, 'video_preview_image_url', 'videoPreviewImageUrl');
  return {
    imageUrl: typeof imageUrl === 'string' ? imageUrl : undefined,
    videoUrl: typeof videoUrl === 'string' ? videoUrl : undefined,
  };
}

function hasMedia(url: string | undefined): boolean {
  return typeof url === 'string';
}

/** Winning = still active and running the longest. One ad per advertiser for variety. */
export function rankWinningAds(
  rawAds: RawAd[],
  mediaType: AdMediaType,
  limit = TOP_ADS,
  includeOtherKind = false,
  /** Keyword searches keep 1 ad per advertiser for variety; a brand's own page may keep several. */
  maxPerPage = 1
): WinningAd[] {
  const now = Date.now();
  const perPage = new Map<string, WinningAd[]>();
  const dropped = { inactive: 0, noDate: 0, catalog: 0, noMedia: 0, otherKind: 0 };

  for (const raw of rawAds) {
    if (pick(raw, 'is_active', 'isActive') === false) { dropped.inactive += 1; continue; }
    // Catalog/DPA ads are auto-generated from product feeds, not designed creatives worth modelling.
    const snapshotForFormat = pick(raw, 'snapshot') as RawAd | undefined;
    const displayFormat = String(pick(snapshotForFormat, 'displayFormat', 'display_format') ?? '').toUpperCase();
    const title = String(pick(snapshotForFormat, 'title') ?? '');
    // DPA = tiles generated from a product feed; DCO ads are real uploaded creatives Meta mixes, so they stay.
    if (displayFormat === 'DPA' || /\{\{.*\}\}/.test(title)) { dropped.catalog += 1; continue; }
    const start = toStartDate(raw);
    if (!start) { dropped.noDate += 1; continue; }
    const snapshot = pick(raw, 'snapshot') as RawAd | undefined;
    const media = firstMedia(snapshot);
    const mediaKind: 'image' | 'video' = hasMedia(media.videoUrl) ? 'video' : 'image';
    if (!hasMedia(media.imageUrl) && !hasMedia(media.videoUrl)) { dropped.noMedia += 1; continue; }
    if (!includeOtherKind && mediaKind !== mediaType) { dropped.otherKind += 1; continue; }

    const id = String(pick(raw, 'ad_archive_id', 'adArchiveID', 'adArchiveId', 'id') ?? '');
    if (!id) continue;
    const pageName = clean(pick(raw, 'page_name', 'pageName') ?? pick(snapshot, 'page_name'), 120) || 'Unknown advertiser';
    const body = pick(snapshot, 'body') as RawAd | string | undefined;

    const collationCount = Math.max(1, Number(pick(raw, 'collation_count', 'collationCount')) || 1);
    const daysRunning = Math.max(0, Math.floor((now - start.getTime()) / 86_400_000));
    const ad: WinningAd = {
      id,
      pageName,
      startDate: start.toISOString(),
      daysRunning,
      collationCount,
      winScore: Math.round(daysRunning * (1 + 0.5 * Math.log2(collationCount))),
      body: clean(typeof body === 'string' ? body : pick(body as RawAd, 'text'), 600) || undefined,
      title: clean(pick(snapshot, 'title'), 160) || undefined,
      ctaText: clean(pick(snapshot, 'cta_text', 'ctaText'), 40) || undefined,
      landingDomain: clean(pick(snapshot, 'caption') ?? pick(snapshot, 'link_url', 'linkUrl'), 80).replace(/^https?:\/\//, '').split('/')[0] || undefined,
      imageUrl: media.imageUrl || undefined,
      videoUrl: media.videoUrl || undefined,
      mediaKind,
      libraryUrl: `https://www.facebook.com/ads/library/?id=${encodeURIComponent(id)}`,
    };

    const key = pageName.toLowerCase();
    const list = perPage.get(key) ?? [];
    list.push(ad);
    perPage.set(key, list);
  }

  const kept = [...perPage.values()].flatMap((list) => list.sort((a, b) => b.winScore - a.winScore).slice(0, maxPerPage));
  if (rawAds.length > 0) {
    console.log(`Ad research filter: ${rawAds.length} raw → ${kept.length} kept (dropped: ${Object.entries(dropped).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'})`);
  }
  return kept
    .sort((a, b) => b.winScore - a.winScore)
    .slice(0, limit);
}

async function loadVideo(url: string): Promise<{ mimeType: string; bytes: Buffer } | null> {
  try {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 25000,
      maxContentLength: MAX_VIDEO_BYTES,
      maxBodyLength: MAX_VIDEO_BYTES,
    });
    return { mimeType: 'video/mp4', bytes: Buffer.from(response.data) };
  } catch {
    return null;
  }
}

/** For premium and luxury products, mass-market and discount-led creatives are the wrong reference. */
function tierRule(product: ShopifyProductContext, visual = false): string {
  const tier = priceTier(product);
  if (tier !== 'premium' && tier !== 'luxury') return '';
  return visual
    ? ` Our product is ${tier}: it ALSO fails when the creative is visibly mass-market (big sale or % OFF banners, cluttered discount graphics, marketplace-listing look), because a ${tier} buyer responds to different creatives.`
    : `\nOur product is ${tier}. An ad is relevant only if it also targets a ${tier} buyer: reject mass-market and discount-led ads (big % OFF or sale-led copy, low price points, "pack of 3", marketplace resellers such as Meesho or Amazon listings); keep brand-led, aspirational ads from brands at a similar price point. A brand-led ad with no price or discount passes when the brand or copy reads premium; reject only on clear mass-market signals.`;
}

/**
 * Keeps only ads that sell the same kind of product as ours. Longevity alone is
 * not enough: a keyword search for "sleep tea" also returns mattresses and clinics.
 */
async function filterRelevantAds(
  candidates: WinningAd[],
  product: ShopifyProductContext,
  niche: string
): Promise<{ ads: WinningAd[]; usage: ProviderUsage }> {
  if (candidates.length === 0) return { ads: [], usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
  const listing = candidates.map((ad, i) => `#${i + 1} | page: ${ad.pageName} | domain: ${ad.landingDomain || 'n/a'} | headline: ${ad.title || 'n/a'} | text: ${(ad.body || 'n/a').slice(0, 260)}`).join('\n');
  const prompt = `You are screening Meta ads for competitor research.

OUR PRODUCT
Name: ${clean(product.title, 160) || 'unknown'}
Brand: ${clean(product.vendor, 100) || 'unknown'}
Category: ${niche}
${priceLine(product)}
Description: ${clean(product.description, 500) || 'unknown'}

An ad is RELEVANT only if it is selling a consumer product of the same TYPE as ours, judged at the level a shopper browses rather than the exact sub-type, material or variant: for a herbal tea, any tea, herbal infusion or tea bags pass (not mattresses, supplements in capsule form, clinics, apps or courses); for a designer tissue saree, any saree passes (silk, Banarasi, organza, handloom, Kanjeevaram). General lifestyle pages, marketplaces and unrelated products that merely mention the same benefit fail. Judge from the page name, domain, headline and text; a brand known for this product type counts even when the copy does not name the type.${tierRule(product)}

ADS
${listing}

Return JSON only: {"relevant":[{"n":1,"reason":"<=12 words"}]} where n is the ad's # number from the list above, listing only the relevant ads, most relevant first.`;
  // An unreadable answer must not read as "nothing is relevant": ask for JSON, and retry once.
  let parsed: Record<string, unknown> | null = null;
  let usage: ProviderUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const { response, providerModel } = await requestGeminiText([{ text: prompt }], { temperature: 0, responseMimeType: 'application/json' }, 'Ad relevance screening');
    usage = addUsage(usage, geminiUsage(response, providerModel));
    parsed = parseJsonObject(geminiText(response));
    if (!parsed) console.warn(`Ad relevance screening returned no JSON (attempt ${attempt + 1}): ${geminiText(response).slice(0, 200) || response.data.candidates?.[0]?.finishReason || 'empty'}`);
  }
  console.log('Ad relevance candidates:\n' + candidates.map((ad) => `  ${ad.daysRunning}d x${ad.collationCount} | ${ad.pageName} | ${ad.landingDomain || 'n/a'} | ${(ad.title || '').slice(0, 60)} | ${(ad.body || '').slice(0, 90)}`).join('\n'));
  console.log('Ad relevance verdict:', JSON.stringify(parsed?.relevant ?? parsed).slice(0, 1500));
  // Accept the list number (asked for) or an ad id (models sometimes answer with either).
  const byId = new Map(candidates.map((ad) => [ad.id, ad]));
  const picked: WinningAd[] = [];
  (Array.isArray(parsed?.relevant) ? parsed.relevant : []).forEach((item) => {
    const record = (item && typeof item === 'object' ? item : { n: item }) as Record<string, unknown>;
    const raw = String(record.n ?? record.id ?? record.index ?? '').replace(/^#/, '').trim();
    const ad = byId.get(raw) ?? (/^\d{1,3}$/.test(raw) ? candidates[Number(raw) - 1] : undefined);
    if (ad && !picked.includes(ad)) picked.push(ad);
  });
  const ads = picked;
  console.log(`Ad research: ${ads.length} of ${candidates.length} long-running ads sell the same category (${niche})`);
  return { ads, usage };
}

/**
 * The text gate cannot see creatives, so a finalist can be a different product that
 * merely mentions the right words (a fruit-snack ad in a tea search). One look at
 * the finalists' images settles it. On failure, the text gate's result stands.
 */
async function verifyWinnersVisually(
  finalists: WinningAd[],
  product: ShopifyProductContext,
  niche: string
): Promise<{ ads: WinningAd[]; usage?: ProviderUsage }> {
  const withImages = finalists.filter((ad) => ad.imageUrl);
  if (withImages.length === 0) return { ads: finalists };
  try {
    const { images, sourceIndexes } = await loadPreparedReferences(withImages.map((ad) => ad.imageUrl as string));
    const parts: Parameters<typeof requestGeminiText>[0] = [{
      text: `We sell: ${clean(product.title, 160) || 'unknown'} (niche: ${niche}). ${priceLine(product)} Below are Meta ads found by keyword. For each, look at the IMAGE and decide whether it advertises the same TYPE of product as ours, at the level a shopper browses: for a herbal tea, any tea or herbal infusion passes (green tea, chai, blue tea, tea gift boxes); for lingerie, any lingerie or intimate wear passes; for a kids ride-on car, any kids ride-on vehicle passes. It fails only when the product is a different type altogether (for a tea: fruit snacks, supplements in capsules, mattresses, apps, services, clothing), even if the ad's text mentions similar words.${tierRule(product, true)}

Return JSON only: {"same":[n,...]} listing the # numbers that pass.`,
    }];
    images.forEach((image, i) => {
      parts.push({ text: `#${sourceIndexes[i] + 1} (${withImages[sourceIndexes[i]].pageName}):` }, { inlineData: { mimeType: image.mimeType, data: image.data } });
    });
    const { response, providerModel } = await requestGeminiText(parts, { temperature: 0 }, 'Winner visual check');
    const parsed = parseJsonObject(geminiText(response));
    const same = new Set((Array.isArray(parsed?.same) ? parsed.same : []).map((n) => Number(String(n).replace(/^#/, ''))).filter((n) => Number.isInteger(n)));
    const loaded = new Set(sourceIndexes);
    // Keep ads that passed, plus any whose image could not be loaded (no evidence against them).
    const kept = withImages.filter((ad, i) => same.has(i + 1) || !loaded.has(i));
    const dropped = withImages.filter((ad) => !kept.includes(ad)).map((ad) => ad.pageName);
    if (dropped.length) console.log(`Ad research: visual check dropped ${dropped.length} off-category ad(s): ${dropped.join(', ')}`);
    return { ads: [...kept, ...finalists.filter((ad) => !ad.imageUrl)], usage: geminiUsage(response, providerModel) };
  } catch (error) {
    console.warn('Winner visual check failed; keeping the text screening result:', error instanceof Error ? error.message : error);
    return { ads: finalists };
  }
}

/** Cheap first pass: each video ad's creative style from its cover frame and copy. */
async function classifyVideoStyles(
  ads: WinningAd[],
  niche: string
): Promise<{ styles: Map<string, ClassifiedVideoStyle>; usage?: ProviderUsage }> {
  const withImages = ads.filter((ad) => ad.imageUrl);
  if (withImages.length === 0) return { styles: new Map() };
  try {
    const { images, sourceIndexes } = await loadPreparedReferences(withImages.map((ad) => ad.imageUrl as string));
    const parts: Parameters<typeof requestGeminiText>[0] = [{
      text: `These are Meta video ads in the "${niche}" niche in India. For each you get the video's cover frame and its ad copy. Classify the creative style of the video:
${STYLE_DEFINITIONS}
The copy is evidence too ("I tried", "my honest review" suggests ugc; "as a dermatologist", "our founder" suggests talking_head; "how to" suggests demo). When unsure, give the most likely style.

Return JSON only: {"styles":{"1":"ugc","2":"cinematic"}} keyed by the # number.`,
    }];
    images.forEach((image, i) => {
      const ad = withImages[sourceIndexes[i]];
      parts.push(
        { text: `#${sourceIndexes[i] + 1} ${ad.pageName}. Headline: ${clean(ad.title, 120) || 'n/a'}. Text: ${clean(ad.body, 240) || 'n/a'}` },
        { inlineData: { mimeType: image.mimeType, data: image.data } }
      );
    });
    const { response, providerModel } = await requestGeminiText(parts, { temperature: 0 }, 'Video style classification');
    const parsed = parseJsonObject(geminiText(response));
    const raw = parsed?.styles && typeof parsed.styles === 'object' ? parsed.styles as Record<string, unknown> : {};
    const styles = new Map<string, ClassifiedVideoStyle>();
    Object.entries(raw).forEach(([key, value]) => {
      const ad = withImages[Number(key.replace(/^#/, '')) - 1];
      const style = CLASSIFIED_STYLES.find((candidate) => candidate === value);
      if (ad && style) styles.set(ad.id, style);
    });
    return { styles, usage: geminiUsage(response, providerModel) };
  } catch (error) {
    console.warn('Video style classification failed:', error instanceof Error ? error.message : error);
    return { styles: new Map() };
  }
}

async function analyzeWinningAds(
  ads: WinningAd[],
  mediaType: AdMediaType,
  niche: string,
  videoStyle?: VideoStyle
): Promise<{ patterns: string; designs: AdDesign[]; usage: ProviderUsage }> {
  const parts: Parameters<typeof requestGeminiText>[0] = [{
    text: `You are a senior Meta performance creative strategist for Indian D2C brands. Below are the longest-running active ${mediaType} ads in the "${niche}" niche on Meta in India. Longevity is our proxy for profitability: advertisers keep ads that make money.

Study each creative and its copy. Return JSON only:
{
  "brief": "CREATIVE PATTERN BRIEF, max 1500 characters: the visual formats, hook structures, text-overlay usage, proof/offer devices and emotional angles that recur across these ads${mediaType === 'video' ? ', plus video pacing (first 2 seconds, shot types, product reveal timing)' : ''}",
  "ads": [
    {
      "id": "the ad id given",
      "format": "e.g. product hero with headline / before-after / UGC selfie / benefit callouts / comparison / carousel card",
      "layout": "where the product sits, its size in frame, background/setting, supporting elements",
      "hook": "the headline structure and the promise it makes (structure, not brand wording)",
      "textPlacement": "how much text, where, hierarchy, colours",
      "colorMood": "palette, lighting, mood",
      "proofOrOffer": "reviews, ratings, guarantees, offers, badges used",
      "whyItWorks": "one sentence on the psychological lever"${mediaType === 'video' ? `,
      "sequence": [{"t":"0-2s","shot":"what is on screen","camera":"static / push-in / handheld / cut","text":"on-screen text if any","purpose":"hook / problem / reveal / proof / offer / CTA"}],
      "audio": "voice-over, music and sound style, and the spoken language if anyone speaks",
      "style": "ugc | talking_head | demo | cinematic | other"` : ''}
    }
  ]
}${mediaType === 'video' ? `\nFor ads whose video is attached, watch it to the end and give the full timed sequence from first frame to last (typically 4-8 beats). For ads where only a cover frame is attached, infer the likely sequence from the frame and copy and say so in "format".
"style" is the creative style of the whole video (judge it from the video itself when attached; a cover frame can mislead):
${STYLE_DEFINITIONS}${videoStyle && videoStyle !== 'any' ? `\nWe are looking specifically for ${videoStyleLabel(videoStyle)} ads, so judge "style" strictly.` : ''}` : ''}
Never copy a competitor's brand name, claims or exact wording into your descriptions.`,
  }];

  const imageUrls = ads.map((ad) => ad.imageUrl).filter((url): url is string => Boolean(url));
  const prepared = imageUrls.length > 0
    ? await loadPreparedReferences(imageUrls).catch(() => ({ images: [], sourceIndexes: [] as number[] }))
    : { images: [], sourceIndexes: [] as number[] };
  const imageByAd = new Map<string, { mimeType: string; data: string }>();
  prepared.images.forEach((image, i) => {
    const url = imageUrls[prepared.sourceIndexes[i]];
    const ad = ads.find((candidate) => candidate.imageUrl === url);
    if (ad) imageByAd.set(ad.id, image);
  });

  const videoByAd = new Map<string, Parameters<typeof requestGeminiText>[0][number]>();
  if (mediaType === 'video') {
    // Watch the top winners in full, longest-running first. The Files API takes whole videos;
    // inline data (capped per request) is the fallback when an upload fails.
    const toWatch = ads.slice(0, videoStyle && videoStyle !== 'any' ? MAX_VIDEOS_TO_WATCH_STYLED : MAX_VIDEOS_TO_WATCH);
    const videos = await Promise.all(
      toWatch.map(async (ad) => [ad.id, ad.videoUrl?.startsWith('http') ? await loadVideo(ad.videoUrl) : null] as const)
    );
    let inlineBudget = MAX_INLINE_VIDEO_TOTAL_BYTES;
    await Promise.all(videos.map(async ([id, video]) => {
      if (!video) return;
      const file = await uploadGeminiFile(video.bytes, video.mimeType, `winner-${id}`).catch((error) => {
        console.warn(`Ad research: video ${id} upload failed, trying inline:`, error instanceof Error ? error.message : error);
        return null;
      });
      if (file) { videoByAd.set(id, { fileData: file }); return; }
      if (video.bytes.byteLength > inlineBudget) { console.log(`Ad research: skipping video ${id} (${Math.round(video.bytes.byteLength / 1e6)} MB over inline budget)`); return; }
      inlineBudget -= video.bytes.byteLength;
      videoByAd.set(id, { inlineData: { mimeType: video.mimeType, data: video.bytes.toString('base64') } });
    }));
    console.log(`Ad research: watching ${videoByAd.size} of ${toWatch.length} winning videos`);
  }

  ads.forEach((ad, index) => {
    parts.push({
      text: `AD ${index + 1} — id ${ad.id} — running ${ad.daysRunning} days${ad.mediaKind === 'video' && mediaType === 'image' ? ' (video ad; its cover frame is shown)' : ''}. Headline: ${ad.title || 'n/a'}. CTA: ${ad.ctaText || 'n/a'}. Primary text: ${ad.body || 'n/a'}`,
    });
    const video = videoByAd.get(ad.id);
    const image = imageByAd.get(ad.id);
    if (video) parts.push(video);
    else if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  });

  const { response, providerModel } = await requestGeminiText(parts, { temperature: 0.3 }, 'Winning ad analysis', [], videoByAd.size ? 180000 : 60000);
  const text = geminiText(response);
  const parsed = parseJsonObject(text);
  const byId = new Map(ads.map((ad) => [ad.id, ad]));
  const designs: AdDesign[] = (Array.isArray(parsed?.ads) ? parsed.ads : [])
    .map((item): AdDesign | null => {
      const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const ad = byId.get(String(record.id ?? ''));
      if (!ad) return null;
      return {
        id: ad.id,
        pageName: ad.pageName,
        daysRunning: ad.daysRunning,
        format: clean(record.format, 120),
        layout: clean(record.layout, 400),
        hook: clean(record.hook, 300),
        textPlacement: clean(record.textPlacement, 300),
        colorMood: clean(record.colorMood, 200),
        proofOrOffer: clean(record.proofOrOffer, 200),
        whyItWorks: clean(record.whyItWorks, 200),
        sequence: Array.isArray(record.sequence)
          ? record.sequence
              .map((beat): AdSequenceShot | null => {
                const b = (beat && typeof beat === 'object' ? beat : {}) as Record<string, unknown>;
                const shot = clean(b.shot, 220);
                if (!shot) return null;
                return { t: clean(b.t, 12) || '?', shot, camera: clean(b.camera, 80) || undefined, text: clean(b.text, 120) || undefined, purpose: clean(b.purpose, 40) || undefined };
              })
              .filter((beat): beat is AdSequenceShot => beat !== null)
              .slice(0, 10)
          : undefined,
        audio: clean(record.audio, 200) || undefined,
        style: mediaType === 'video' ? CLASSIFIED_STYLES.find((candidate) => candidate === record.style) : undefined,
        watched: videoByAd.has(ad.id),
      };
    })
    .filter((design): design is AdDesign => design !== null);
  return {
    patterns: (clean(parsed?.brief, 2500) || text).slice(0, 2500),
    designs,
    usage: geminiUsage(response, providerModel),
  };
}

/**
 * Meta's creative URLs are signed CDN links that expire within days. Copy each
 * winner's image (and SD video) into our storage so the UI strip and later
 * analysis keep working; fall back to the original URL if a copy fails.
 */
async function persistWinnerMedia(ads: WinningAd[]): Promise<WinningAd[]> {
  const { uploadBufferToBucket } = await import('@/lib/server/supabaseStorage');
  const copy = async (url: string | undefined, bucket: string, mime: string, maxBytes: number): Promise<string | undefined> => {
    if (!url || !/^https?:\/\//.test(url)) return url;
    try {
      const response = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 25000, maxContentLength: maxBytes, maxBodyLength: maxBytes });
      const type = String(response.headers['content-type'] || mime).split(';')[0].trim() || mime;
      return await uploadBufferToBucket(Buffer.from(response.data), bucket, type.startsWith('image/') || type.startsWith('video/') ? type : mime);
    } catch (error) {
      console.warn('Could not persist winner media, keeping the CDN link:', error instanceof Error ? error.message : error);
      return url;
    }
  };
  return Promise.all(ads.map(async (ad) => ({
    ...ad,
    imageUrl: await copy(ad.imageUrl, 'generated-thumbnails', 'image/jpeg', 8 * 1024 * 1024),
    videoUrl: await copy(ad.videoUrl, 'generated-videos', 'video/mp4', MAX_VIDEO_BYTES),
  })));
}

/** Live counters for the UI while research runs. */
export interface ResearchProgress {
  phase: 'scraping' | 'scraped' | 'screened' | 'analyzing';
  scraped?: number;
  designed?: number;
  relevant?: number;
  /** Relevant video ads that look like the chosen style. */
  styled?: number;
  winners?: number;
}

export async function researchWinningAds(
  product: ShopifyProductContext,
  mediaType: AdMediaType,
  country = 'IN',
  options: { imageUrls?: string[]; onProgress?: (progress: ResearchProgress) => void; niche?: NicheInfo; videoStyle?: VideoStyle } = {}
): Promise<AdResearchResult> {
  const { niche, keywords, competitors, tier, styleKeywords = [], usage: keywordUsage } = options.niche ?? await deriveNicheKeywords(product, options.imageUrls ?? [], options.videoStyle);
  // Screen ads against the category-relative tier, not only the fixed price bands.
  const screenFor: ShopifyProductContext = tier ? { ...product, tier } : product;
  // A chosen video style narrows the winners to ads of that style ("any" keeps the best of every style).
  const style = mediaType === 'video' && options.videoStyle && options.videoStyle !== 'any' ? options.videoStyle : undefined;
  let styleFallback = false;
  let styleTierRelaxed = false;
  let styledCount: number | undefined;
  const onProgress = options.onProgress ?? (() => undefined);
  onProgress({ phase: 'scraping' });
  const cacheKey = `${process.env.AD_RESEARCH_MOCK === 'true' ? 'mock|' : ''}${country}|${mediaType}|${style ?? ''}|${tier ?? ''}|${[...keywords, ...competitors, ...styleKeywords].join(',').toLowerCase()}`;
  const cached = researchCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.result, usage: keywordUsage };
  }

  const mock = process.env.AD_RESEARCH_MOCK === 'true';
  let ads: WinningAd[] = [];
  let screenedRelevantCount = 0;
  let relevanceUsage: ProviderUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  if (mock) {
    ads = rankWinningAds(sampleAdLibraryItems(niche, mediaType), mediaType);
  } else {
    // All age tiers scrape concurrently (one round-trip instead of up to four); the
    // oldest tier with enough usable ads wins, otherwise the tier with the most.
    const provider = getResearchProvider();
    if (!provider) throw new Error('Winning-ad research is not configured (set AD_SCRAPER_URL or SCRAPECREATORS_API_KEY).');
    const jobs: Array<{ label: string; run: () => Promise<RawAd[]> }> = [];
    if (provider === 'selfhosted') {
      // Free path: our own scraper; each job falls back to ScrapeCreators if the scraper fails.
      const withFallback = (label: string, primary: () => Promise<RawAd[]>, fallback?: () => Promise<RawAd[]>) => ({
        label,
        run: async () => {
          // Throttled recently: go straight to the API.
          if (!selfhostedAvailable() && fallback && process.env.SCRAPECREATORS_API_KEY) return fallback();
          try {
            return await primary();
          } catch (error) {
            if (!fallback || !process.env.SCRAPECREATORS_API_KEY) throw error;
            console.warn(`Ad research ${label}: self-hosted scraper failed (${error instanceof Error ? error.message : error}); using ScrapeCreators`);
            return fallback();
          }
        },
      });
      keywords.forEach((keyword) => jobs.push(withFallback(
        `"${keyword}" (${mediaType})`,
        () => shSearchAds(keyword, country, mediaType, 40),
        () => scSearchAds(keyword, country, mediaType, SC_PAGES_PER_KEYWORD)
      )));
      competitors.forEach((brand) => jobs.push(withFallback(
        `competitor ${brand}`,
        () => shCompanyAds(brand, country, 40),
        () => scCompanyAds(brand, country, SC_PAGES_PER_COMPANY)
      )));
    } else if (provider === 'scrapecreators') {
      // Current top ads by impressions, plus ads that were already running months ago
      // and are still active (the Ad Library's impressions-window filter): long-runners.
      const longRunnerCutoff = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
      keywords.forEach((keyword) => {
        jobs.push({
          label: `"${keyword}" (${mediaType})`,
          run: () => scSearchAds(keyword, country, mediaType, SC_PAGES_PER_KEYWORD),
        });
        jobs.push({
          label: `"${keyword}" (${mediaType}) live since before ${longRunnerCutoff}`,
          run: () => scSearchAds(keyword, country, mediaType, 2, longRunnerCutoff),
        });
      });
      // Competitor brands' own pages: their real creatives, mostly video.
      competitors.forEach((brand) => jobs.push({
        label: `competitor ${brand}`,
        run: () => scCompanyAds(brand, country, SC_PAGES_PER_COMPANY),
      }));
    } else {
      // Apify: category keywords by age tier, plus competitor names as keywords.
      MIN_AGE_CASCADE_DAYS.forEach((minAgeDays) => jobs.push({
        label: `"${keywords.join('", "')}" running ${minAgeDays ?? 0}+ days`,
        run: () => scrapeAdLibrary(keywords, country, mediaType, minAgeDays),
      }));
      if (competitors.length > 0) {
        jobs.push({
          label: `competitors ${competitors.join(', ')}`,
          run: () => scrapeAdLibrary(competitors, country, 'all', null, ADS_PER_COMPETITOR),
        });
      }
    }
    // Chosen style: also search the phrases that style's ads carry ("saree haul", "how to drape").
    if (style) {
      styleKeywords.forEach((keyword) => jobs.push({
        label: `style "${keyword}" (video)`,
        run: async () => {
          if (provider === 'apify') return scrapeAdLibrary([keyword], country, 'video', null);
          if (provider === 'selfhosted' && selfhostedAvailable()) {
            try {
              return await shSearchAds(keyword, country, 'video', 40);
            } catch (error) {
              if (!process.env.SCRAPECREATORS_API_KEY) throw error;
            }
          }
          return process.env.SCRAPECREATORS_API_KEY ? scSearchAds(keyword, country, 'video', 2) : [];
        },
      }));
    }
    let scrapedTotal = 0;
    const tiers = await Promise.all(
      jobs.map(async (job) => {
        const started = Date.now();
        const rawAds = await job.run().catch((error) => {
          console.warn(`Ad research ${job.label} failed:`, error instanceof Error ? error.message : error);
          return [] as RawAd[];
        });
        scrapedTotal += rawAds.length;
        const ranked = rankWinningAds(rawAds, mediaType, CANDIDATE_POOL, true, job.label.startsWith('competitor') ? 4 : 1);
        console.log(`Ad research: ${ranked.length} usable ${mediaType} ads for ${job.label} (${Math.round((Date.now() - started) / 1000)}s)`);
        return ranked;
      })
    );
    // Merge tiers, longest-running first, then keep only ads selling our category.
    const pool = new Map<string, WinningAd>();
    tiers.flat().forEach((ad) => {
      const existing = pool.get(ad.id);
      if (!existing || ad.winScore > existing.winScore) pool.set(ad.id, ad);
    });
    // Gate every candidate first: long-running junk (advertorials, novel apps) must not
    // crowd out genuine competitors that happen to refresh creatives more often.
    const candidates = [...pool.values()].sort((a, b) => b.winScore - a.winScore).slice(0, CANDIDATE_POOL);
    let allCandidates = candidates;
    onProgress({ phase: 'scraped', scraped: scrapedTotal, designed: pool.size });
    const screened = await filterRelevantAds(candidates, screenFor, niche);
    relevanceUsage = screened.usage;
    let relevant = screened.ads;

    // Thin niche: broaden once. Search every media type (brands often run video; their
    // cover frames are valid references) and add the niche phrase itself as a keyword.
    if (relevant.length < MIN_USABLE_ADS && provider !== 'apify') {
      const broadKeywords = Array.from(new Set([...keywords, niche].map((k) => k.toLowerCase())));
      const seen = new Set(candidates.map((ad) => ad.id));
      const extraTiers = await Promise.all(broadKeywords.map(async (keyword) => {
        const rawAds = await (provider === 'selfhosted' && selfhostedAvailable()
          ? shSearchAds(keyword, country, 'all', 40).catch(() => (process.env.SCRAPECREATORS_API_KEY ? scSearchAds(keyword, country, 'all', 2) : []))
          : process.env.SCRAPECREATORS_API_KEY ? scSearchAds(keyword, country, 'all', 2) : Promise.resolve([] as RawAd[])
        ).catch((error) => {
          console.warn(`Ad research broad "${keyword}" failed:`, error instanceof Error ? error.message : error);
          return [] as RawAd[];
        });
        scrapedTotal += rawAds.length;
        return rankWinningAds(rawAds, mediaType, CANDIDATE_POOL, true, 2);
      }));
      const extra = extraTiers.flat().filter((ad) => !seen.has(ad.id) && (seen.add(ad.id), true)).sort((a, b) => b.winScore - a.winScore).slice(0, CANDIDATE_POOL);
      allCandidates = [...candidates, ...extra];
      console.log(`Ad research: only ${relevant.length} relevant; broad pass over "${broadKeywords.join('", "')}" (all media) found ${extra.length} new candidates`);
      onProgress({ phase: 'scraped', scraped: scrapedTotal, designed: pool.size + extra.length });
      if (extra.length > 0) {
        const second = await filterRelevantAds(extra, screenFor, niche);
        relevanceUsage = addUsage(relevanceUsage, second.usage);
        relevant = [...relevant, ...second.ads];
      }
    }
    relevant = relevant.sort((a, b) => b.winScore - a.winScore);
    // Every relevant ad regardless of style, for when no ad of the chosen style survives.
    let anyStyle = relevant;

    // Chosen style: label the strongest relevant videos from cover frame and copy and keep
    // that style; the analysis step then confirms it by watching the videos themselves.
    if (style) {
      const videos = relevant.filter((ad) => ad.mediaKind === 'video').slice(0, STYLE_POOL);
      const classified = await classifyVideoStyles(videos, niche);
      relevanceUsage = addUsage(relevanceUsage, classified.usage);
      relevant = relevant.map((ad) => (classified.styles.has(ad.id) ? { ...ad, style: classified.styles.get(ad.id) } : ad));
      anyStyle = relevant;
      let matching = relevant.filter((ad) => ad.style === style);
      const counts = CLASSIFIED_STYLES.map((s) => `${s} ${videos.filter((ad) => classified.styles.get(ad.id) === s).length}`).join(', ');
      console.log(`Ad research: ${matching.length} of ${videos.length} relevant videos look like ${style} (${counts})`);
      const tiered = priceTier(screenFor);
      if (matching.length === 0 && (tiered === 'premium' || tiered === 'luxury')) {
        // The style may simply not exist at this price tier (luxury sarees run almost no UGC).
        // The user chose the style, so keep the product type but drop the tier requirement.
        const seen = new Set(relevant.map((ad) => ad.id));
        const rest = allCandidates.filter((ad) => ad.mediaKind === 'video' && !seen.has(ad.id));
        const regated = await filterRelevantAds(rest, { ...product, price: undefined, tier: undefined }, niche);
        relevanceUsage = addUsage(relevanceUsage, regated.usage);
        const moreVideos = regated.ads.sort((a, b) => b.winScore - a.winScore).slice(0, STYLE_POOL);
        const reclassified = await classifyVideoStyles(moreVideos, niche);
        relevanceUsage = addUsage(relevanceUsage, reclassified.usage);
        matching = moreVideos
          .map((ad) => ({ ...ad, style: reclassified.styles.get(ad.id) }))
          .filter((ad) => ad.style === style);
        styleTierRelaxed = matching.length > 0;
        console.log(`Ad research: no ${tiered} ${style} ads; ${matching.length} ${style} ads from other price points`);
      }
      styledCount = matching.length;
      if (matching.length > 0) relevant = matching;
      else styleFallback = true;
    }
    // Look at the strongest finalists' creatives before trusting them. Style ads taken from
    // other price points are checked for product type only.
    let visual = await verifyWinnersVisually(relevant.slice(0, 10), styleTierRelaxed ? { ...product, price: undefined, tier: undefined } : screenFor, niche);
    relevanceUsage = addUsage(relevanceUsage, visual.usage);
    let checked = [...visual.ads, ...relevant.slice(10)];
    if (style && !styleFallback && checked.length === 0) {
      console.log(`Ad research: no ${style} ad passed the visual check; using the best video ads of any style`);
      styleFallback = true;
      styleTierRelaxed = false;
      visual = await verifyWinnersVisually(anyStyle.slice(0, 10), screenFor, niche);
      relevanceUsage = addUsage(relevanceUsage, visual.usage);
      checked = [...visual.ads, ...anyStyle.slice(10)];
    }
    relevant = checked.sort((a, b) => b.winScore - a.winScore);
    screenedRelevantCount = relevant.length;
    const sameKind = relevant.filter((ad) => ad.mediaKind === mediaType);
    const otherKind = relevant.filter((ad) => ad.mediaKind !== mediaType);
    const diverse = (list: WinningAd[]) => {
      const perPage = new Map<string, number>();
      return list.filter((ad) => {
        const key = ad.pageName.toLowerCase();
        const n = perPage.get(key) ?? 0;
        if (n >= 2) return false;
        perPage.set(key, n + 1);
        return true;
      });
    };
    const preferred = diverse(sameKind);
    ads = (preferred.length >= MIN_USABLE_ADS
      ? preferred.slice(0, TOP_ADS)
      : diverse([...sameKind, ...otherKind]).slice(0, TOP_ADS)
    ).sort((a, b) => b.winScore - a.winScore);
    if (otherKind.length && sameKind.length < MIN_USABLE_ADS) {
      console.log(`Ad research: only ${sameKind.length} relevant ${mediaType} ads; using ${Math.min(otherKind.length, TOP_ADS - sameKind.length)} ${mediaType === 'image' ? 'video cover frames' : 'image ads'} as extra design references`);
    }
  }
  if (ads.length === 0) {
    throw new Error(`No long-running ${mediaType} ads selling ${niche} were found on Meta in ${country}.`);
  }
  onProgress({ phase: 'screened', relevant: screenedRelevantCount, styled: styledCount, winners: ads.length });

  if (!mock) ads = await persistWinnerMedia(ads);
  onProgress({ phase: 'analyzing', winners: ads.length });
  const analysis = await analyzeWinningAds(ads, mediaType, niche, options.videoStyle);

  if (mediaType === 'video') {
    // What the videos actually are, once watched (a cover frame can mislead).
    const watched = new Map(analysis.designs.filter((d) => d.watched && d.style).map((d) => [d.id, d.style as ClassifiedVideoStyle]));
    ads = ads.map((ad) => (watched.has(ad.id) ? { ...ad, style: watched.get(ad.id), styleConfirmed: true } : ad));
    if (style && !styleFallback) {
      const confirmed = ads.filter((ad) => ad.styleConfirmed && ad.style === style);
      const unwatched = ads.filter((ad) => !ad.styleConfirmed && ad.style === style);
      if (confirmed.length + unwatched.length > 0) {
        const dropped = ads.length - confirmed.length - unwatched.length;
        if (dropped > 0) console.log(`Ad research: watching showed ${dropped} winner(s) are not ${style}; dropped`);
        ads = [...confirmed, ...unwatched];
      } else {
        console.log(`Ad research: none of the watched winners is really ${style}; keeping the closest candidates`);
        styleFallback = true;
      }
    }
    // The storyboard follows the first design with a sequence: keep designs in winner order.
    const order = new Map(ads.map((ad, i) => [ad.id, i]));
    analysis.designs = analysis.designs.filter((d) => order.has(d.id)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
  const result: AdResearchResult = {
    niche,
    keywords,
    country,
    mediaType,
    ads,
    patterns: analysis.patterns,
    designs: analysis.designs,
    tier,
    videoStyle: options.videoStyle,
    styleFallback: style ? styleFallback : undefined,
    styleTierRelaxed: style ? styleTierRelaxed : undefined,
    mock,
    usage: {
      inputTokens: keywordUsage.inputTokens + relevanceUsage.inputTokens + analysis.usage.inputTokens,
      outputTokens: keywordUsage.outputTokens + relevanceUsage.outputTokens + analysis.usage.outputTokens,
      totalTokens: keywordUsage.totalTokens + relevanceUsage.totalTokens + analysis.usage.totalTokens,
      providerModel: analysis.usage.providerModel,
    },
  };

  researchCache.set(cacheKey, { createdAt: Date.now(), result });
  return result;
}
