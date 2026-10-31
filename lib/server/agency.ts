import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';

/**
 * Who belongs to GoGrowth: the owner's accounts and every confirmed account at the team's
 * domain. The dashboard opens only for the owner; agency-only features (the client list) open
 * for all of them.
 */

export const DASHBOARD_OWNER_EMAIL = 'gogrowthsoftware@gmail.com';
export const TEAM_DOMAIN = 'gogrowthlabs.com';
/** The owner's own accounts: what they make counts in every total, but no row shows them. */
export const OWNER_ACCOUNT_EMAILS = [DASHBOARD_OWNER_EMAIL, 'bananabondismyth@gmail.com'];

export function isOwnerEmail(email?: string | null): boolean {
  return (email ?? '').trim().toLowerCase() === DASHBOARD_OWNER_EMAIL;
}

/** Exactly name@gogrowthlabs.com (not a subdomain, not a lookalike). */
export function isTeamEmail(email?: string | null): boolean {
  const value = (email ?? '').trim().toLowerCase();
  const at = value.indexOf('@');
  return at > 0 && at === value.lastIndexOf('@') && value.slice(at + 1) === TEAM_DOMAIN;
}

export function isAgencyEmail(email?: string | null): boolean {
  return isTeamEmail(email) || OWNER_ACCOUNT_EMAILS.includes((email ?? '').trim().toLowerCase());
}

/**
 * A GoGrowth account? Checked on the account itself (the sign-in token alone can't say the
 * address is confirmed), so an unconfirmed sign-up with a team address gets nothing.
 */
export async function isAgencyUser(userId: string): Promise<boolean> {
  const { data, error } = await createServiceClient().auth.admin.getUserById(userId);
  return !error && Boolean(data.user?.email_confirmed_at) && isAgencyEmail(data.user?.email);
}
