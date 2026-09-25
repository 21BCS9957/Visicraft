import axios from 'axios';
import sharp from 'sharp';
import type { ProviderUsage } from '@/lib/server/usage';

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiRequest {
  contents: Array<{
    parts: GeminiPart[];
  }>;
  generationConfig?: {
    responseModalities?: string[];
    responseMimeType?: string;
    temperature?: number;
    imageConfig?: {
      aspectRatio?: string;
      imageSize?: string;
    };
  };
}

interface DownloadedImage {
  data: string;
  mimeType: string;
  byteLength: number;
}

const MAX_REFERENCE_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_PREPARED_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_INLINE_REFERENCE_BYTES = 14 * 1024 * 1024;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 20000;
const GEMINI_REQUEST_TIMEOUT_MS = 90000;
const REFERENCE_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_REFERENCE_CACHE_ENTRIES = 64;

const preparedReferenceCache = new Map<string, {
  createdAt: number;
  promise: Promise<DownloadedImage>;
}>();

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts: Array<{
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string;
        };
      }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export interface GeneratedImageData {
  images: string[];
  usage: ProviderUsage;
}

export interface ProductIdentityAnalysis {
  manifest: string;
  canonicalReferenceIndex: number;
  usage: ProviderUsage;
}

export interface ProductIdentityValidation {
  passed: boolean;
  score: number;
  checks: Record<'packagingTextExact' | 'logoExact' | 'artworkLayoutExact' | 'geometryExact', boolean>;
  reason: string;
  usage: ProviderUsage;
}

export async function requestGeminiText(
  parts: GeminiPart[],
  generationConfig: NonNullable<GeminiRequest['generationConfig']>,
  operation: string
): Promise<{ response: { data: GeminiResponse }; providerModel: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  // Google retired gemini-2.5-flash(-lite) for new API keys; keep them as late fallbacks only.
  const modelCandidates = Array.from(new Set([
    process.env.GEMINI_ANALYSIS_MODEL,
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ].filter((model): model is string => Boolean(model))));
  let lastError: unknown;

  for (const providerModel of modelCandidates) {
    const apiVersion = 'v1beta';
    try {
      const response = await axios.post<GeminiResponse>(
        `https://generativelanguage.googleapis.com/${apiVersion}/models/${providerModel}:generateContent`,
        {
          contents: [{ parts }],
          generationConfig,
        } satisfies GeminiRequest,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          timeout: 60000,
        }
      );
      return { response, providerModel };
    } catch (error) {
      lastError = error;
      if (!axios.isAxiosError(error)) throw error;

      const status = error.response?.status;
      const responseData = error.response?.data as {
        error?: { message?: string };
        message?: string;
      } | undefined;
      const upstreamMessage = responseData?.error?.message || responseData?.message || error.message;
      const unavailableModel = status === 404 || (
        status === 400 && /model|not found|not supported/i.test(upstreamMessage)
      );

      console.warn(`${operation} failed with ${providerModel}:`, status, upstreamMessage);
      if (unavailableModel) continue;

      throw new Error(`Google ${operation.toLowerCase()} failed${status ? ` (${status})` : ''}: ${upstreamMessage}`);
    }
  }

  if (axios.isAxiosError(lastError)) {
    const responseData = lastError.response?.data as {
      error?: { message?: string };
      message?: string;
    } | undefined;
    const upstreamMessage = responseData?.error?.message || responseData?.message || lastError.message;
    throw new Error(`Google ${operation.toLowerCase()} is unavailable: ${upstreamMessage}`);
  }

  throw new Error(`Google ${operation.toLowerCase()} is unavailable.`);
}

export async function loadPreparedReferences(referenceImages: string[]): Promise<{
  images: DownloadedImage[];
  sourceIndexes: number[];
  totalBytes: number;
}> {
  const downloadResults = await Promise.allSettled(
    referenceImages.map((url) => getPreparedReferenceImage(url))
  );
  const images: DownloadedImage[] = [];
  const sourceIndexes: number[] = [];
  let totalBytes = 0;

  downloadResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.warn(`Skipping unusable reference image ${index + 1}:`, result.reason);
      return;
    }

    if (totalBytes + result.value.byteLength > MAX_INLINE_REFERENCE_BYTES) {
      console.warn(`Skipping reference image ${index + 1}: inline image budget reached`);
      return;
    }

    totalBytes += result.value.byteLength;
    images.push(result.value);
    sourceIndexes.push(index);
  });

  if (images.length === 0) {
    throw new Error('None of the product images could be read. Please retry the link or upload a clear JPG, PNG, or WebP image.');
  }

  return { images, sourceIndexes, totalBytes };
}

export async function analyzeProductIdentity(referenceImages: string[]): Promise<ProductIdentityAnalysis> {
  const { images, sourceIndexes } = await loadPreparedReferences(referenceImages.slice(0, 6));
  const parts: GeminiPart[] = [{
    text: `Act as a forensic packaging and product-identity analyst. Inspect every supplied reference, determine which single image gives the clearest, largest, most front-facing and least-obstructed view of the actual product, then return a concise PRODUCT IDENTITY MANIFEST for another image model.

The first line must be exactly CANONICAL_REFERENCE_INDEX: N, where N is the one-based reference number you selected. Prefer a clean product-facing image over a lifestyle image. Do not automatically select image 1.

Include:
1. Exact package/object silhouette, dimensions and front-facing orientation.
2. Exact material, finish, seams, closures and color fields.
3. Logo geometry and exact position.
4. Every legible word, number and symbol transcribed exactly with capitalization and line order. Write [unreadable] instead of guessing.
5. Label blocks, illustrations, certification marks and their relative positions.
6. A short list of forbidden changes that would make it a different product.

Do not propose a campaign scene. Do not improve or rewrite copy. Keep the response below 2,500 characters.`,
  }];

  images.forEach((image, index) => {
    parts.push(
      { text: `REFERENCE IMAGE ${index + 1}:` },
      { inlineData: { mimeType: image.mimeType, data: image.data } }
    );
  });

  const { response, providerModel } = await requestGeminiText(
    parts,
    {
      temperature: 0.1,
    },
    'Product identity analysis'
  );

  const analysisText = response.data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
    .join('\n')
    .trim();

  if (!analysisText) throw new Error('Product identity analysis returned no usable result.');

  const selectedReference = Number(
    analysisText.match(/CANONICAL_REFERENCE_INDEX\s*:\s*(\d+)/i)?.[1]
  );
  const selectedPreparedIndex = Number.isInteger(selectedReference)
    ? Math.max(0, Math.min(images.length - 1, selectedReference - 1))
    : 0;
  const canonicalReferenceIndex = sourceIndexes[selectedPreparedIndex] ?? 0;
  const manifest = analysisText
    .replace(/^\s*CANONICAL_REFERENCE_INDEX\s*:\s*\d+\s*/i, '')
    .trim();

  const usageMetadata = response.data.usageMetadata;
  const inputTokens = Number(usageMetadata?.promptTokenCount) || 0;
  const outputTokens = Number(usageMetadata?.candidatesTokenCount) || 0;

  return {
    manifest: manifest.slice(0, 3200),
    canonicalReferenceIndex,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: Number(usageMetadata?.totalTokenCount) || inputTokens + outputTokens,
      providerModel,
    },
  };
}

export async function validateProductIdentity(
  canonicalImageUrl: string,
  generatedImageUrl: string,
  identityManifest: string,
  options: { overlayTextExpected?: boolean } = {}
): Promise<ProductIdentityValidation> {
  const { images } = await loadPreparedReferences([canonicalImageUrl, generatedImageUrl]);
  if (images.length !== 2) {
    throw new Error('Could not load both images for product identity verification.');
  }

  const parts: GeminiPart[] = [
    {
      text: `You are a strict visual quality-control inspector. Compare the generated campaign image against the canonical product image. Ignore the scene, person, props, scale, lighting, and background. Inspect only the physical product and its printed packaging.

The generated product passes only when all of these remain faithful:
- every visible brand word, product word, number, symbol, and capitalization;
- logo geometry, label layout, illustration, certification marks, and color fields;
- package silhouette, proportions, seams, closure, material, and product count.

${options.overlayTextExpected ? 'The generated image is a paid-social ad and is expected to contain headline or benefit text set in the scene, outside the product. Ignore that overlay text entirely; judge only text printed on the physical product.\n\n' : ''}Reject invented wording, missing wording, approximate logos, redesigned labels, changed illustrations, changed package color, or a generic substitute. Slight perspective or lighting changes are acceptable only when identity remains unmistakably the same.

Identity manifest:
${identityManifest.slice(0, 3200)}

For packagingTextExact, inspect the visible brand name, product name, variant name, prominent numbers, and prominent symbols. Tiny regulatory or ingredient copy that is genuinely too small to resolve may be treated as unreadable rather than changed. Still reject any clearly invented, misspelled, substituted, or rearranged prominent copy.

Return JSON only with this exact shape, where score is an integer from 0 to 100 (100 = pixel-faithful product, 85+ = identity unmistakably the same, below 60 = a different or altered product):
{"packagingTextExact":true,"logoExact":true,"artworkLayoutExact":true,"geometryExact":true,"score":0,"reason":"brief factual reason"}`,
    },
    { text: 'CANONICAL PRODUCT:' },
    { inlineData: { mimeType: images[0].mimeType, data: images[0].data } },
    { text: 'GENERATED CAMPAIGN IMAGE:' },
    { inlineData: { mimeType: images[1].mimeType, data: images[1].data } },
  ];

  const { response, providerModel } = await requestGeminiText(
    parts,
    {
      temperature: 0,
    },
    'Product identity verification'
  );

  const raw = response.data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((text): text is string => typeof text === 'string')
    .join('')
    .trim();
  if (!raw) throw new Error('Product identity verification returned no result.');

  const withoutFences = raw.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
  const jsonStart = withoutFences.indexOf('{');
  const jsonEnd = withoutFences.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    throw new Error('Product identity verification returned malformed JSON.');
  }
  const parsed = JSON.parse(withoutFences.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
  const rawScore = Number(parsed.score) || 0;
  // Models sometimes answer on a 0-10 scale despite the instruction; normalise to 0-100.
  const score = Math.max(0, Math.min(100, rawScore > 0 && rawScore <= 10 && Number.isInteger(rawScore) ? rawScore * 10 : rawScore));
  const checks = {
    packagingTextExact: parsed.packagingTextExact === true,
    logoExact: parsed.logoExact === true,
    artworkLayoutExact: parsed.artworkLayoutExact === true,
    geometryExact: parsed.geometryExact === true,
  };
  const allExact = Object.values(checks).every(Boolean);
  // The model's numeric score is conservative even when it reports no discrepancies,
  // so the four explicit checks decide; the score only guards against contradictions.
  const passed = (allExact && score >= 60) || score >= 85;
  const usageMetadata = response.data.usageMetadata;
  const inputTokens = Number(usageMetadata?.promptTokenCount) || 0;
  const outputTokens = Number(usageMetadata?.candidatesTokenCount) || 0;

  return {
    passed,
    score,
    checks,
    reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 500) : 'Identity mismatch detected.',
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: Number(usageMetadata?.totalTokenCount) || inputTokens + outputTokens,
      providerModel,
    },
  };
}

export async function generateThumbnail(
  referenceImages: string[],
  prompt?: string,
  model?: string,
  aspectRatio?: string,
  resolution?: string,
  referencePolicy: 'balanced' | 'product-lock' | 'product-repair' = 'balanced'
): Promise<GeneratedImageData> {
  const apiKey = process.env.GEMINI_API_KEY!;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Please add it to your .env.local file.');
  }

  // Map model IDs to Gemini API model names
  const modelMap: Record<string, string> = {
    'nano-banana-pro': 'gemini-3-pro-image',
  };

  // Map UI aspect ratios to Gemini API format
  // Note: Gemini only supports 16:9, 1:1, 4:3, and 9:16
  const aspectRatioMap: Record<string, string> = {
    '16:9': '16:9',
    '1:1': '1:1',
    '4:3': '4:3',
    '9:16': '9:16',
    '21:9': '16:9', // Fallback to 16:9 for ultrawide
  };

  // Map UI resolutions to Gemini API imageSize format
  // Gemini API accepts: "1K", "2K", "4K" (not pixel dimensions)
  const resolutionMap: Record<string, string> = {
    '4K': '4K',
    '2K': '2K',
    '1080p': '2K',
    '720p': '1K',
  };

  const selectedModel = model || 'nano-banana-pro';
  const geminiModel = modelMap[selectedModel] || 'gemini-3-pro-image';
  const selectedAspectRatio = aspectRatioMap[aspectRatio || '16:9'] || '16:9';
  const selectedResolution = resolutionMap[resolution || '1080p'] || '2K';

  try {
    console.log('🎨 ========================================');
    console.log('🎨 GENERATING THUMBNAIL WITH GEMINI API');
    console.log('🎨 ========================================');
    console.log('📋 Selected Model (UI):', selectedModel);
    console.log('🤖 Actual Gemini Model:', geminiModel);
    console.log('📐 Aspect Ratio (UI):', aspectRatio);
    console.log('📐 Aspect Ratio (API):', selectedAspectRatio);
    console.log('🎬 Resolution (UI):', resolution);
    console.log('🎬 Resolution (API):', selectedResolution);
    console.log('🖼️  Input images count:', referenceImages.length);
    
    // Validate aspect ratio
    const validAspectRatios = ['16:9', '1:1', '4:3', '9:16'];
    if (!validAspectRatios.includes(selectedAspectRatio)) {
      console.warn('⚠️  Invalid aspect ratio detected:', selectedAspectRatio, '- falling back to 16:9');
    }
    
    console.log('🎨 ========================================');
    
    if (!referenceImages.length) {
      throw new Error('At least one image URL is required');
    }

    const { images: downloadedImages, totalBytes: inlineReferenceBytes } =
      await loadPreparedReferences(referenceImages);
    const fullPrompt = prompt || '';

    const parts: GeminiPart[] = referencePolicy === 'product-lock' || referencePolicy === 'product-repair'
      ? [{
          text: referencePolicy === 'product-repair'
            ? 'REPAIR PROTOCOL: Image 1 is the PRIMARY CANONICAL PRODUCT and the immutable identity source. Image 2 is a generated campaign composition whose scene may be retained, but whose product failed identity review. Replace only the incorrect product with a faithful copy of Image 1; never blend their packaging.'
            : 'REFERENCE PROTOCOL: Image 1 is the PRIMARY CANONICAL PRODUCT and overrides every other image if details conflict. Images 2 onward are supporting angles of the same product. They are evidence for fidelity, not separate products and not style references.',
        }]
      : [{ text: fullPrompt }];
    downloadedImages.forEach((image, index) => {
      const label = referencePolicy === 'product-repair'
        ? index === 0
          ? 'REFERENCE IMAGE 1 - PRIMARY CANONICAL PRODUCT. Its packaging pixels, shape, logo and artwork are the required final identity.'
          : 'REFERENCE IMAGE 2 - REJECTED CAMPAIGN COMPOSITION. Preserve only its scene and art direction; discard and replace its incorrect product rendering.'
        : referencePolicy === 'product-lock'
        ? index === 0
          ? 'REFERENCE IMAGE 1 - PRIMARY CANONICAL PRODUCT IDENTITY. Copy this exact real product; do not redesign or substitute it.'
          : `REFERENCE IMAGE ${index + 1} - SUPPORTING VIEW ONLY. Use it to verify the same product's geometry, material, scale, color, construction, and artwork placement.`
        : `Reference image ${index + 1} of ${downloadedImages.length}:`;
      parts.push(
        { text: label },
        {
          inlineData: {
            mimeType: image.mimeType,
            data: image.data,
          },
        }
      );
    });
    if (referencePolicy === 'product-lock' || referencePolicy === 'product-repair') {
      parts.push(
        { text: fullPrompt },
        { text: referencePolicy === 'product-repair'
          ? 'FINAL REPAIR CHECK: keep the campaign scene, but ensure the visible product is unmistakably and faithfully the canonical product from image 1. Do not retain any invented package text from image 2.'
          : 'FINAL IDENTITY REMINDER: the set, model, pose, and lighting may change; the product from reference image 1 may not change.' }
      );
    }

    const requestData: GeminiRequest = {
      contents: [{
        parts
      }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: selectedAspectRatio,
          imageSize: selectedResolution
        }
      }
    };

    console.log(`📦 Prepared ${downloadedImages.length} references (${(inlineReferenceBytes / 1024 / 1024).toFixed(1)} MB)`);
    console.log('📤 Sending request to Gemini API...');
    console.log('📋 Request config:', JSON.stringify(requestData.generationConfig, null, 2));
    
    // Retry logic for transient errors
    let lastError;
    const maxAttempts = 2;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`🔄 Retry attempt ${attempt}/${maxAttempts}...`);
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
        
        const response = await axios.post<GeminiResponse>(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
          requestData,
          {
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            timeout: GEMINI_REQUEST_TIMEOUT_MS,
          }
        );

        console.log('✅ Received response from Gemini');

        // Extract generated image from response
        const candidate = response.data.candidates?.[0];
        if (!candidate) {
          throw new Error('No response from Gemini API');
        }

        const parts = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];
        const imageParts = parts.filter(part => part.inlineData?.data);
        if (imageParts.length === 0) {
          const textResponse = parts
            .map(part => part.text)
            .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
            .join(' ');
          const reason = candidate.finishReason ? ` (${candidate.finishReason})` : '';
          if (candidate.finishReason === 'IMAGE_SAFETY') {
            throw new Error('Gemini safety filters blocked this image request. Try rephrasing the prompt or removing sensitive celebrity, child, or harm-related wording.');
          }
          throw new Error(textResponse || `No image generated by Gemini API${reason}`);
        }

        // Convert base64 images to data URLs
        const generatedImages = imageParts.map(part => {
          const base64Data = part.inlineData!.data;
          const mimeType = part.inlineData!.mimeType || 'image/png';
          return `data:${mimeType};base64,${base64Data}`;
        });
        const usageMetadata = response.data.usageMetadata;
        const inputTokens = Number(usageMetadata?.promptTokenCount) || 0;
        const outputTokens = Number(usageMetadata?.candidatesTokenCount) || 0;
        const totalTokens = Number(usageMetadata?.totalTokenCount) || inputTokens + outputTokens;

        console.log(`🎉 Generated ${generatedImages.length} image(s)`);
        
        return {
          images: generatedImages,
          usage: {
            inputTokens,
            outputTokens,
            totalTokens,
            imageCount: generatedImages.length,
            providerModel: geminiModel,
          },
        };
        
      } catch (error) {
        lastError = error;
        
        if (axios.isAxiosError(error)) {
          const statusCode = error.response?.status;
          const errorMessage = error.response?.data?.error?.message || 
                              error.response?.data?.message || 
                              error.message;
          
          // Don't retry on client errors (400, 401, 403, 404)
          if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
            console.error('❌ Client error, not retrying:', statusCode, errorMessage);
            break;
          }
          
          // Retry on 500, 503, 429, or network errors
          if (attempt < maxAttempts) {
            console.warn(`⚠️  Attempt ${attempt} failed:`, errorMessage);
            continue;
          }
        }
        
        // Last attempt failed
        break;
      }
    }
    
    // All retries failed, throw the last error
    if (lastError) {
      throw lastError;
    }
    
    // Should never reach here, but TypeScript needs it
    throw new Error('Generation failed after all retries');
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.error?.message || 
                          error.response?.data?.message || 
                          error.message;
      const statusCode = error.response?.status;
      
      console.error('❌ Gemini API Error:', {
        status: statusCode,
        message: errorMessage,
        fullError: error.response?.data,
        aspectRatio: selectedAspectRatio,
        resolution: selectedResolution,
        model: geminiModel
      });
      
      if (statusCode === 401 || statusCode === 403) {
        throw new Error('Invalid Gemini API key. Please check your GEMINI_API_KEY in .env.local');
      }
      
      if (statusCode === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }
      
      if (statusCode === 400) {
        // Check if it's an aspect ratio issue
        if (errorMessage.toLowerCase().includes('aspect') || errorMessage.toLowerCase().includes('ratio')) {
          throw new Error(`Invalid aspect ratio (${aspectRatio}). Try 16:9, 1:1, 4:3, or 9:16.`);
        }
        throw new Error(`Invalid request: ${errorMessage}`);
      }
      
      if (statusCode === 500 || statusCode === 503) {
        throw new Error('Gemini API is temporarily unavailable. Please try again in a moment.');
      }
      
      throw new Error(`Gemini API error: ${errorMessage}`);
    }
    console.error('❌ Unexpected error:', error);
    throw error;
  }
}

async function getPreparedReferenceImage(imageUrl: string): Promise<DownloadedImage> {
  const now = Date.now();
  for (const [key, entry] of preparedReferenceCache) {
    if (now - entry.createdAt > REFERENCE_CACHE_TTL_MS) preparedReferenceCache.delete(key);
  }

  const cached = preparedReferenceCache.get(imageUrl);
  if (cached) return cached.promise;

  while (preparedReferenceCache.size >= MAX_REFERENCE_CACHE_ENTRIES) {
    const oldestKey = preparedReferenceCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    preparedReferenceCache.delete(oldestKey);
  }

  const promise = urlToBase64(imageUrl).catch((error) => {
    preparedReferenceCache.delete(imageUrl);
    throw error;
  });
  preparedReferenceCache.set(imageUrl, { createdAt: now, promise });
  return promise;
}

async function urlToBase64(imageUrl: string): Promise<DownloadedImage> {
  try {
    // Handle relative URLs (convert to absolute)
    let absoluteUrl = imageUrl;
    if (imageUrl.startsWith('/')) {
      // Get the base URL from environment
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      absoluteUrl = `${baseUrl}${imageUrl}`;
      console.log('📍 Converting relative URL to absolute:', imageUrl, '->', absoluteUrl);
    }
    assertDownloadableImageUrl(absoluteUrl);
    
    const response = await axios.get<ArrayBuffer>(absoluteUrl, {
      responseType: 'arraybuffer',
      timeout: IMAGE_DOWNLOAD_TIMEOUT_MS,
      maxContentLength: MAX_REFERENCE_IMAGE_BYTES,
      maxBodyLength: MAX_REFERENCE_IMAGE_BYTES,
      headers: {
        Accept: 'image/jpeg,image/png,image/webp,*/*;q=0.5',
        'User-Agent': 'Mozilla/5.0 (compatible; Visicraft/1.0; +https://visicraft.in)',
      },
    });
    const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const bytes = Buffer.from(response.data);
    if (bytes.byteLength < 64) {
      throw new Error('The image response was empty');
    }
    const mimeType = detectImageMimeType(bytes, contentType, absoluteUrl);
    if (!mimeType) {
      throw new Error(`Unsupported or invalid image response (${contentType || 'unknown type'})`);
    }
    const preparedBytes = await prepareReferenceImage(bytes);
    return {
      data: preparedBytes.toString('base64'),
      mimeType: 'image/webp',
      byteLength: preparedBytes.byteLength,
    };
  } catch (error) {
    console.error('Failed to download image:', imageUrl);
    throw new Error(`Failed to download image: ${error instanceof Error ? error.message : 'Invalid URL'}`);
  }
}

async function prepareReferenceImage(source: Buffer): Promise<Buffer> {
  const attempts = [
    { edge: 2560, quality: 93 },
    { edge: 2304, quality: 90 },
    { edge: 2048, quality: 88 },
    { edge: 1792, quality: 84 },
  ];

  let prepared: Buffer | null = null;
  for (const attempt of attempts) {
    prepared = await sharp(source, { failOn: 'none' })
      .rotate()
      .resize({
        width: attempt.edge,
        height: attempt.edge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: attempt.quality, smartSubsample: true, effort: 4 })
      .toBuffer();

    if (prepared.byteLength <= MAX_PREPARED_IMAGE_BYTES) return prepared;
  }

  if (!prepared) throw new Error('Could not prepare reference image');
  return prepared;
}

function detectImageMimeType(
  bytes: Buffer,
  contentType: string,
  imageUrl: string
): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }

  const pathname = new URL(imageUrl).pathname.toLowerCase();
  console.warn('Image bytes did not match a supported format:', { contentType, pathname });
  return null;
}

function assertDownloadableImageUrl(imageUrl: string): void {
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    throw new Error('Invalid image URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Invalid image URL: only HTTP and HTTPS URLs are supported');
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '0.0.0.0' ||
    hostname.startsWith('127.') ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^169\.254\./.test(hostname)
  ) {
    throw new Error('Invalid image URL: private network addresses are not allowed');
  }
}

export async function imageToBase64(imageUrl: string): Promise<string> {
  const image = await urlToBase64(imageUrl);
  const jpegBytes = await sharp(Buffer.from(image.data, 'base64'), { failOn: 'none' })
    .rotate()
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toBuffer();
  return `data:image/jpeg;base64,${jpegBytes.toString('base64')}`;
}
