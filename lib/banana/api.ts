import axios from 'axios';

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
    imageConfig?: {
      aspectRatio?: string;
      imageSize?: string;
    };
  };
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string;
        };
      }>;
    };
  }>;
}

export async function generateThumbnail(
  referenceImages: string[],
  prompt?: string,
  model?: string,
  aspectRatio?: string,
  resolution?: string
): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY!;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Please add it to your .env.local file.');
  }

  // Map model IDs to Gemini API model names
  const modelMap: Record<string, string> = {
    'nano-banana-pro': 'gemini-3-pro-image-preview',
    'gpt-image': 'gemini-3-pro-image-preview',
    'midjourney': 'gemini-3-pro-image-preview',
    'google-imagen': 'gemini-3-pro-image-preview',
    'flux-2-max': 'gemini-3-pro-image-preview',
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
  const geminiModel = modelMap[selectedModel] || 'gemini-3-pro-image-preview';
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

    const imageBase64List = await Promise.all(referenceImages.map((url) => urlToBase64(url)));
    const fullPrompt = prompt || '';

    const parts: GeminiPart[] = [
      { text: fullPrompt },
      ...imageBase64List.map((data) => ({
        inlineData: { mimeType: 'image/jpeg', data },
      })),
    ];

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

    console.log('📤 Sending request to Gemini API...');
    console.log('📋 Request config:', JSON.stringify(requestData.generationConfig, null, 2));
    
    // Retry logic for transient errors
    let lastError;
    const maxRetries = 2;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`🔄 Retry attempt ${attempt}/${maxRetries}...`);
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
            timeout: 120000, // 2 minutes timeout
          }
        );

        console.log('✅ Received response from Gemini');

        // Extract generated image from response
        const candidate = response.data.candidates?.[0];
        if (!candidate) {
          throw new Error('No response from Gemini API');
        }

        const imageParts = candidate.content.parts.filter(part => part.inlineData);
        if (imageParts.length === 0) {
          throw new Error('No image generated by Gemini API');
        }

        // Convert base64 images to data URLs
        const generatedImages = imageParts.map(part => {
          const base64Data = part.inlineData!.data;
          const mimeType = part.inlineData!.mimeType;
          return `data:${mimeType};base64,${base64Data}`;
        });

        console.log(`🎉 Generated ${generatedImages.length} image(s)`);
        
        return generatedImages;
        
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
          if (attempt < maxRetries) {
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

async function urlToBase64(imageUrl: string): Promise<string> {
  try {
    // Handle relative URLs (convert to absolute)
    let absoluteUrl = imageUrl;
    if (imageUrl.startsWith('/')) {
      // Get the base URL from environment
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      absoluteUrl = `${baseUrl}${imageUrl}`;
      console.log('📍 Converting relative URL to absolute:', imageUrl, '->', absoluteUrl);
    }
    
    const response = await axios.get(absoluteUrl, { 
      responseType: 'arraybuffer',
      timeout: 30000
    });
    const base64 = Buffer.from(response.data, 'binary').toString('base64');
    return base64;
  } catch (error) {
    console.error('Failed to download image:', imageUrl);
    throw new Error(`Failed to download image: ${error instanceof Error ? error.message : 'Invalid URL'}`);
  }
}

export async function imageToBase64(imageUrl: string): Promise<string> {
  const base64 = await urlToBase64(imageUrl);
  return `data:image/jpeg;base64,${base64}`;
}
