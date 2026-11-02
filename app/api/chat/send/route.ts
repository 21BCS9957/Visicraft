import type { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { chatImagePrice, planSize, readSizeChoice, sizeFromText, type SizePlan } from '@/lib/chat/sizes';
import type { ChatAttachment, ChatImage, ChatStreamEvent } from '@/lib/chat/types';
import { DEFAULT_QUALITY, type ImageQuality } from '@/lib/playground/models';
import {
  chatDb, createThread, finishMessage, insertMessage, loadMessages, requireProject, requireThread, titleFrom, updateThread,
} from '@/lib/server/chat/db';
import { CHAT_MODEL, CHAT_SYSTEM, ChatTurnError, runChatTurn, type ChatInputContent } from '@/lib/server/chat/openai';
import { isOwnStorageUrl } from '@/lib/server/playground/db';
import { ApiError, apiErrorResponse, readJson, withUser } from '@/lib/server/playground/http';
import { savePlaygroundImage } from '@/lib/server/playground/images';
import { deductCreditsForUser, logUsage, refundCreditsForUser } from '@/lib/server/usage';

export const maxDuration = 300;

const MAX_TEXT = 8000;
const MAX_ATTACHMENTS = 6;
const QUALITIES: ImageQuality[] = ['high', 'xhigh', 'max'];

/**
 * The shape, told to the model with the message (not saved): it composes for it. A shape wider
 * than 3:1 (taller than 1:3) is made at 3:1 and cropped, so everything that matters stays in the middle.
 */
function canvasNote(plan: SizePlan): string | null {
  if (!plan.width || !plan.height) return null;
  const size = `${plan.width} × ${plan.height}`;
  if (!plan.clamped) return `(Image size: ${size}. Compose for exactly this shape and fill the canvas edge to edge.)`;
  const [gw, gh] = plan.generation.split('x').map(Number);
  const wanted = plan.width / plan.height;
  const made = gw / gh;
  const keep = Math.round(100 * (wanted > made ? made / wanted : wanted / made));
  return `(Image size: ${size}. It is cropped from this canvas, so put all text, products and faces inside the middle ${keep}% of the ${wanted > made ? 'height' : 'width'} and fill the rest with background.)`;
}

/** A partial preview, small enough to stream (OpenAI sends it at full size). */
async function smallPreview(b64: string): Promise<string | null> {
  try {
    const bytes = await sharp(Buffer.from(b64, 'base64')).resize({ width: 512, height: 512, fit: 'inside' }).webp({ quality: 55 }).toBuffer();
    return `data:image/webp;base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Sends one message in a Chat (POST /api/chat/send): starts the chat on its first message,
 * charges one image up front (refunded if the reply makes none, fails or is stopped), and streams
 * the reply as JSON lines: `thread` (a new chat), `user`, `assistant`, `text` deltas, `creating`,
 * `partial` previews, `image`, then `done` or `error`. The image is saved at the exact size asked.
 */
export async function POST(request: NextRequest) {
  let userId = '';
  let charged = 0;
  try {
    const user = await withUser(request);
    userId = user.id;
    const body = await readJson<{ threadId?: unknown; projectId?: unknown; text?: unknown; attachments?: unknown; size?: unknown; quality?: unknown }>(request);
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
    const attachments = (Array.isArray(body.attachments) ? body.attachments : [])
      .filter((item): item is ChatAttachment => Boolean(item && typeof item === 'object' && typeof (item as ChatAttachment).url === 'string' && isOwnStorageUrl((item as ChatAttachment).url)))
      .slice(0, MAX_ATTACHMENTS)
      .map((item) => ({ url: item.url, name: String(item.name ?? 'Image').slice(0, 120), width: Number(item.width) || null, height: Number(item.height) || null }));
    if (!text && !attachments.length) throw new ApiError(400, 'Write a message first.', 'bad_request');
    const quality: ImageQuality = QUALITIES.includes(body.quality as ImageQuality) ? (body.quality as ImageQuality) : DEFAULT_QUALITY;
    // A size typed in the message wins over the chip.
    const choice = sizeFromText(text) ?? readSizeChoice(body.size) ?? { kind: 'auto' as const };
    const plan = planSize(choice);
    const price = chatImagePrice(plan, quality, attachments.length);

    const db = chatDb();
    let thread = typeof body.threadId === 'string' && body.threadId ? await requireThread(db, user.id, body.threadId) : null;
    const project = thread?.projectId
      ? await requireProject(db, user.id, thread.projectId).catch(() => null)
      : typeof body.projectId === 'string' && body.projectId ? await requireProject(db, user.id, body.projectId) : null;
    const history = thread ? await loadMessages(db, thread.id) : [];
    const lastImage = [...history].reverse().find((message) => message.images.length)?.images[0] ?? null;

    if (!(await deductCreditsForUser(user.id, price.credits))) {
      throw new ApiError(402, `An image here costs ${price.credits} credits, and you don’t have enough. Top up to keep going.`, 'insufficient_credits', { needed: price.credits });
    }
    charged = price.credits;

    const isNew = !thread;
    if (!thread) thread = await createThread(db, user.id, { projectId: project?.id ?? null, title: titleFrom(text || 'Image chat') });
    const userMessage = await insertMessage(db, { thread_id: thread.id, user_id: user.id, role: 'user', content: text, attachments });
    const assistant = await insertMessage(db, { thread_id: thread.id, user_id: user.id, role: 'assistant', content: '', status: 'generating' });
    const chat = thread;

    const encoder = new TextEncoder();
    const upstream = new AbortController();
    request.signal.addEventListener('abort', () => upstream.abort(), { once: true });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: ChatStreamEvent) => {
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            // The page went away; the reply still finishes and is saved.
          }
        };
        if (isNew) send({ type: 'thread', thread: { id: chat.id, projectId: chat.projectId, title: chat.title, createdAt: chat.createdAt, updatedAt: chat.updatedAt } });
        send({ type: 'user', message: userMessage });
        send({ type: 'assistant', message: assistant, credits: price.credits, size: plan.label });

        let replyText = '';
        const imageModel = attachments.length || lastImage ? 'gpt-image-2.5-sunburst' as const : 'gpt-image-2.5-flare' as const;
        const instructions = project?.instructions.trim()
          ? `${CHAT_SYSTEM}\n\nPROJECT INSTRUCTIONS (follow them in every reply and image):\n${project.instructions.trim()}`
          : CHAT_SYSTEM;
        const content = (extra: string | null, withLast: boolean): ChatInputContent[] => [
          { type: 'input_text', text: [extra, text || 'Use the attached image.', canvasNote(plan)].filter(Boolean).join('\n\n') },
          ...(withLast && lastImage ? [{ type: 'input_image' as const, image_url: lastImage.url }] : []),
          ...attachments.map((item) => ({ type: 'input_image' as const, image_url: item.url })),
        ];
        const turn = (previous: string | null, input: ChatInputContent[]) => runChatTurn({
          instructions,
          content: input,
          previousResponseId: previous,
          imageModel,
          size: plan.generation,
          quality,
          safetyId: createHash('sha256').update(`visicraft:${user.id}`).digest('hex').slice(0, 32),
          signal: upstream.signal,
          onText: (delta) => {
            replyText += delta;
            send({ type: 'text', delta });
          },
          onCreating: () => send({ type: 'creating' }),
          onPartial: (b64, index) => {
            void smallPreview(b64).then((image) => image && send({ type: 'partial', image, index }));
          },
        });

        try {
          let result;
          try {
            result = await turn(chat.lastResponseId, content(null, false));
          } catch (error) {
            if (!(error instanceof ChatTurnError && error.kind === 'previous_missing')) throw error;
            // OpenAI no longer has the conversation (kept about 30 days): carry the last few turns and image ourselves.
            const recap = history.slice(-6).map((message) => `${message.role === 'user' ? 'User' : 'You'}: ${message.text || (message.images.length ? '[made an image]' : '')}`).join('\n');
            replyText = '';
            result = await turn(null, content(recap ? `EARLIER IN THIS CHAT:\n${recap}${lastImage ? '\n(The last image you made is attached first.)' : ''}` : null, true));
          }

          let images: ChatImage[] = [];
          if (result.image) {
            let bytes: Buffer = Buffer.from(result.image.b64, 'base64');
            // The exact pixels asked for (GPT Image renders in multiples of 16, at most the 2K tier here).
            if (plan.width && plan.height) {
              const big = plan.width * plan.height > 4_200_000;
              const resized = sharp(bytes).resize(plan.width, plan.height, { fit: 'cover', position: 'centre' });
              bytes = big ? await resized.jpeg({ quality: 92 }).toBuffer() : await resized.png().toBuffer();
            }
            const saved = await savePlaygroundImage(bytes, plan.width && plan.height && plan.width * plan.height > 4_200_000 ? 'image/jpeg' : 'image/png');
            const image: ChatImage = {
              url: saved.imageUrl,
              previewUrl: saved.previewUrl,
              width: saved.width,
              height: saved.height,
              model: imageModel,
              quality,
              revisedPrompt: result.image.revisedPrompt,
              ...(plan.upscaled ? { upscaled: true } : {}),
            };
            images = [image];
            send({ type: 'image', image });
          }

          const kept = images.length ? price.credits : 0;
          if (!images.length) await refundCreditsForUser(user.id, charged).catch(() => undefined);
          charged = 0;
          const message = await finishMessage(db, assistant.id, { content: result.text || replyText.trim(), images, status: 'done', error: null, response_id: result.responseId, credits: kept });
          await updateThread(db, user.id, chat.id, {
            last_response_id: result.responseId,
            updated_at: new Date().toISOString(),
            settings: { size: choice, quality },
          }).catch(() => undefined);
          send({ type: 'done', message });

          await logUsage({
            user,
            provider: 'openai',
            model: images.length ? imageModel : CHAT_MODEL,
            feature: 'image_generation',
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            totalTokens: result.usage.inputTokens + result.usage.outputTokens,
            imageCount: images.length,
            estimatedCostUsd: (images.length ? price.usd : 0) + result.textCostUsd,
            creditCost: kept,
            metadata: { mode: images.length ? 'chat_image' : 'chat_text', chatThreadId: chat.id, chatMessageId: assistant.id, chatProjectId: project?.id ?? null, size: plan.label, render: plan.generation, quality, chatModel: CHAT_MODEL },
          }).catch((error) => console.error('Chat usage logging failed:', error));
        } catch (error) {
          if (charged) await refundCreditsForUser(user.id, charged).catch(() => undefined);
          charged = 0;
          const stopped = error instanceof ChatTurnError && error.kind === 'stopped';
          const message = error instanceof Error ? error.message : 'The reply failed.';
          await finishMessage(db, assistant.id, {
            content: replyText.trim(),
            images: [],
            status: stopped ? 'stopped' : 'failed',
            error: stopped ? null : message,
            response_id: null,
            credits: 0,
          }).catch(() => undefined);
          await updateThread(db, user.id, chat.id, { updated_at: new Date().toISOString() }).catch(() => undefined);
          if (!stopped) console.error('Chat reply failed:', error);
          send({ type: 'error', message: stopped ? 'Stopped. Nothing was charged.' : `${message} Nothing was charged.`, code: error instanceof ChatTurnError ? error.kind : 'failed', status: error instanceof ChatTurnError ? error.status : 500 });
        } finally {
          try {
            controller.close();
          } catch {
            // Already closed.
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    if (charged && userId) await refundCreditsForUser(userId, charged).catch(() => undefined);
    return apiErrorResponse(error, 'Could not send the message');
  }
}
