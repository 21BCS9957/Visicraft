import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { FaceLibraryError } from '@/lib/server/faceLibrary';
import { apiErrorResponse } from '@/lib/server/playground/http';

/** The page the person lands on after their face scan (it only says thanks; the Studio reads the result). */
export const scanCallbackUrl = (request: NextRequest) => process.env.FACE_SCAN_CALLBACK_URL || `${request.nextUrl.origin}/faces/verified`;

/** A face route's failure as a response: BytePlus's answer in plain words, or the usual API error. */
export function facesErrorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof FaceLibraryError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  return apiErrorResponse(error, fallback);
}
