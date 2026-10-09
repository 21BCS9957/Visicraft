import 'server-only';

import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { ApiError, withUser } from '@/lib/server/playground/http';
import type { TeamMember, TeamMemberSummary } from '@/lib/admin/types';

/**
 * The GoGrowth admin's view of the team: the admin (ADMIN_EMAILS, comma-separated, plus the
 * older USAGE_ADMIN_EMAILS; gogrowthsoftware@gmail.com by default) can read, never change, the
 * workspace of every confirmed account at the team's domain (TEAM_EMAIL_DOMAIN,
 * gogrowthlabs.com by default). No other account is ever listed or readable.
 */

const DEFAULT_ADMIN_EMAILS = 'gogrowthsoftware@gmail.com';
const DEFAULT_TEAM_DOMAIN = 'gogrowthlabs.com';

const emails = (list: string | undefined) => (list ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);

function adminEmails(): Set<string> {
  return new Set([...emails(process.env.ADMIN_EMAILS || DEFAULT_ADMIN_EMAILS), ...emails(process.env.USAGE_ADMIN_EMAILS)]);
}

export function teamDomain(): string {
  return (process.env.TEAM_EMAIL_DOMAIN || DEFAULT_TEAM_DOMAIN).trim().toLowerCase().replace(/^@/, '');
}

export function isAdminEmail(email?: string | null): boolean {
  return Boolean(email) && adminEmails().has((email as string).trim().toLowerCase());
}

/** Exactly name@<team domain> (not a subdomain, not a lookalike). */
export function isTeamEmail(email?: string | null): boolean {
  const value = (email ?? '').trim().toLowerCase();
  const at = value.indexOf('@');
  return at > 0 && at === value.lastIndexOf('@') && value.slice(at + 1) === teamDomain();
}

/**
 * The signed-in admin. The address is checked on the account itself (not only the sign-in
 * token) and must be confirmed, so an unconfirmed sign-up with the admin's address gets nothing.
 */
export async function requireAdmin(request: NextRequest): Promise<User> {
  const user = await withUser(request);
  if (!isAdminEmail(user.email)) throw new ApiError(403, 'Only the GoGrowth admin can open team workspaces.', 'forbidden');
  const { data, error } = await createServiceClient().auth.admin.getUserById(user.id);
  if (error || !data.user?.email_confirmed_at || !isAdminEmail(data.user.email)) {
    throw new ApiError(403, 'Only the GoGrowth admin can open team workspaces.', 'forbidden');
  }
  return user;
}

function toMember(user: User): TeamMember {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  return {
    id: user.id,
    email: (user.email ?? '').toLowerCase(),
    name: text(meta.full_name) ?? text(meta.name),
    avatarUrl: text(meta.avatar_url) ?? text(meta.picture),
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at ?? null,
  };
}

/** Every confirmed account at the team's domain, by email. */
export async function listTeamMembers(): Promise<TeamMember[]> {
  const admin = createServiceClient();
  const members: TeamMember[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new ApiError(502, 'Could not load the team.', 'upstream');
    for (const user of data.users) {
      if (user.email_confirmed_at && isTeamEmail(user.email)) members.push(toMember(user));
    }
    if (data.users.length < 1000) break;
  }
  return members.sort((a, b) => a.email.localeCompare(b.email));
}

/** A team member by id; anything else (another account, a made-up id) is "not found". */
export async function requireTeamMember(userId: string): Promise<TeamMember> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new ApiError(404, 'This team member was not found.', 'not_found');
  const { data, error } = await createServiceClient().auth.admin.getUserById(userId);
  if (error || !data.user?.email_confirmed_at || !isTeamEmail(data.user.email)) {
    throw new ApiError(404, 'This team member was not found.', 'not_found');
  }
  return toMember(data.user);
}

const VIDEO_MODES = ['video_review', 'product_video_ad', 'img2vid'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** What a member has made: projects, finished images, videos, credits spent in 30 days, last activity. */
export async function memberSummary(userId: string): Promise<TeamMemberSummary> {
  const db = createServiceClient();
  const count = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await query;
    return error ? 0 : n ?? 0;
  };
  const since = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const [imageProjects, videoProjects, imagesMade, videosMade, spent, latest] = await Promise.all([
    count(db.from('playground_projects').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'image')),
    count(db.from('playground_projects').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'video')),
    count(db.from('playground_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'done')),
    count(db.from('usage_logs').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('feature', 'video_generation').in('metadata->>mode', VIDEO_MODES)),
    db.from('usage_logs').select('credit_cost').eq('user_id', userId).gte('created_at', since).limit(5000),
    db.from('usage_logs').select('created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
  ]);
  const creditsUsed30d = ((spent.data ?? []) as Array<{ credit_cost: number | null }>).reduce((sum, row) => sum + (Number(row.credit_cost) || 0), 0);
  const lastActiveAt = ((latest.data ?? []) as Array<{ created_at: string }>)[0]?.created_at ?? null;
  return { imageProjects, videoProjects, imagesMade, videosMade, creditsUsed30d, lastActiveAt };
}
