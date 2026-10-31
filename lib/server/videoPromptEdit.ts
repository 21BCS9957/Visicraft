import 'server-only';

import { jsonSchema as js, partialJsonStrings, requestClaudeJson } from '@/lib/server/claude';
import type { ProviderUsage } from '@/lib/server/usage';
import { GUIDELINES_RULE } from '@/lib/server/videoWriter';
import { promptSeconds, retimePrompt } from '@/lib/video/shared';

/**
 * "Change it in your words" on the approval and new-draft screens: the user describes a change
 * in a few words ("the girl dances Bharatanatyam in the courtyard"), and Claude rewrites the
 * whole video prompt to carry it, polished, keeping its structure, the product and the images.
 * Text only, low effort and fast mode (when the account has it), and shown live as it is written.
 */

const SYSTEM = 'You edit the exact prompt a video model receives for a product video ad made for an Indian D2C brand. The user describes a change in a few words (sometimes dictated, sometimes in Hinglish). You rewrite the whole prompt so the change is carried everywhere it matters, polished and specific, and leave everything else exactly as it is.';

const SCHEMA = js.obj({ prompt: js.str, summary: js.str, seconds: js.int });

export async function rewriteVideoPrompt(options: {
  prompt: string;
  instruction: string;
  /** How many reference images the video has (Image 1..N). */
  images: number;
  /** The video's length now, and the lengths its engine renders (the change may ask for another). */
  seconds: number;
  allowedSeconds: number[];
  /** The project's guidelines (Markdown), followed like the writer that planned the video. */
  guidelines?: string;
  /** The new prompt as far as it has been written. Starts over if the request is retried. */
  onPrompt?: (soFar: string) => void;
}): Promise<{ prompt: string; summary: string; seconds: number; usage: ProviderUsage; fast: boolean }> {
  const current = options.prompt.trim();
  const json = current.startsWith('{');
  const seconds = options.seconds;
  const allowed = options.allowedSeconds.length ? options.allowedSeconds : [seconds];
  const guidelines = options.guidelines?.trim();
  const shotLines = (text: string) => (text.match(/^Shot \d+ \(/gm) ?? []).length;
  const request = `THE CURRENT PROMPT (between the lines):
---
${current}
---

THE CHANGE THE USER WANTS: ${options.instruction.trim().slice(0, 600)}

THE LENGTH: the video is ${seconds} seconds long. Keep that unless the change asks for another length; then use the nearest of ${allowed.join(', ')} seconds. ${json ? 'Update format.duration_s and the timeline to match' : 'The shots cover 0 to that many seconds end to end (each shot 1.5-5 seconds; add or merge shots when the length changes) and the first line says "N-second"'}. Return the length in "seconds".
${guidelines ? `\n${GUIDELINES_RULE}\n` : ''}
How to rewrite it:
- ${json
    ? 'The prompt is JSON: return valid JSON with the same keys and structure, with the change carried into every field it touches.'
    : 'Keep the same structure, line order and markup: the first line (length, look, who appears), the product paragraph, "Setting:", one line per shot written exactly like "Shot N (start-end s): Framing. Action (Image k). Camera move." (framing and camera move one sentence each), "Sound:" (music inside ( ), sound effects inside < >, a spoken line inside { } after "The presenter says, in English:"), and "Constraints:".'}
- Make the change completely: update every shot, the cast, the setting, the sound and the constraints it touches, so the film stays consistent (a dance needs a setting with room for it, camera moves that follow the movement, and music that suits it).
- Concrete, physical, filmable actions with their speed and size; exactly one camera move per shot; realistic, never exaggerated.
- Never change the product: its description, colours, pattern, printed text and the rule to keep it exactly as in the reference images stay word for word, and it stays clearly visible in the shots that show it.
- Keep each shot's "(Image k)" reference unless the change is about the images (there ${options.images === 1 ? 'is 1 image' : `are ${options.images} images`}; never cite a higher number).
- People: real-looking Indian adults, never a real or famous person. A dance or performance is tasteful and accurate to the form (name real steps, mudras or poses where it helps).
- Music is always original: never a named or famous song; if the user asks for one, describe an original track in that style.
- No on-screen text, subtitles or logos unless the change asks for them.
- At most 5,500 characters.
- If the change is unclear, make the closest sensible version and say so in "summary".

Return JSON: "prompt" is the full new prompt; "summary" is one short sentence (at most 20 words) saying what changed; "seconds" is its length.`;

  const { json: parsed, usage, fast } = await requestClaudeJson<{ prompt?: unknown; summary?: unknown; seconds?: unknown }>({
    system: SYSTEM,
    context: guidelines ? [`PROJECT GUIDELINES (Markdown):\n\n${guidelines.slice(0, 50_000)}`] : [],
    prompt: request,
    schema: SCHEMA,
    effort: 'low',
    fast: true,
    maxTokens: 8000,
    timeoutMs: 60_000,
    onText: options.onPrompt && ((raw) => options.onPrompt?.(partialJsonStrings(raw).prompt ?? '')),
  });
  const written = typeof parsed.prompt === 'string' ? parsed.prompt.trim().slice(0, 6000) : '';
  if (!written) throw new Error('The rewrite came back empty. Try again.');
  if (!json && shotLines(current) >= 2 && shotLines(written) < 2) throw new Error('The rewrite lost the shot list. Try again, or describe the change differently.');
  // A length the engine renders, with the shots timed to it.
  const asked = Number(parsed.seconds);
  const length = allowed.includes(asked) ? asked : seconds;
  const timed = promptSeconds(written);
  const prompt = timed && timed !== length ? retimePrompt(written, length) : written;
  const summary = typeof parsed.summary === 'string' ? parsed.summary.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  return { prompt, summary: summary || 'Prompt rewritten with your change.', seconds: length, usage, fast };
}

const ENHANCE_SYSTEM = 'You write the exact prompt a video model receives, for short ads made by an Indian D2C agency. The user gives a rough idea in a few words (sometimes Hinglish) and maybe some images. You turn it into one clear, filmable, shot-by-shot prompt that the engine follows well.';

const ENHANCE_SCHEMA = js.obj({ prompt: js.str, summary: js.str });

/**
 * "Improve prompt" in the Create tab: a short idea (and the images the video uses) becomes a
 * timed, shot-by-shot prompt for the engine picked, at the chosen length and shape. Claude sees
 * the images; the result goes back into the prompt box for the user to read before Generate.
 */
export async function enhanceVideoPrompt(options: {
  idea: string;
  engine: 'seedance' | 'veo';
  /** How the images are used: the clip starts from Image 1, or is built from Image 1..N. */
  role: 'first_frame' | 'reference' | 'none';
  images: Array<{ url: string }>;
  seconds: number;
  orientation: string;
  /** A motion preset's line ("Slow push-in…"), kept in the shots. */
  motion?: string;
}): Promise<{ prompt: string; summary: string; usage: ProviderUsage; fast: boolean }> {
  const count = options.images.length;
  const imageRule = options.role === 'first_frame'
    ? 'The video starts exactly on Image 1 (the first frame): describe what happens from there, keep everything in it (product, people, setting) consistent, and never ask for a cut away from it in the first shot.'
    : options.role === 'reference'
      ? `The video is built from ${count === 1 ? 'Image 1' : `Images 1–${count}`}: cite them as "(Image k)" in the shots where each appears, and keep each product exactly as in its image.`
      : 'There are no images: describe the product, people and setting fully in words.';
  const request = `THE IDEA: ${options.idea.trim().slice(0, 1200)}
${options.motion ? `\nCAMERA / MOTION STYLE TO USE: ${options.motion}\n` : ''}
THE VIDEO: ${options.seconds} seconds, ${options.orientation}, made with ${options.engine === 'veo' ? 'Google Veo' : 'Seedance'}.
${count ? `IMAGES: ${count} (shown above, in order as Image 1${count > 1 ? `…Image ${count}` : ''}).` : ''}
${imageRule}

Write the prompt like this (plain text, these lines in this order):
- First line: "${options.seconds}-second ${options.orientation} video:" plus the look and who appears.
- One short paragraph on the product (from the images when there are any: exact colours, pattern, printed text) and the rule to keep it exactly as shown.
- "Setting:" one sentence.
- One line per shot: "Shot N (start-end s): Framing. Action. Camera move." Shots cover 0 to ${options.seconds} seconds end to end, each 1.5-5 seconds, exactly one camera move each.
- "Sound:" original music inside ( ), sound effects inside < >, and a spoken line inside { } only if the idea asks for speech.
- "Constraints:" what must not happen (no on-screen text, subtitles or logos unless asked; no warping of the product; no extra products).

Rules: concrete, physical, filmable actions with their speed; realistic, never exaggerated; people are real-looking Indian adults, never a real or famous person; music is always original, never a named song. Keep what the user asked for and fill in only what is missing. At most 2,800 characters.

Return JSON: "prompt" is the full prompt; "summary" is one short sentence (at most 16 words) saying what you made of the idea.`;

  const { json: parsed, usage, fast } = await requestClaudeJson<{ prompt?: unknown; summary?: unknown }>({
    system: ENHANCE_SYSTEM,
    images: options.images.slice(0, 9).map((image, index) => ({ url: image.url, label: `Image ${index + 1}` })),
    prompt: request,
    schema: ENHANCE_SCHEMA,
    effort: 'low',
    fast: true,
    maxTokens: 4000,
    timeoutMs: 60_000,
  });
  const written = typeof parsed.prompt === 'string' ? parsed.prompt.trim().slice(0, 3500) : '';
  if (!written) throw new Error('The new prompt came back empty. Try again.');
  const timed = promptSeconds(written);
  const prompt = timed && timed !== options.seconds ? retimePrompt(written, options.seconds) : written;
  const summary = typeof parsed.summary === 'string' ? parsed.summary.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  return { prompt, summary: summary || 'Your idea, written as a shot-by-shot prompt.', usage, fast };
}
