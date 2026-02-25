import { getCreditCost } from '@/lib/credits/calculator';

/** Shared validation - used by Create, Run This Node, and Run Selected */
export function validateGenerateNode(
  referenceImageUrl: string | null,
  sourceImageUrl: string | null,
  promptText: string | null
): void {
  if (!referenceImageUrl && !sourceImageUrl) {
    throw new Error('Upload at least one image to generate');
  }
  const hasOnlyOne =
    (!!referenceImageUrl && !sourceImageUrl) ||
    (!referenceImageUrl && !!sourceImageUrl);
  if (hasOnlyOne && (!promptText || !String(promptText).trim())) {
    throw new Error('Please provide a prompt when using only one image');
  }
}

export interface GenerateNodeParams {
  nodeId: string;
  referenceImageUrl: string | null;
  sourceImageUrl: string | null;
  promptText: string | null;
  model: string;
  aspectRatio: string;
  resolution: string;
  updateNodeData: (nodeId: string, data: Record<string, any>) => void;
  credits?: number;
  deductCredits?: (amount: number) => Promise<boolean>;
  addCredits?: (amount: number) => Promise<boolean>;
  refreshCredits?: () => Promise<void>;
}

/**
 * Single source of truth for generation logic.
 * Does NOT show toasts — callers handle all user-facing messages.
 */
export async function executeGeneration(params: GenerateNodeParams): Promise<string> {
  const {
    nodeId,
    referenceImageUrl,
    sourceImageUrl,
    promptText,
    model,
    aspectRatio,
    resolution,
    updateNodeData,
    credits,
    deductCredits,
    addCredits,
    refreshCredits,
  } = params;

  const creditCost = deductCredits ? getCreditCost(model, resolution) : 0;

  // --- Validation (same order for all three flows) ---

  if (deductCredits && credits !== undefined && credits < creditCost) {
    throw new Error(`Insufficient credits! Need ${creditCost}, have ${credits}`);
  }

  validateGenerateNode(referenceImageUrl, sourceImageUrl, promptText);

  // --- Credits ---

  updateNodeData(nodeId, { status: 'processing' });

  if (deductCredits) {
    const ok = await deductCredits(creditCost);
    if (!ok) {
      updateNodeData(nodeId, { status: 'idle' });
      throw new Error(`Insufficient credits! Need ${creditCost}, have ${credits}`);
    }
  }

  // --- Generate ---

  try {
    const requestBody: any = {
      prompt: promptText || '',
      model,
      aspectRatio,
      resolution,
    };

    if (referenceImageUrl && sourceImageUrl) {
      requestBody.referenceImage = referenceImageUrl;
      requestBody.sourceImages = [sourceImageUrl];
    } else if (sourceImageUrl) {
      requestBody.referenceImage = sourceImageUrl;
      requestBody.sourceImages = [sourceImageUrl];
    } else if (referenceImageUrl) {
      requestBody.referenceImage = referenceImageUrl;
      requestBody.sourceImages = [referenceImageUrl];
    }

    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(`Server returned status ${response.status} with invalid JSON`);
    }

    if (!response.ok) {
      throw new Error(result?.error || 'Generation failed');
    }

    const generatedImageUrl = result.images?.[0];
    if (!generatedImageUrl) {
      throw new Error('No image returned from API');
    }

    updateNodeData(nodeId, { generatedImage: generatedImageUrl, status: 'complete' });

    if (refreshCredits) await refreshCredits();

    return generatedImageUrl;
  } catch (error) {
    console.error('❌ Generation error:', error);

    if (addCredits && refreshCredits) {
      await addCredits(creditCost);
      await refreshCredits();
    }

    updateNodeData(nodeId, { status: 'error' });
    throw error;
  }
}
