import { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiErrorResponse, assertDb, requireUuid, withUser } from '@/lib/server/playground/http';
import { isMissingLibraryVideoSetup, LIBRARY_COLUMNS, LIBRARY_VIDEO_SETUP_MESSAGE, playgroundDb, toLibraryItem } from '@/lib/server/playground/db';
import { analyzeReferenceVideo, LIBRARY_VIDEO_COLUMNS, saveReferenceAnalysis, toLibraryReferenceVideo } from '@/lib/server/referenceVideos';
import { estimateGoogleProductAnalysisCostUsd, logUsage } from '@/lib/server/usage';

export const maxDuration = 300;

type Context = { params: Promise<{ itemId: string }> };

/**
 * "Watch with Gemini": Gemini watches a Library video to the end and its timed shot sequence
 * is saved with it, so it is watched once and reused by every video that copies its shots.
 * ?again=1 watches it again. Costs well under a cent, so it is not charged.
 */
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const user = await withUser(request);
    const itemId = requireUuid((await params).itemId, 'library item');
    const db = playgroundDb();
    const { data, error } = await db
      .from('playground_library')
      .select(LIBRARY_VIDEO_COLUMNS)
      .eq('id', itemId)
      .eq('user_id', user.id)
      .eq('kind', 'video')
      .maybeSingle();
    if (isMissingLibraryVideoSetup(error)) throw new ApiError(409, LIBRARY_VIDEO_SETUP_MESSAGE, 'setup');
    assertDb(error, 'load the video');
    const video = data ? toLibraryReferenceVideo(data as unknown as Record<string, unknown>) : null;
    if (!video) throw new ApiError(404, 'Library video not found.', 'not_found');

    if (!video.analysis || request.nextUrl.searchParams.get('again') === '1') {
      const watched = await analyzeReferenceVideo({ id: video.id, name: video.name, url: video.url }).catch((failure: unknown) => {
        throw new ApiError(502, failure instanceof Error ? failure.message : 'Gemini could not watch this video. Try again.', 'provider');
      });
      if (!(await saveReferenceAnalysis(user.id, video.id, watched.analysis))) {
        throw new ApiError(500, 'Gemini watched the video, but what it saw could not be saved. Try again.', 'db');
      }
      await logUsage({
        user,
        model: watched.usage.providerModel || 'gemini',
        feature: 'video_generation',
        inputTokens: watched.usage.inputTokens,
        outputTokens: watched.usage.outputTokens,
        totalTokens: watched.usage.totalTokens,
        imageCount: 0,
        estimatedCostUsd: estimateGoogleProductAnalysisCostUsd({ ...watched.usage, model: watched.usage.providerModel }),
        creditCost: 0,
        metadata: { operation: 'reference_video_analysis', libraryItemId: video.id, shots: watched.analysis.design.sequence?.length ?? 0 },
      }).catch((failure) => console.error('Reference video usage logging failed:', failure));
    }

    const { data: row, error: reloadError } = await db.from('playground_library').select(LIBRARY_COLUMNS).eq('id', itemId).eq('user_id', user.id).maybeSingle();
    assertDb(reloadError, 'load the video');
    if (!row) throw new ApiError(404, 'Library video not found.', 'not_found');
    return NextResponse.json({ item: toLibraryItem(row as unknown as Record<string, unknown>) });
  } catch (error) {
    return apiErrorResponse(error, 'Gemini could not watch this video');
  }
}
