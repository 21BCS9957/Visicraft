'use client';

import { useState } from 'react';
import { AlertTriangle, Ban, Clock, Download, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { upgradeModelFor, upgradeQualities, videoCredits, videoModelOptions, videoQualityLabel, type FinalQuality } from '@/lib/videoModels';
import { videoStyleLabel } from '@/lib/videoStyles';
import { downloadUrl } from '@/lib/playground/api';
import { mainTake, studioVideoStatus, videoModelName, type StudioVideo, type VideoTake } from '@/lib/video/shared';
import { cx, timeAgo } from '@/components/playground/ui';

export function takeLabel(take: VideoTake): string {
  return take.quality === 'draft' ? `Draft · ${videoModelOptions(take.model).draft.resolution}` : videoQualityLabel(take.quality);
}

function fileName(video: StudioVideo, take: VideoTake): string {
  const base = (video.title ?? 'visicraft-video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'visicraft-video';
  return `${base}-${take.quality}.mp4`;
}

function Progress({ value }: { value: number }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full bg-[#fff05a] transition-all duration-700" style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </div>
  );
}

/**
 * A video after approval: the player (or the render's progress, or what went wrong), its
 * takes (a draft and the upgrades made from it), download, and upgrades to a higher quality.
 */
export function VideoPlayerCard({ video, preview, busy, credits, onUpgrade, onReuse }: {
  video: StudioVideo;
  preview: boolean;
  /** An upgrade is being started. */
  busy: boolean;
  credits: number | null;
  onUpgrade: (take: VideoTake, quality: FinalQuality) => void;
  onReuse: () => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const status = studioVideoStatus(video);
  const ready = video.takes.filter((take) => take.status === 'ready');
  const take = ready.find((item) => item.key === chosen) ?? mainTake(video);
  const rendering = video.takes.find((item) => item.status === 'rendering');
  const newestReady = ready.at(-1);
  const made = new Set(video.takes.filter((item) => item.status !== 'failed').map((item) => item.quality));
  const upgrades = newestReady && !rendering
    ? upgradeQualities(newestReady.model, newestReady.quality, newestReady.nativeDraft).filter((quality) => !made.has(quality))
    : [];

  return (
    <div className="grid gap-5 rounded-[24px] border border-white/10 bg-[#111114] p-4 sm:p-5 md:grid-cols-[auto_minmax(0,1fr)]">
      <div className="relative mx-auto aspect-[9/16] h-[min(68vh,620px)] max-w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
        {take?.status === 'ready' && take.url ? (
          <video key={take.key} src={take.url} poster={video.poster ?? undefined} controls playsInline className="h-full w-full object-contain" />
        ) : (
          <>
            {video.poster && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={video.poster} alt="" className={cx('h-full w-full object-cover', status === 'rendering' ? 'scale-105 blur-[2px] brightness-50' : 'brightness-[0.35]')} />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              {status === 'rendering' ? (
                <>
                  <Loader2 className="h-7 w-7 animate-spin text-[#fff05a]" />
                  <p className="text-sm text-white">{rendering?.message ?? 'Rendering…'}</p>
                  <div className="w-40"><Progress value={rendering?.progress ?? 5} /></div>
                  <p className="max-w-[220px] text-[11px] leading-relaxed text-white/50">Usually 1–5 minutes. You can leave this page; it keeps rendering and shows up in Your videos.</p>
                </>
              ) : status === 'cancelled' ? (
                <>
                  <Ban className="h-7 w-7 text-white/50" />
                  <p className="text-sm text-white">Cancelled</p>
                  <p className="max-w-[220px] text-[11px] leading-relaxed text-white/50">Nothing was charged for the video.</p>
                </>
              ) : status === 'unsaved' ? (
                <>
                  <Clock className="h-7 w-7 text-white/50" />
                  <p className="text-sm text-white">Not saved here</p>
                  <p className="max-w-[240px] text-[11px] leading-relaxed text-white/50">This video was made before Visicraft kept your videos, so there is no file to play. Its settings can be used again.</p>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-7 w-7 text-red-300" />
                  <p className="text-sm text-white">This video didn’t render</p>
                  <p className="max-w-[260px] text-[11px] leading-relaxed text-white/55">{video.takes.at(-1)?.error ?? 'The render failed.'}</p>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <p className="text-lg font-light leading-snug text-white">{video.title ?? 'Untitled video'}</p>
          <p className="mt-1 text-xs text-white/45">
            {[video.style ? videoStyleLabel(video.style) : null, take ? `${take.durationSeconds}s` : null, take ? videoModelName(take.model) : null, timeAgo(video.createdAt)].filter(Boolean).join(' · ')}
          </p>
        </div>

        {video.takes.length > 1 && (
          <div>
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">Takes</p>
            <div className="flex flex-wrap gap-1.5">
              {video.takes.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  disabled={item.status !== 'ready'}
                  onClick={() => setChosen(item.key)}
                  className={cx(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors disabled:cursor-default',
                    item.key === take?.key ? 'border-[#fff05a]/50 bg-[#fff05a]/12 text-[#fff05a]' : 'border-white/10 text-white/70 enabled:hover:bg-white/8',
                    item.status === 'failed' && 'text-red-300/80 line-through'
                  )}
                  title={item.status === 'failed' ? item.error ?? 'Failed' : undefined}
                >
                  {item.status === 'rendering' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {takeLabel(item)}
                  {item.status === 'rendering' && typeof item.progress === 'number' && <span className="text-white/45">{item.progress}%</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {take?.status === 'ready' && take.url && (
          <div className="flex flex-wrap gap-2">
            <a
              href={preview ? take.url : downloadUrl(take.url, fileName(video, take))}
              download={fileName(video, take)}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[#fff05a] px-4 text-sm font-medium text-black hover:bg-white"
            >
              <Download className="h-4 w-4" /> Download {takeLabel(take)}
            </a>
            <button type="button" onClick={onReuse} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-sm text-white/80 hover:bg-white/8 hover:text-white">
              <RefreshCw className="h-4 w-4" /> Use these settings again
            </button>
          </div>
        )}
        {(status === 'failed' || status === 'cancelled' || status === 'unsaved') && (
          <button type="button" onClick={onReuse} className="inline-flex h-10 w-fit items-center gap-2 rounded-full border border-white/15 px-4 text-sm text-white/80 hover:bg-white/8 hover:text-white">
            <RefreshCw className="h-4 w-4" /> Use these settings again
          </button>
        )}

        {rendering && ready.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-xs text-white/70">{rendering.message ?? `Rendering the ${takeLabel(rendering)} version…`}</p>
            <div className="mt-2"><Progress value={rendering.progress ?? 5} /></div>
          </div>
        )}

        {upgrades.length > 0 && newestReady && (
          <div className="rounded-2xl border border-[#fff05a]/20 bg-[#fff05a]/[0.04] p-3.5">
            <p className="flex items-center gap-1.5 text-sm text-white"><Sparkles className="h-4 w-4 text-[#fff05a]" /> Like it? Upgrade it</p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/50">
              {newestReady.nativeDraft
                ? `${videoModelName(newestReady.model)} keeps this exact take, in full quality.`
                : 'The same frame and prompt are rendered again at a higher quality; only the new render is charged.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {upgrades.map((quality) => {
                const cost = videoCredits(upgradeModelFor(newestReady.model), quality, newestReady.durationSeconds);
                return (
                  <button
                    key={quality}
                    type="button"
                    onClick={() => onUpgrade(newestReady, quality)}
                    disabled={busy || (credits !== null && credits < cost)}
                    title={credits !== null && credits < cost ? `Needs ${cost} credits; you have ${credits}` : undefined}
                    className="inline-flex h-9 items-center rounded-full border border-[#fff05a]/40 bg-[#fff05a]/10 px-3.5 text-xs text-[#fff05a] hover:bg-[#fff05a]/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {videoQualityLabel(quality)}{newestReady.nativeDraft ? ' · same take' : ''} · {cost} credits
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {video.prompt && (
          <details className="rounded-2xl border border-white/8 bg-black/20">
            <summary className="cursor-pointer list-none px-3.5 py-2.5 text-xs text-white/60 hover:text-white">The prompt it was made from</summary>
            <p className="max-h-72 overflow-y-auto whitespace-pre-wrap px-3.5 pb-3.5 font-mono text-[11px] leading-relaxed text-white/55">{video.prompt}</p>
          </details>
        )}
      </div>
    </div>
  );
}
