/** A team account the GoGrowth admin can view (read-only). */
export interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
  lastSignInAt: string | null;
}

/** What a member has made. */
export interface TeamMemberSummary {
  imageProjects: number;
  videoProjects: number;
  /** Finished Playground images. */
  imagesMade: number;
  /** Videos planned or rendered (each with its takes). */
  videosMade: number;
  /** Credits charged in the last 30 days, all features. */
  creditsUsed30d: number;
  lastActiveAt: string | null;
}

export interface TeamOverview {
  domain: string;
  members: Array<TeamMember & { summary: TeamMemberSummary }>;
}
