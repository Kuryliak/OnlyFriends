import { normalizeTargetUsername } from "@/lib/friends/claims";

const BASE_URL = "https://www.xvideos.com";

export type OutreachActionType = "friends" | "subscribe";

export type OutreachIssue = {
  id: string;
  targetUser: string;
  status: "failed" | "skipped";
  actionType: OutreachActionType;
  errorMessage: string;
  profileUrl: string;
  jobId?: string;
  jobType?: string;
  jobStatus?: string;
  createdAt: string;
  hint: string;
};

type FriendActionRow = {
  id: string;
  targetUser: string;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
};

type JobRow = {
  id: string;
  type: string;
  status: string;
  result: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

function parseActionType(errorMessage: string | null): OutreachActionType {
  if (errorMessage?.toLowerCase().includes("[subscribe]")) return "subscribe";
  return "friends";
}

function cleanError(errorMessage: string | null, actionType: OutreachActionType): string {
  if (!errorMessage) {
    return actionType === "subscribe" ? "Subscribe failed" : "Add friend failed";
  }
  return errorMessage
    .replace(/^\[(friends|subscribe)\]\s*/i, "")
    .trim();
}

export function outreachFailureHint(
  errorMessage: string,
  actionType: OutreachActionType
): string {
  const error = errorMessage.toLowerCase();

  if (error.includes("email verification")) {
    return "Verify this account's email on XVIDEOS, then retry.";
  }
  if (error.includes("friend request token not found")) {
    return "The profile page did not expose a friend-request token — page layout may have changed.";
  }
  if (error.includes("cannot send friend request")) {
    return "This profile does not accept friend requests from your account.";
  }
  if (actionType === "friends" && /code 11\b/i.test(error)) {
    return "This account hit XVIDEOS friend-request limits. Wait ~24h, verify the account email, or spread targets across more accounts.";
  }
  if (actionType === "friends" && /friend-request limit/i.test(error)) {
    return "Stop this batch on this account and continue with other accounts or retry tomorrow.";
  }
  if (error.includes("subscribe token not found")) {
    return "The profile page did not expose a subscribe token — page layout may have changed.";
  }
  if (error.includes("already added") || error.includes("already assigned")) {
    return "This person was already added or followed by another account.";
  }
  if (error.includes("captcha")) {
    return "Solve captcha on the account, then resume the job from Jobs.";
  }
  if (error.includes("code") && (actionType === "subscribe" || actionType === "friends")) {
    return "XVIDEOS rejected the request — check account limits, email verification, or try another account.";
  }

  return "Open the profile on XVIDEOS to confirm the account can interact with this user.";
}

function issueKey(issue: {
  targetUser: string;
  status: string;
  actionType: OutreachActionType;
  errorMessage: string;
}): string {
  return `${issue.actionType}:${issue.targetUser}:${issue.status}:${issue.errorMessage}`;
}

export function buildOutreachIssues(
  friendActions: FriendActionRow[],
  jobs: JobRow[]
): OutreachIssue[] {
  const issues: OutreachIssue[] = [];
  const seen = new Set<string>();

  const pushIssue = (issue: OutreachIssue) => {
    const key = issueKey(issue);
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(issue);
  };

  for (const action of friendActions) {
    if (action.status !== "failed" && action.status !== "skipped") continue;

    const actionType = parseActionType(action.errorMessage);
    const errorMessage = cleanError(action.errorMessage, actionType);
    const targetUser = normalizeTargetUsername(action.targetUser);

    pushIssue({
      id: action.id,
      targetUser,
      status: action.status as "failed" | "skipped",
      actionType,
      errorMessage,
      profileUrl: `${BASE_URL}/profiles/${targetUser}`,
      createdAt: action.createdAt.toISOString(),
      hint: outreachFailureHint(errorMessage, actionType),
    });
  }

  for (const job of jobs) {
    if (!job.result || !["ADD_FRIENDS", "SUBSCRIBE"].includes(job.type)) continue;

    let parsed: { failed?: Array<{ user: string; error: string }> } = {};
    try {
      parsed = JSON.parse(job.result);
    } catch {
      continue;
    }

    const actionType: OutreachActionType =
      job.type === "SUBSCRIBE" ? "subscribe" : "friends";
    const createdAt = (job.completedAt ?? job.createdAt).toISOString();

    for (const failure of parsed.failed ?? []) {
      if (failure.user === "*") continue;

      const targetUser = normalizeTargetUsername(failure.user);
      const errorMessage = failure.error.trim();

      pushIssue({
        id: `${job.id}-${targetUser}-${errorMessage}`,
        targetUser,
        status: "failed",
        actionType,
        errorMessage,
        profileUrl: `${BASE_URL}/profiles/${targetUser}`,
        jobId: job.id,
        jobType: job.type,
        jobStatus: job.status,
        createdAt,
        hint: outreachFailureHint(errorMessage, actionType),
      });
    }
  }

  issues.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return issues;
}