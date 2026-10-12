'use client';

import { getAuthenticatedHeaders } from '@/lib/supabase/auth';
import type { LibraryItem, LibraryKind, PlaygroundBundle, PlaygroundProjectSummary } from '@/lib/playground/types';
import type { VideoHistoryPage } from '@/lib/video/shared';
import type { DashboardOverview, FeedPage, FeedStatus, FeedType, LiveSnapshot, MemberWithSummary, TeamMember } from './types';
import { isDashboardPreview, previewDashboard } from './preview';

/** The dashboard's read-only calls (every route checks the owner on the server). */

export class DashboardApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: await getAuthenticatedHeaders(), cache: 'no-store' });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new DashboardApiError(response.status, typeof body.error === 'string' ? body.error : `Request failed (${response.status})`);
  return body as T;
}

const query = (values: Record<string, string | null | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : '';
};

// Development only (?previewDashboard=1): sample data, no requests.
const sample = <T,>(value: () => T): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value()), 250));

export const dashboardApi = {
  me: () => (isDashboardPreview() ? sample(() => ({ allowed: true, email: 'gogrowthsoftware@gmail.com' })) : get<{ allowed: boolean; email: string | null }>('/api/dashboard/me')),
  overview: () => (isDashboardPreview() ? sample(previewDashboard.overview) : get<DashboardOverview>('/api/dashboard/overview')),
  feed: (options: { account?: string | null; type?: FeedType; status?: FeedStatus; before?: string | null } = {}) => (isDashboardPreview()
    ? sample(() => previewDashboard.feed(options))
    : get<FeedPage>(`/api/dashboard/feed${query({ account: options.account, type: options.type === 'all' ? null : options.type, status: options.status === 'all' ? null : options.status, before: options.before })}`)),
  live: (account?: string | null) => (isDashboardPreview() ? sample(() => previewDashboard.live(account)) : get<LiveSnapshot>(`/api/dashboard/live${query({ account })}`)),
  projects: (userId: string, kind: 'image' | 'video') => (isDashboardPreview()
    ? sample(() => ({ member: previewDashboard.member(userId), projects: previewDashboard.projects(kind) }))
    : get<{ member: MemberWithSummary; projects: PlaygroundProjectSummary[]; setup?: string }>(`/api/dashboard/accounts/${userId}/projects${query({ kind })}`)),
  project: (userId: string, projectId: string, before?: string | null) => (isDashboardPreview()
    ? sample(() => ({ ...previewDashboard.bundle(), member: previewDashboard.member(userId) as TeamMember }))
    : get<PlaygroundBundle & { member: TeamMember }>(`/api/dashboard/accounts/${userId}/projects/${projectId}${query({ before })}`)),
  videos: (userId: string, options: { projectId?: string | null; before?: string | null } = {}) => (isDashboardPreview()
    ? sample(previewDashboard.videos)
    : get<VideoHistoryPage>(`/api/dashboard/accounts/${userId}/videos${query(options)}`)),
  library: (userId: string, options: { kind: LibraryKind; q?: string | null; before?: string | null }) => (isDashboardPreview()
    ? sample(() => previewDashboard.library(options.kind))
    : get<{ items: LibraryItem[]; nextBefore: string | null; setupMessage: string | null }>(`/api/dashboard/accounts/${userId}/library${query(options)}`)),
};
