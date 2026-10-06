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
