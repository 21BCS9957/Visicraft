/**
 * Gemini models that write prompts and specs, strongest first. On this key the pro model
 * answered a test prompt in 13.7 s against ~20 s for flash, so it is also the faster one;
 * requestGeminiText falls back to the flash models when it is unavailable.
 */
export const PROMPT_WRITER_MODELS = (process.env.PROMPT_WRITER_MODEL || 'gemini-3.1-pro-preview')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
