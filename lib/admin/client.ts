'use client';

import { getAuthenticatedHeaders } from '@/lib/supabase/auth';
import type { LibraryItem, LibraryKind, PlaygroundBundle, PlaygroundProjectSummary } from '@/lib/playground/types';
import type { VideoHistoryPage } from '@/lib/video/shared';
import type { TeamMember, TeamMemberSummary, TeamOverview } from './types';
import { isAdminPreview, previewAdmin, previewTeam } from './preview';

/** The admin's read-only calls for the team view (every route checks the admin on the server). */

export class AdminApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: await getAuthenticatedHeaders() });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new AdminApiError(response.status, typeof body.error === 'string' ? body.error : `Request failed (${response.status})`);
  return body as T;
}

const query = (values: Record<string, string | null | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : '';
};

export type MemberWithSummary = TeamMember & { summary: TeamMemberSummary };

// Development only (?previewAdmin=1): sample data, no requests.
const sample = <T,>(value: () => T): Promise<T> => Promise.resolve(value());

export const adminApi = {
  me: () => get<{ admin: boolean }>('/api/admin/me'),
  team: () => (isAdminPreview() ? sample(previewTeam) : get<TeamOverview>('/api/admin/team')),
  projects: (userId: string, kind: 'image' | 'video') => (isAdminPreview()
    ? sample(() => ({ member: previewAdmin.member(userId), projects: previewAdmin.projects(kind) }))
    : get<{ member: MemberWithSummary; projects: PlaygroundProjectSummary[]; setup?: string }>(`/api/admin/team/${userId}/projects${query({ kind })}`)),
  project: (userId: string, projectId: string, before?: string | null) => (isAdminPreview()
    ? sample(() => ({ ...previewAdmin.bundle(), member: previewAdmin.member(userId) }))
    : get<PlaygroundBundle & { member: TeamMember }>(`/api/admin/team/${userId}/projects/${projectId}${query({ before })}`)),
  videos: (userId: string, options: { projectId?: string | null; before?: string | null } = {}) => (isAdminPreview()
    ? sample(previewAdmin.videos)
    : get<VideoHistoryPage>(`/api/admin/team/${userId}/videos${query(options)}`)),
  library: (userId: string, options: { kind: LibraryKind; q?: string | null; before?: string | null }) => (isAdminPreview()
    ? sample(() => previewAdmin.library(options.kind))
    : get<{ items: LibraryItem[]; nextBefore: string | null; setupMessage: string | null }>(`/api/admin/team/${userId}/library${query(options)}`)),
};
