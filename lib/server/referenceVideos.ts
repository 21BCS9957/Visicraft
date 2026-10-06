import 'server-only';

import axios from 'axios';
import { requestGeminiText, uploadGeminiFile } from '@/lib/banana/api';
import { MAX_REFERENCE_VIDEOS } from '@/lib/playground/libraryVideo';
import { createServiceClient } from '@/lib/supabase/server';
import type { ProviderUsage } from '@/lib/server/usage';
import type { ClassifiedVideoStyle } from '@/lib/videoStyles';

/**
 * The user's reference videos, watched by Gemini: each becomes a timed shot sequence (what is
 * on screen, camera, on-screen text, purpose) plus its audio and style, which Claude Opus 5.5
 * turns into our video's prompt. The videos themselves never go to the video engine.
 */

/** One beat of a video's timeline. */
export interface AdSequenceShot {
  /** Time range, e.g. "0-2s". */
  t: string;
  shot: string;
  camera?: string;
  text?: string;
  purpose?: string;
}

/** How one reference ad is built, so a new creative can be modelled on it. */
export interface AdDesign {
  id: string;
  /** The reference's name (its Library name). */
  pageName: string;
  /** Kept for the writers' wording; 0 for the user's own references. */
  daysRunning: number;
  format: string;
  layout: string;
  hook: string;
  textPlacement: string;
  colorMood: string;
  proofOrOffer: string;
  whyItWorks: string;
  /** The timed shot sequence. */
  sequence?: AdSequenceShot[];
  /** Voice-over / music / sound style. */
  audio?: string;
  /** Creative style, judged from the video itself. */
  style?: ClassifiedVideoStyle;
  watched?: boolean;
}

export interface ReferenceVideoInput {
  id: string;
  name: string;
  url: string;
}

export interface ReferenceVideoAnalysis {
  design: AdDesign;
  /** A short pattern brief: pacing, hook, reveal timing. */
  brief: string;
  model: string;
  analyzedAt: string;
}

/** Our own uploads go up to 50 MB (the source-video bucket's limit). */
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
/** Gemini's inline request limit is ~20 MB; the Files API is the normal path. */
const MAX_INLINE_VIDEO_BYTES = 15 * 1024 * 1024;
const CLASSIFIED_STYLES: ClassifiedVideoStyle[] = ['ugc', 'talking_head', 'demo', 'cinematic', 'other'];
const STYLE_DEFINITIONS = `- ugc: a creator or customer filming themselves, or handheld phone footage; casual real settings; reviewing, unboxing, trying on or reacting.
- talking_head: one person speaking straight to the camera in a steady, composed shot (founder, expert, doctor, stylist, presenter).
- demo: the product being used or demonstrated up close (applying, pouring, draping, assembling), with or without narration.
- cinematic: a polished brand film or lifestyle montage with models and music; nobody addresses the camera.
- other: slideshow of stills, animation, motion graphics, text cards or catalogue.`;

function clean(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const withoutFences = raw.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(withoutFences.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type GeminiResponse = Awaited<ReturnType<typeof requestGeminiText>>['response'];

function geminiText(response: GeminiResponse): string {
  return response.data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((text): text is string => typeof text === 'string')
    .join('')
    .trim() ?? '';
}

function geminiUsage(response: GeminiResponse, providerModel: string): ProviderUsage {
  const meta = response.data.usageMetadata;
  const inputTokens = Number(meta?.promptTokenCount) || 0;
  const outputTokens = Number(meta?.candidatesTokenCount) || 0;
  return { inputTokens, outputTokens, totalTokens: Number(meta?.totalTokenCount) || inputTokens + outputTokens, providerModel };
}

async function loadVideo(url: string): Promise<{ mimeType: string; bytes: Buffer }> {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 60_000,
    maxContentLength: MAX_VIDEO_BYTES,
    maxBodyLength: MAX_VIDEO_BYTES,
  });
  const type = String(response.headers['content-type'] ?? '').split(';')[0].trim();
  return { mimeType: type.startsWith('video/') ? type : 'video/mp4', bytes: Buffer.from(response.data) };
}

/** The timed beats Gemini returned, cleaned (at most 10). */
function readSequence(value: unknown): AdSequenceShot[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((beat): AdSequenceShot | null => {
      const b = (beat && typeof beat === 'object' ? beat : {}) as Record<string, unknown>;
      const shot = clean(b.shot, 220);
      if (!shot) return null;
      return { t: clean(b.t, 12) || '?', shot, camera: clean(b.camera, 80) || undefined, text: clean(b.text, 120) || undefined, purpose: clean(b.purpose, 40) || undefined };
    })
    .filter((beat): beat is AdSequenceShot => beat !== null)
    .slice(0, 10);
}

/**
 * Gemini watches one reference video to the end and returns its full timed sequence. Throws
 * when the video can't be read or Gemini can't answer (the caller says so to the user).
 */
export async function analyzeReferenceVideo(video: ReferenceVideoInput): Promise<{ analysis: ReferenceVideoAnalysis; usage: ProviderUsage }> {
  const loaded = await loadVideo(video.url).catch((error: unknown) => {
    throw new Error(`The video "${video.name}" couldn't be downloaded (${error instanceof Error ? error.message : 'unknown error'}).`);
  });
  const file = await uploadGeminiFile(loaded.bytes, loaded.mimeType, `reference-${video.id}`).catch((error: unknown) => {
    console.warn(`Reference video ${video.id}: Gemini upload failed, trying inline:`, error instanceof Error ? error.message : error);
    return null;
  });
  if (!file && loaded.bytes.byteLength > MAX_INLINE_VIDEO_BYTES) {
    throw new Error(`"${video.name}" is too large to read (${Math.round(loaded.bytes.byteLength / 1e6)} MB). Try a shorter or smaller video.`);
  }
  const videoPart: Parameters<typeof requestGeminiText>[0][number] = file
    ? { fileData: file }
    : { inlineData: { mimeType: loaded.mimeType, data: loaded.bytes.toString('base64') } };

  const parts: Parameters<typeof requestGeminiText>[0] = [
    {
      text: `You are a senior performance-video creative strategist. The attached video is a REFERENCE the user wants their own product video modelled on. Watch it to the end and describe exactly how it is built, so a new video can copy its structure, pacing and camera work (never its brand, product, people or exact wording).

Return JSON only:
{
  "brief": "max 800 characters: the pacing (first 2 seconds, cut rhythm), hook, product reveal timing, shot types and the overall feel",
  "format": "e.g. UGC review / product demo / cinematic brand film / unboxing / before-after",
  "layout": "where the subject sits, its size in frame, background/setting, supporting elements",
  "hook": "how the first 2 seconds grab attention (structure, not wording)",
  "textPlacement": "how much on-screen text, where, hierarchy",
  "colorMood": "palette, lighting, mood",
  "proofOrOffer": "reviews, ratings, offers, badges used, or none",
  "whyItWorks": "one sentence on the psychological lever",
  "sequence": [{"t":"0-2s","shot":"what is on screen","camera":"static / push-in / handheld / cut","text":"on-screen text if any","purpose":"hook / problem / reveal / proof / offer / CTA"}],
  "audio": "voice-over, music and sound style, and the spoken language if anyone speaks",
  "style": "ugc | talking_head | demo | cinematic | other"
}
Give the full timed sequence from the first frame to the last (typically 4-8 beats), with real times from the video.
"style" is the creative style of the whole video:
${STYLE_DEFINITIONS}`,
    },
    { text: `REFERENCE VIDEO — "${video.name}":` },
    videoPart,
  ];

  const { response, providerModel } = await requestGeminiText(parts, { temperature: 0.3 }, 'Reference video analysis', [], 180_000);
  const parsed = parseJsonObject(geminiText(response));
  if (!parsed) throw new Error(`"${video.name}" couldn't be read. Try again.`);
  const design: AdDesign = {
    id: video.id,
    pageName: video.name,
    daysRunning: 0,
    format: clean(parsed.format, 120),
    layout: clean(parsed.layout, 400),
    hook: clean(parsed.hook, 300),
    textPlacement: clean(parsed.textPlacement, 300),
    colorMood: clean(parsed.colorMood, 200),
    proofOrOffer: clean(parsed.proofOrOffer, 200),
    whyItWorks: clean(parsed.whyItWorks, 200),
    sequence: readSequence(parsed.sequence),
    audio: clean(parsed.audio, 200) || undefined,
    style: CLASSIFIED_STYLES.find((candidate) => candidate === parsed.style),
    watched: true,
  };
  if (!design.sequence?.length) throw new Error(`"${video.name}" couldn't be broken into shots. Try another video.`);
  return {
    analysis: { design, brief: clean(parsed.brief, 800), model: providerModel, analyzedAt: new Date().toISOString() },
    usage: geminiUsage(response, providerModel),
  };
}

/** Reads a saved analysis back (from the Library row's JSON), or null when it isn't usable. */
export function readReferenceAnalysis(value: unknown): ReferenceVideoAnalysis | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const design = record.design as AdDesign | undefined;
  if (!design || !Array.isArray(design.sequence) || !design.sequence.length) return null;
  return {
    design: { ...design, sequence: readSequence(design.sequence) },
    brief: clean(record.brief, 800),
    model: clean(record.model, 80),
    analyzedAt: clean(record.analyzedAt, 40),
  };
}

/** A reference video from the user's Library: its file, poster, frames and saved analysis. */
export interface LibraryReferenceVideo {
  id: string;
  name: string;
  url: string;
  posterUrl: string | null;
  durationSeconds: number | null;
  /** Evenly spaced stills taken in the browser at upload; t is seconds into the video. */
  frames: Array<{ url: string; t: number }>;
  analysis: ReferenceVideoAnalysis | null;
}


export const LIBRARY_VIDEO_COLUMNS = 'id, name, url, poster_url, duration_seconds, frames, analysis';

/** The frames saved with a Library video, in time order. */
export function readLibraryFrames(value: unknown): Array<{ url: string; t: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((frame) => (frame && typeof frame === 'object' ? (frame as Record<string, unknown>) : {}))
    .filter((frame) => typeof frame.url === 'string' && Number.isFinite(Number(frame.t)))
    .map((frame) => ({ url: frame.url as string, t: Math.max(0, Number(frame.t)) }))
    .sort((a, b) => a.t - b.t)
    .slice(0, 24);
}

export function toLibraryReferenceVideo(row: Record<string, unknown>): LibraryReferenceVideo | null {
  if (typeof row.id !== 'string' && typeof row.id !== 'number') return null;
  if (typeof row.url !== 'string' || !row.url) return null;
  const duration = Number(row.duration_seconds);
  return {
    id: String(row.id),
    name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : 'Reference video',
    url: row.url,
    posterUrl: typeof row.poster_url === 'string' ? row.poster_url : null,
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
    frames: readLibraryFrames(row.frames),
    analysis: readReferenceAnalysis(row.analysis),
  };
}

/** The user's Library videos with these ids, in the order given; anyone else's are left out. */
export async function loadLibraryVideos(userId: string, raw: unknown, max = MAX_REFERENCE_VIDEOS): Promise<LibraryReferenceVideo[]> {
  const ids = Array.isArray(raw)
    ? [...new Set(raw.filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))].slice(0, max)
    : [];
  if (!ids.length) return [];
  const { data, error } = await createServiceClient()
    .from('playground_library')
    .select(LIBRARY_VIDEO_COLUMNS)
    .eq('user_id', userId)
    .eq('kind', 'video')
    .in('id', ids);
  if (error) {
    console.warn('Loading reference videos failed:', error.message);
    return [];
  }
  const rows = new Map((data ?? []).map((row) => [String((row as Record<string, unknown>).id), row as Record<string, unknown>]));
  return ids
    .map((id) => rows.get(id))
    .map((row) => (row ? toLibraryReferenceVideo(row) : null))
    .filter((video): video is LibraryReferenceVideo => video !== null);
}

/** Keeps Gemini's analysis with the Library video, so each video is watched once. */
export async function saveReferenceAnalysis(userId: string, id: string, analysis: ReferenceVideoAnalysis): Promise<boolean> {
  const { error } = await createServiceClient()
    .from('playground_library')
    .update({ analysis })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) console.warn(`Saving the analysis of reference video ${id} failed:`, error.message);
  return !error;
}

/** A beat's time range ("0-2s", "0:02-0:05", "3s") as its middle, in seconds. */
function beatMiddle(t: string): number | null {
  const times = [...t.matchAll(/(\d+):(\d{1,2}(?:\.\d+)?)|(\d+(?:\.\d+)?)/g)]
    .map((match) => (match[1] !== undefined ? Number(match[1]) * 60 + Number(match[2]) : Number(match[3])))
    .filter(Number.isFinite);
  if (!times.length) return null;
  return times.length >= 2 ? (times[0] + times[1]) / 2 : times[0];
}

/**
 * The frames Claude looks at: for each watched reference (in the order of `designs`), the
 * saved frame nearest the middle of each beat, at most 8 in all. The first reference, the
 * one the video is modelled on, gets most of them.
 */
export function referenceFramesFor(videos: LibraryReferenceVideo[], designs: AdDesign[]): Array<{ url: string; label: string }> {
  const quotas = designs.length <= 1 ? [8] : designs.length === 2 ? [5, 3] : [4, 2, 2];
  const picked: Array<{ url: string; label: string }> = [];
  designs.slice(0, 3).forEach((design, index) => {
    const video = videos.find((candidate) => candidate.id === design.id);
    if (!video?.frames.length) return;
    const used = new Set<string>();
    for (const beat of design.sequence ?? []) {
      if (used.size >= quotas[index]) break;
      const middle = beatMiddle(beat.t);
      if (middle === null) continue;
      const frame = video.frames.reduce((best, candidate) => (Math.abs(candidate.t - middle) < Math.abs(best.t - middle) ? candidate : best));
      if (used.has(frame.url)) continue;
      used.add(frame.url);
      picked.push({ url: frame.url, label: `Reference video #${index + 1} "${video.name}", frame at ${frame.t.toFixed(1)}s (beat ${beat.t}: ${beat.shot.slice(0, 80)})` });
    }
  });
  return picked.slice(0, 8);
}
