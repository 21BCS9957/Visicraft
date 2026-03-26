const VIDEO_CREDIT_COST = 120;

export function validateVideoGenerateNode(
  referenceImageUrls: string[],
  promptText: string | null
): void {
  if (referenceImageUrls.length === 0) {
    throw new Error('Connect at least one reference image to generate video');
  }
  if (!promptText || !String(promptText).trim()) {
    throw new Error('A prompt is required for video generation');
  }
}

export interface VideoGenerateNodeParams {
  nodeId: string;
  referenceImageUrls: string[];
  promptText: string | null;
  model: string;
  aspectRatio: string;
  duration: string;
  resolution: string;
  updateNodeData: (nodeId: string, data: Record<string, any>) => void;
  credits?: number;
  deductCredits?: (amount: number) => Promise<boolean>;
  addCredits?: (amount: number) => Promise<boolean>;
  refreshCredits?: () => Promise<void>;
}

/**
 * Single source of truth for video generation logic.
 * Calls /api/img2vid then polls /api/video-status until done.
 * Does NOT show toasts — callers handle all user-facing messages.
 */
export async function executeVideoGeneration(params: VideoGenerateNodeParams): Promise<string> {
  const {
    nodeId,
    referenceImageUrls,
    promptText,
    model,
    aspectRatio,
    duration,
    resolution,
    updateNodeData,
    credits,
    deductCredits,
    addCredits,
    refreshCredits,
  } = params;

  const creditCost = deductCredits ? VIDEO_CREDIT_COST : 0;

  if (deductCredits && credits !== undefined && credits < creditCost) {
    throw new Error(`Insufficient credits! Need ${creditCost}, have ${credits}`);
  }

  validateVideoGenerateNode(referenceImageUrls, promptText);

  updateNodeData(nodeId, { status: 'processing', videoProgress: 0 });

  if (deductCredits) {
    const ok = await deductCredits(creditCost);
    if (!ok) {
      updateNodeData(nodeId, { status: 'idle', videoProgress: 0 });
      throw new Error(`Insufficient credits! Need ${creditCost}, have ${credits}`);
    }
  }

  try {
    const response = await fetch('/api/img2vid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: referenceImageUrls[0],
        prompt: promptText || '',
        model,
        aspectRatio,
        duration,
        resolution,
      }),
    });

    let result: { error?: string; operationId?: string; images?: string[] };
    try {
      result = await response.json();
    } catch {
      throw new Error(`Server returned status ${response.status} with invalid JSON`);
    }

    if (!response.ok) {
      throw new Error(result?.error || 'Video generation failed');
    }

    let videoUrl: string | undefined;

    if (result.operationId) {
      updateNodeData(nodeId, { videoProgress: 5 });

      let isDone = false;

      while (!isDone) {
        await new Promise((r) => setTimeout(r, 10000));

        const statusRes = await fetch('/api/video-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationId: result.operationId }),
        });

        if (!statusRes.ok) continue;

        const statusData = await statusRes.json();

        if (statusData.error) {
          throw new Error(statusData.error);
        }

        if (statusData.done) {
          isDone = true;
          videoUrl = statusData.url || undefined;
          updateNodeData(nodeId, { videoProgress: 100 });
        } else {
          const p = typeof statusData.progress === 'number' && statusData.progress > 0
            ? statusData.progress : 15;
          updateNodeData(nodeId, { videoProgress: p });
        }
      }
    } else if (result.images?.[0]) {
      videoUrl = result.images[0];
    }

    if (!videoUrl) {
      throw new Error('No video returned from API');
    }

    updateNodeData(nodeId, { generatedVideo: videoUrl, status: 'complete', videoProgress: 100 });

    if (refreshCredits) await refreshCredits();

    return videoUrl;
  } catch (error) {
    console.error('❌ Video generation error:', error);

    if (addCredits && refreshCredits) {
      await addCredits(creditCost);
      await refreshCredits();
    }

    updateNodeData(nodeId, { status: 'error', videoProgress: 0 });
    throw error;
  }
}
