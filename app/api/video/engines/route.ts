import { NextRequest, NextResponse } from 'next/server';
import { checkSeedanceAccess } from '@/lib/server/seedance';
import { resolveGeminiVeoModel } from '@/lib/server/veo';
import { isVideoEngineConfigured } from '@/lib/server/video';
import { requireAuthenticatedUser } from '@/lib/server/usage';
import { DEFAULT_VIDEO_MODEL } from '@/lib/video/shared';

type Engine = { ready: boolean; reason?: string };

const TTL_MS = 10 * 60 * 1000;
let cached: { at: number; engines: { seedance: Engine; veo: Engine } } | null = null;

/** Can Seedance 2.5 and Veo render for this app? Free checks only (no render), cached for 10 minutes. */
async function check(): Promise<{ seedance: Engine; veo: Engine }> {
  const seedance: Engine = !isVideoEngineConfigured('seedance')
    ? { ready: false, reason: 'Seedance isn’t set up (no BytePlus key).' }
    : await checkSeedanceAccess()
      .then((access): Engine => {
        if (!access.keyValid) return { ready: false, reason: 'BytePlus refused the key.' };
        const status = access.models.find((model) => model.id === DEFAULT_VIDEO_MODEL)?.status;
        return status === 'not_activated'
          ? { ready: false, reason: 'Seedance 2.5 isn’t switched on in the BytePlus account.' }
          : status === 'no_access' ? { ready: false, reason: 'This BytePlus key can’t use Seedance 2.5.' } : { ready: true };
      })
      .catch((): Engine => ({ ready: true }));
  const veo: Engine = !isVideoEngineConfigured('veo')
    ? { ready: false, reason: 'Google Veo isn’t set up (no Gemini key).' }
    : await resolveGeminiVeoModel('standard')
      .then((): Engine => ({ ready: true }))
      .catch((error): Engine => ({ ready: false, reason: error instanceof Error ? error.message : 'Veo isn’t available on the Google key.' }));
  return { seedance, veo };
}

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedUser(request);
    if (!cached || Date.now() - cached.at > TTL_MS) cached = { at: Date.now(), engines: await check() };
    return NextResponse.json(cached.engines);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not check the video engines';
    return NextResponse.json({ error: message }, { status: message.includes('Authentication required') ? 401 : 500 });
  }
}
