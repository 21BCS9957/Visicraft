import { NextRequest, NextResponse } from 'next/server';
import { PromptWriterError, writePlaygroundPrompts } from '@/lib/server/playground/promptWriter';
import type { ReferenceSnapshot } from '@/lib/playground/types';

export const maxDuration = 300;

/**
 * Development-only: runs the Claude prompt writer on the given references without signing
 * in or spending credits (it still calls Claude, which bills the Anthropic key).
 * POST { references: [{ url, role, label }], goal, count, brief?, model?, ratios? }
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = (await request.json()) as {
    references?: Array<Pick<ReferenceSnapshot, 'url' | 'role' | 'label'>>;
    goal?: string;
    count?: number;
    brief?: string;
    model?: string;
    ratios?: string[];
  };
  const started = Date.now();
  try {
    const written = await writePlaygroundPrompts({
      goal: body.goal ?? '',
      count: Math.min(100, Math.max(1, body.count ?? 5)),
      brief: body.brief ?? '',
      references: (body.references ?? []).map((reference, index) => ({ id: `dev-${index}`, ...reference })),
      imageModel: body.model ?? 'gemini-3-pro-image',
      ratios: body.ratios ?? ['4:5'],
      existing: [],
    });
    return NextResponse.json({ seconds: Math.round((Date.now() - started) / 1000), ...written });
  } catch (error) {
    const status = error instanceof PromptWriterError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}
