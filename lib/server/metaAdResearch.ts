import axios from 'axios';
import { loadPreparedReferences, requestGeminiText } from '@/lib/banana/api';
import type { ProviderUsage } from '@/lib/server/usage';
import type { ShopifyProductContext } from '@/lib/prompts/shopifyCreative';

export type AdMediaType = 'image' | 'video';

export interface WinningAd {
  id: string;
  pageName: string;
  startDate: string;
  daysRunning: number;
  body?: string;
  title?: string;
  ctaText?: string;
  imageUrl?: string;
  videoUrl?: string;
  libraryUrl: string;
}

export interface AdResearchResult {
  niche: string;
  keywords: string[];
  country: string;
  mediaType: AdMediaType;
  ads: WinningAd[];
  patterns: string;
  /** True when sample ads were used instead of a live Ad Library scrape (AD_RESEARCH_MOCK). */
  mock: boolean;
  usage: ProviderUsage;
}

const DEFAULT_ACTOR = 'apify~facebook-ads-scraper';
const ADS_PER_KEYWORD = 40;
// Longest-running first: only ads already live this many days ago (and still active) qualify.
const MIN_AGE_CASCADE_DAYS: Array<number | null> = [180, 90, 30, null];
const MIN_USABLE_ADS = 3;
const TOP_ADS = 6;
const MAX_VIDEO_BYTES = 12 * 1024 * 1024;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const researchCache = new Map<string, { createdAt: number; result: AdResearchResult }>();

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

async function deriveNicheKeywords(product: ShopifyProductContext): Promise<{
  niche: string;
  keywords: string[];
  usage: ProviderUsage;
}> {
  const { response, providerModel } = await requestGeminiText(
    [{
      text: `You pick Meta Ad Library search keywords for competitor research in India.

Product name: ${clean(product.title, 180) || 'unknown'}
Brand: ${clean(product.vendor, 120) || 'unknown'}
Description: ${clean(product.description, 700) || 'unknown'}

Return JSON only: {"niche":"2-4 word product category","keywords":["kw1","kw2"]}
Rules: exactly 2 keywords, each 1-3 words, generic category terms competitors would use in ad copy (e.g. "protein powder", "hair oil"). Never include this brand's own name.`,
    }],
    { temperature: 0.2 },
    'Ad research keyword planning'
  );
  const parsed = parseJsonObject(geminiText(response));
  const keywords = Array.isArray(parsed?.keywords)
    ? parsed.keywords.map((k) => clean(k, 40)).filter(Boolean).slice(0, 2)
    : [];
  const fallback = clean(product.title, 60).split(' ').slice(-2).join(' ');
  return {
    niche: clean(parsed?.niche, 60) || fallback || 'product',
    keywords: keywords.length > 0 ? keywords : [fallback || 'product'],
    usage: geminiUsage(response, providerModel),
  };
}

function adLibrarySearchUrl(keyword: string, country: string, mediaType: AdMediaType): string {
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

type RawAd = Record<string, unknown>;

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

async function scrapeAdLibrary(
  keywords: string[],
  country: string,
  mediaType: AdMediaType,
  minAgeDays: number | null
): Promise<RawAd[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error('Winning-ad research is not configured (missing APIFY_API_TOKEN).');
  const actor = process.env.APIFY_META_ADS_ACTOR || DEFAULT_ACTOR;

  // apify/facebook-ads-scraper input; the Ad Library search URL carries country, keyword and media type.
  const response = await axios.post<unknown>(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=150`,
    {
      startUrls: keywords.map((keyword) => ({ url: adLibrarySearchUrl(keyword, country, mediaType) })),
      resultsLimit: ADS_PER_KEYWORD * keywords.length,
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

  return Array.isArray(response.data) ? response.data.filter((item): item is RawAd => !!item && typeof item === 'object') : [];
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
export function rankWinningAds(rawAds: RawAd[], mediaType: AdMediaType, limit = TOP_ADS): WinningAd[] {
  const now = Date.now();
  const bestPerPage = new Map<string, WinningAd>();

  for (const raw of rawAds) {
    if (pick(raw, 'is_active', 'isActive') === false) continue;
    // Catalog/DPA ads are auto-generated from product feeds, not designed creatives worth modelling.
    const snapshotForFormat = pick(raw, 'snapshot') as RawAd | undefined;
    const displayFormat = String(pick(snapshotForFormat, 'displayFormat', 'display_format') ?? '').toUpperCase();
    const title = String(pick(snapshotForFormat, 'title') ?? '');
    if (displayFormat === 'DPA' || displayFormat === 'DCO' || /\{\{.*\}\}/.test(title)) continue;
    const start = toStartDate(raw);
    if (!start) continue;
    const snapshot = pick(raw, 'snapshot') as RawAd | undefined;
    const media = firstMedia(snapshot);
    if (mediaType === 'video' ? !hasMedia(media.videoUrl) : !hasMedia(media.imageUrl) || hasMedia(media.videoUrl)) continue;

    const id = String(pick(raw, 'ad_archive_id', 'adArchiveID', 'adArchiveId', 'id') ?? '');
    if (!id) continue;
    const pageName = clean(pick(raw, 'page_name', 'pageName') ?? pick(snapshot, 'page_name'), 120) || 'Unknown advertiser';
    const body = pick(snapshot, 'body') as RawAd | string | undefined;

    const ad: WinningAd = {
      id,
      pageName,
      startDate: start.toISOString(),
      daysRunning: Math.max(0, Math.floor((now - start.getTime()) / 86_400_000)),
      body: clean(typeof body === 'string' ? body : pick(body as RawAd, 'text'), 600) || undefined,
      title: clean(pick(snapshot, 'title'), 160) || undefined,
      ctaText: clean(pick(snapshot, 'cta_text', 'ctaText'), 40) || undefined,
      imageUrl: media.imageUrl || undefined,
      videoUrl: media.videoUrl || undefined,
      libraryUrl: `https://www.facebook.com/ads/library/?id=${encodeURIComponent(id)}`,
    };

    const key = pageName.toLowerCase();
    const existing = bestPerPage.get(key);
    if (!existing || ad.daysRunning > existing.daysRunning) bestPerPage.set(key, ad);
  }

  return [...bestPerPage.values()]
    .sort((a, b) => b.daysRunning - a.daysRunning)
    .slice(0, limit);
}

async function loadVideoInline(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 20000,
      maxContentLength: MAX_VIDEO_BYTES,
      maxBodyLength: MAX_VIDEO_BYTES,
    });
    return { mimeType: 'video/mp4', data: Buffer.from(response.data).toString('base64') };
  } catch {
    return null;
  }
}

async function analyzeWinningAds(
  ads: WinningAd[],
  mediaType: AdMediaType,
  niche: string
): Promise<{ patterns: string; usage: ProviderUsage }> {
  const parts: Parameters<typeof requestGeminiText>[0] = [{
    text: `You are a senior Meta performance creative strategist for Indian D2C brands. Below are the longest-running active ${mediaType} ads in the "${niche}" niche on Meta in India. Longevity is our proxy for profitability: advertisers keep ads that make money.

Study the creatives and copy, then write a concise CREATIVE PATTERN BRIEF (max 1,800 characters) that another model will use to make new ads for a different brand in this niche. Cover:
1. Dominant visual formats and layouts (e.g. product hero + bold headline, before/after, UGC selfie, benefit callouts, comparison).
2. Hook styles and headline structures that recur (quote short examples of structure, not brand names).
3. How text overlays are used: amount, placement, hierarchy.
4. Offers, proof and trust devices that recur (reviews, ratings, "Made in India", guarantees).
5. Emotional angles and customer pain points being hit.
${mediaType === 'video' ? '6. Video pacing: what happens in the first 2 seconds, shot types, camera movement, product reveal timing.\n' : ''}Never copy a competitor's brand name, claims, or exact wording. Plain text, no preamble.`,
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

  const videoByAd = new Map<string, { mimeType: string; data: string }>();
  if (mediaType === 'video') {
    const videos = await Promise.all(
      ads.slice(0, 2).map(async (ad) => [ad.id, ad.videoUrl?.startsWith('http') ? await loadVideoInline(ad.videoUrl) : null] as const)
    );
    videos.forEach(([id, video]) => { if (video) videoByAd.set(id, video); });
  }

  ads.forEach((ad, index) => {
    parts.push({
      text: `AD ${index + 1} — running ${ad.daysRunning} days. Headline: ${ad.title || 'n/a'}. CTA: ${ad.ctaText || 'n/a'}. Primary text: ${ad.body || 'n/a'}`,
    });
    const video = videoByAd.get(ad.id);
    const image = imageByAd.get(ad.id);
    if (video) parts.push({ inlineData: { mimeType: video.mimeType, data: video.data } });
    else if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  });

  const { response, providerModel } = await requestGeminiText(parts, { temperature: 0.3 }, 'Winning ad analysis');
  return {
    patterns: geminiText(response).slice(0, 2500),
    usage: geminiUsage(response, providerModel),
  };
}

export async function researchWinningAds(
  product: ShopifyProductContext,
  mediaType: AdMediaType,
  country = 'IN'
): Promise<AdResearchResult> {
  const { niche, keywords, usage: keywordUsage } = await deriveNicheKeywords(product);
  const cacheKey = `${process.env.AD_RESEARCH_MOCK === 'true' ? 'mock|' : ''}${country}|${mediaType}|${keywords.join(',').toLowerCase()}`;
  const cached = researchCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.result, usage: keywordUsage };
  }

  const mock = process.env.AD_RESEARCH_MOCK === 'true';
  let ads: WinningAd[] = [];
  if (mock) {
    ads = rankWinningAds(sampleAdLibraryItems(niche, mediaType), mediaType);
  } else {
    for (const minAgeDays of MIN_AGE_CASCADE_DAYS) {
      const rawAds = await scrapeAdLibrary(keywords, country, mediaType, minAgeDays);
      const ranked = rankWinningAds(rawAds, mediaType);
      console.log(`Ad research: ${ranked.length} usable ${mediaType} ads for "${keywords.join('", "')}" running ${minAgeDays ?? 0}+ days`);
      if (ranked.length > ads.length) ads = ranked;
      if (ads.length >= MIN_USABLE_ADS) break;
    }
  }
  if (ads.length === 0) {
    throw new Error(`No active ${mediaType} ads found on Meta for "${keywords.join('", "')}" in ${country}.`);
  }

  const analysis = await analyzeWinningAds(ads, mediaType, niche);
  const result: AdResearchResult = {
    niche,
    keywords,
    country,
    mediaType,
    ads,
    patterns: analysis.patterns,
    mock,
    usage: {
      inputTokens: keywordUsage.inputTokens + analysis.usage.inputTokens,
      outputTokens: keywordUsage.outputTokens + analysis.usage.outputTokens,
      totalTokens: keywordUsage.totalTokens + analysis.usage.totalTokens,
      providerModel: analysis.usage.providerModel,
    },
  };

  researchCache.set(cacheKey, { createdAt: Date.now(), result });
  return result;
}
