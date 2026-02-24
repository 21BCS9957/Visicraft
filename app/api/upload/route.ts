import { NextRequest, NextResponse } from 'next/server';
import { uploadImage } from '@/lib/supabase/storage';
import { requireAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    const { user } = auth;

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const bucket = (formData.get('bucket') as string) || 'source-images';

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    console.log('📤 Upload request:', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      bucket,
      userId: user.id,
    });

    const url = await uploadImage(file, bucket, user.id);

    console.log('✅ Upload success:', url);

    return NextResponse.json({ url });
  } catch (error) {
    console.error('❌ Upload error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
