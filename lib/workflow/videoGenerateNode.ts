import {
  getDefaultSeedanceMode,
  getSeedanceCreditCost,
  isSeedanceModel,
  isVideoUrl,
  SEEDANCE_MAX_INPUT_VIDEO_SECONDS,
} from './seedance';

const VIDEO_CREDIT_COST = 120;

export function getVideoGenerationCreditCost(
  model: string,
  resolution: string,
  duration: string | number | undefined,
  inputVideoSeconds = 0
): number {
  return isSeedanceModel(model)
    ? getSeedanceCreditCost(model, resolution, duration, inputVideoSeconds)
    : VIDEO_CREDIT_COST;
}

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
  mode?: string;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
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
    mode,
    updateNodeData,
    credits,
    deductCredits,
    addCredits,
    refreshCredits,
  } = params;

  const seedanceMode = isSeedanceModel(model)
    ? (mode || getDefaultSeedanceMode(referenceImageUrls))
    : undefined;
  const hasSeedanceVideoReference = isSeedanceModel(model) && referenceImageUrls.some(isVideoUrl);
  const creditCost = deductCredits
    ? isSeedanceModel(model)
      ? getVideoGenerationCreditCost(
        model,
        resolution,
        duration,
        hasSeedanceVideoReference ? SEEDANCE_MAX_INPUT_VIDEO_SECONDS : 0
      )
      : getVideoGenerationCreditCost(model, resolution, duration)
    : 0;

  if (deductCredits && credits !== undefined && credits < creditCost) {
    throw new Error(`Insufficient credits! Need ${creditCost}, have ${credits}`);
  }

  if (isSeedanceModel(model)) {
    validateSeedanceVideoNode(referenceImageUrls, promptText, seedanceMode);
  } else {
    validateVideoGenerateNode(referenceImageUrls, promptText);
  }

  updateNodeData(nodeId, { status: 'processing', videoProgress: 0 });

  if (deductCredits) {
    const ok = await deductCredits(creditCost);
    if (!ok) {
      updateNodeData(nodeId, { status: 'idle', videoProgress: 0 });
      throw new Error(`Insufficient credits! Need ${creditCost}, have ${credits}`);
    }
  }

  try {
    const response = await fetch(isSeedanceModel(model) ? '/api/seedance-video' : '/api/img2vid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isSeedanceModel(model)
        ? {
          referenceUrls: referenceImageUrls,
          prompt: promptText || '',
          model,
          mode: seedanceMode,
          aspectRatio,
          duration,
          resolution,
        }
        : {
          imageUrl: referenceImageUrls[0],
          prompt: promptText || '',
          model,
          aspectRatio,
          duration,
          resolution,
        }),
    });

    let result: { error?: string; operationId?: string; taskId?: string; images?: string[]; videoUrl?: string };
    try {
      result = await response.json();
    } catch {
      throw new Error(`Server returned status ${response.status} with invalid JSON`);
    }

    if (!response.ok) {
      throw new Error(result?.error || 'Video generation failed');
    }

    let videoUrl: string | undefined;

    if (result.videoUrl) {
      videoUrl = result.videoUrl;
    } else if (result.taskId) {
      updateNodeData(nodeId, { videoProgress: 5 });

      let isDone = false;

      while (!isDone) {
        await new Promise((r) => setTimeout(r, 5000));

        const statusRes = await fetch('/api/seedance-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: result.taskId }),
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
          updateNodeData(nodeId, { videoProgress: statusData.progress || 25 });
        }
      }
    } else if (result.operationId) {
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

function validateSeedanceVideoNode(
  referenceUrls: string[],
  promptText: string | null,
  mode?: string
): void {
  if (!promptText || !String(promptText).trim()) {
    throw new Error('A prompt is required for Seedance video generation');
  }

  if (mode === 'text_to_video') {
    if (referenceUrls.length > 0) {
      throw new Error('Seedance text-to-video does not accept references. Use Omni Reference or remove connected references.');
    }
    return;
  }

  if (mode === 'first_last_frames') {
    if (referenceUrls.length < 1 || referenceUrls.length > 2) {
      throw new Error('Seedance first/last frames requires 1-2 connected image references.');
    }
    if (referenceUrls.some(isVideoUrl)) {
      throw new Error('Seedance first/last frames only accepts image references.');
    }
    return;
  }

  if (referenceUrls.length < 1 || referenceUrls.length > 12) {
    throw new Error('Seedance omni reference requires 1-12 connected references.');
  }
}
