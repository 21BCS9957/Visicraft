'use client';

import { useState, type ReactNode } from 'react';
import { Clapperboard, Image as ImageIcon } from 'lucide-react';
import { cx } from '@/components/playground/ui';
import { EmptyState, Loading, PANEL } from './parts';

/** Project cards and the small stat tile, shared by an account's page and a client's page. */

type CardProject = { id: string; name: string; kind: 'image' | 'video'; coverUrl: string | null };

export function SmallStat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className={cx(PANEL, 'min-w-0 p-5')}>
      <p className="truncate text-[13px] text-zinc-400">{label}</p>
      {value === null ? <span className="mt-3 block h-8 w-20 animate-pulse rounded-full bg-white/[0.06]" /> : <p className="mt-2 truncate text-[32px] font-semibold leading-none tracking-tight text-zinc-50">{value}</p>}
    </div>
  );
}

/** `detail`: the line under the name ("12 images · updated 2 h ago"); `who`: whose it is, when that varies. */
function ProjectCard({ project, detail, who, onOpen }: { project: CardProject; detail: string; who?: ReactNode; onOpen: () => void }) {
  const [coverFailed, setCoverFailed] = useState(false);
  return (
    <button type="button" onClick={onOpen} className={cx(PANEL, 'group overflow-hidden !p-0 text-left transition-colors hover:border-white/15')}>
      <div className="relative aspect-[16/10] overflow-hidden bg-zinc-900">
        {project.coverUrl && !coverFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.coverUrl} alt="" loading="lazy" onError={() => setCoverFailed(true)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-700">{project.kind === 'video' ? <Clapperboard className="h-7 w-7" /> : <ImageIcon className="h-7 w-7" />}</div>
        )}
        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          {project.kind === 'video' ? <Clapperboard className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
          {project.kind === 'video' ? 'Video' : 'Images'}
        </span>
      </div>
      <div className="px-3.5 py-3">
        <h3 className="truncate text-sm font-medium text-zinc-100">{project.name}</h3>
        {who && <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-zinc-300">{who}</div>}
        <p className="mt-0.5 truncate text-xs text-zinc-500">{detail}</p>
      </div>
    </button>
  );
}

export function ProjectGrid<T extends CardProject>({ projects, detail, who, onOpen, empty = 'Image and video projects this account creates show up here.' }: {
  projects: T[] | null;
  detail: (project: T) => string;
  who?: (project: T) => ReactNode;
  onOpen: (project: T) => void;
  empty?: string;
}) {
  if (!projects) return <div className="pt-5"><Loading /></div>;
  if (!projects.length) return <div className={cx(PANEL, 'mt-5')}><EmptyState icon={<ImageIcon className="h-5 w-5" />} title="No projects yet" body={empty} /></div>;
  return (
    <div className="grid grid-cols-1 gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {projects.map((project) => <ProjectCard key={`${project.kind}-${project.id}`} project={project} detail={detail(project)} who={who?.(project)} onOpen={() => onOpen(project)} />)}
    </div>
  );
}
