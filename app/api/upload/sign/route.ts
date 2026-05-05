import { NextRequest, NextResponse } from 'next/server';
import { createSignedUploadTarget } from '@/lib/server/supabaseStorage';

const BUCKET_RULES: Record<string, { mimeTypes: Set<string>; maxSize: number }> = {
  'source-images': {
    mimeTypes: new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']),
    maxSize: 5 * 1024 * 1024,
  },
  'source-video': {
    mimeTypes: new Set(['video/mp4', 'video/webm', 'video/quicktime']),
    maxSize: 50 * 1024 * 1024,
  },
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      bucket?: unknown;
      contentType?: unknown;
      size?: unknown;
    };

    const bucket = typeof body.bucket === 'string' ? body.bucket : 'source-images';
    const contentType = typeof body.contentType === 'string' ? body.contentType : '';
    const size = typeof body.size === 'number' ? body.size : 0;
    const rules = BUCKET_RULES[bucket];

    if (!rules) {
      return NextResponse.json({ error: 'Unsupported upload bucket' }, { status: 400 });
    }

    if (!rules.mimeTypes.has(contentType)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    if (size <= 0 || size > rules.maxSize) {
      return NextResponse.json(
        { error: `File is too large. Maximum size is ${Math.round(rules.maxSize / 1024 / 1024)}MB` },
        { status: 400 }
      );
    }

    const target = await createSignedUploadTarget(bucket, contentType);
    return NextResponse.json(target);
  } catch (error) {
    console.error('Signed upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to prepare upload' },
      { status: 500 }
    );
  }
}
