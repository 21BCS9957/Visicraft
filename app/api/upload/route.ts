import { NextRequest, NextResponse } from 'next/server';
import { uploadBufferToBucket } from '@/lib/server/supabaseStorage';

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

function parseBucket(raw: FormDataEntryValue | null): string {
  return typeof raw === 'string' && raw in BUCKET_RULES ? raw : 'source-images';
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const bucket = parseBucket(formData.get('bucket'));
    const rules = BUCKET_RULES[bucket];

    if (!(file instanceof File) || !file.name) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!rules.mimeTypes.has(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type' },
        { status: 400 }
      );
    }

    if (file.size > rules.maxSize) {
      return NextResponse.json(
        { error: `File is too large. Maximum size is ${Math.round(rules.maxSize / 1024 / 1024)}MB` },
        { status: 400 }
      );
    }
    
    // We convert the API stream file into an ArrayBuffer buffer array for the pure Node supabase admin client
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const url = await uploadBufferToBucket(buffer, bucket, file.type);

    return NextResponse.json({ url });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
