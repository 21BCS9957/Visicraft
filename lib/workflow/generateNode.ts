import { getCreditCost } from '@/lib/credits/calculator';

/** Shared validation - used by Create, Run This Node, and Run Selected */
export function validateGenerateNode(
  referenceImageUrls: string[],
  promptText: string | null
): void {
  if (referenceImageUrls.length === 0) {
    throw new Error('Connect at least one reference image to generate');
  }
  if (referenceImageUrls.length === 1 && (!promptText || !String(promptText).trim())) {
    throw new Error('Please provide a prompt when using a single image');
  }
}

export interface GenerateNodeParams {
  nodeId: string;
  referenceImageUrls: string[];
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
    referenceImageUrls,
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

  if (deductCredits && credits !== undefined && credits < creditCost) {
    throw new Error(`Insufficient credits! Need ${creditCost}, have ${credits}`);
  }

  validateGenerateNode(referenceImageUrls, promptText);

  updateNodeData(nodeId, { status: 'processing' });

  if (deductCredits) {
    const ok = await deductCredits(creditCost);
    if (!ok) {
      updateNodeData(nodeId, { status: 'idle' });
      throw new Error(`Insufficient credits! Need ${creditCost}, have ${credits}`);
    }
  }

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'generate',
        referenceImages: referenceImageUrls,
        prompt: promptText || '',
        model,
        aspectRatio,
        resolution,
      }),
    });

    let result: { error?: string; images?: string[] };
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
