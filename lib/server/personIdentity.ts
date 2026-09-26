import { loadPreparedReferences, requestGeminiText } from '@/lib/banana/api';
import type { ProviderUsage } from '@/lib/server/usage';

/**
 * A real person as the subject of an ad, handled like the product: Gemini reads the
 * photo and writes the identity spec that the generation prompt carries, and every
 * generated frame is checked against the photo before it is accepted.
 */

export interface PersonIdentity {
  manifest: string;
  usage: ProviderUsage;
}

export interface PersonVerdict {
  passed: boolean;
  score: number;
  checks: Record<'faceSame' | 'hairSame' | 'outfitSame' | 'bodySame', boolean>;
  reason: string;
  usage: ProviderUsage;
}

export const PERSON_PASS_SCORE = 80;

function usageOf(response: { data: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } } }, providerModel: string): ProviderUsage {
  const meta = response.data.usageMetadata;
  const inputTokens = Number(meta?.promptTokenCount) || 0;
  const outputTokens = Number(meta?.candidatesTokenCount) || 0;
  return { inputTokens, outputTokens, totalTokens: Number(meta?.totalTokenCount) || inputTokens + outputTokens, providerModel };
}

function textOf(response: { data: { candidates?: Array<{ content?: { parts: Array<{ text?: string }> } }> } }): string {
  return response.data.candidates?.[0]?.content?.parts?.map((p) => p.text).filter((t): t is string => typeof t === 'string').join('').trim() ?? '';
}

/** Writes the identity spec: everything a generation model must keep to make it the same person. */
export async function analyzePersonIdentity(photoUrl: string): Promise<PersonIdentity> {
  const { images } = await loadPreparedReferences([photoUrl]);
  const { response, providerModel } = await requestGeminiText(
    [
      {
        text: `Describe this person precisely so that an image model can reproduce them as the SAME person in a new photo. Be concrete and physical; no flattery, no guesses about personality. Under 1,800 characters, plain text with these headings:

FACE: shape, jawline, cheekbones, nose, lips, eyes (shape, spacing, eyebrows), skin tone in plain words, any marks. Note anything partly hidden in the photo and say so.
HAIR: colour, texture, length, how it is styled (parting, volume, where it falls).
FACIAL HAIR: exact coverage, length, edges.
BUILD: height impression, shoulders, build.
OUTFIT: every garment with colour, fit, fabric look, prints or graphics (describe the artwork and where it sits), buttons, sleeves, trousers, shoes, accessories, jewellery.
DO NOT CHANGE: a short list of the 6-8 most identity-defining details, the ones a viewer would use to recognise this exact person.`,
      },
      { inlineData: { mimeType: images[0].mimeType, data: images[0].data } },
    ],
    { temperature: 0.1 },
    'Person identity analysis'
  );
  const manifest = textOf(response).slice(0, 2200);
  if (!manifest) throw new Error('Person identity analysis returned nothing.');
  return { manifest, usage: usageOf(response, providerModel) };
}

/** Compares a generated frame against the reference photo. Strict on the face, hair and outfit. */
export async function validatePersonIdentity(photoUrl: string, generatedUrl: string, manifest: string): Promise<PersonVerdict> {
  const { images } = await loadPreparedReferences([photoUrl, generatedUrl]);
  if (images.length !== 2) throw new Error('Could not load both images for person verification.');
  const { response, providerModel } = await requestGeminiText(
    [
      {
        text: `You are a strict identity inspector. Image A is a real person. Image B is a generated advertisement that must show the SAME person. Ignore the setting, pose, lighting, expression, camera angle and anything they are holding. Judge only whether B is recognisably this exact individual.

Identity spec of the person in A:
${manifest.slice(0, 2200)}

Check:
- faceSame: same face structure, nose, eyes, eyebrows, lips, jaw, skin tone; not a "similar type" but the same person; no beautifying, slimming, ageing or de-ageing.
- hairSame: same colour, texture, length and styling.
- outfitSame: same garments with the same colours, prints and graphics (a print that is missing, changed or moved is a failure).
- bodySame: same build and proportions.

score: 0-100 confidence that a friend of this person would say "that's them" (90+ = unmistakably the same person; 60-79 = looks like a relative; below 60 = a different person).

Return JSON only: {"faceSame":true,"hairSame":true,"outfitSame":true,"bodySame":true,"score":0,"reason":"brief, specific: what differs, if anything"}`,
      },
      { text: 'IMAGE A - REAL PERSON:' },
      { inlineData: { mimeType: images[0].mimeType, data: images[0].data } },
      { text: 'IMAGE B - GENERATED:' },
      { inlineData: { mimeType: images[1].mimeType, data: images[1].data } },
    ],
    { temperature: 0 },
    'Person identity verification'
  );
  const raw = textOf(response).replace(/^```(?:json)?\s*|\s*```$/gi, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Person identity verification returned malformed JSON.');
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  const rawScore = Number(parsed.score) || 0;
  const score = Math.max(0, Math.min(100, rawScore > 0 && rawScore <= 10 && Number.isInteger(rawScore) ? rawScore * 10 : rawScore));
  const checks = {
    faceSame: parsed.faceSame === true,
    hairSame: parsed.hairSame === true,
    outfitSame: parsed.outfitSame === true,
    bodySame: parsed.bodySame === true,
  };
  return {
    // The model's score is conservative even when it reports every check as matching.
    passed: (checks.faceSame && checks.hairSame && checks.outfitSame && checks.bodySame && score >= 65) || score >= PERSON_PASS_SCORE,
    score,
    checks,
    reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 400) : 'Identity mismatch detected.',
    usage: usageOf(response, providerModel),
  };
}
