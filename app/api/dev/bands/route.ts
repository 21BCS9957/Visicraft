import { NextRequest, NextResponse } from 'next/server';
import { trimPaddedBands } from '@/lib/server/paddedBands';

/** Development-only harness: detect and trim padded bands on generated images. */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = (await request.json()) as { urls?: string[] };
  const results = await Promise.all((body.urls ?? []).map(async (url) => {
    try {
      const result = await trimPaddedBands(url);
      return { source: url, ...result };
    } catch (error) {
      return { source: url, error: error instanceof Error ? error.message : String(error) };
    }
  }));
  return NextResponse.json({ results });
}
