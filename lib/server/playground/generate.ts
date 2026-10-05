import 'server-only';

import type { GeneratedImage } from './errors';
import { generateGeminiImage } from './gemini';
import { generateOpenAiImage } from './openai';
import { playgroundModel, type ImageQuality, type PlaygroundModelId, type PlaygroundSize, type ThinkingLevel } from '@/lib/playground/models';
import type { ReferenceSnapshot } from '@/lib/playground/types';

/** One Playground image from the model's provider (Gemini or OpenAI). */
export async function generatePlaygroundImage(options: {
  model: PlaygroundModelId;
  size: PlaygroundSize;
  aspectRatio: string;
  thinking: ThinkingLevel | null;
  /** OpenAI models only. */
  quality?: ImageQuality | null;
  brief: string;
  references: ReferenceSnapshot[];
  prompt: string;
  /** Epoch ms after which no new attempt may start. */
  deadline: number;
}): Promise<GeneratedImage> {
  if (playgroundModel(options.model).provider === 'openai') {
    return generateOpenAiImage({ ...options, quality: options.quality ?? null });
  }
  return generateGeminiImage(options);
}
