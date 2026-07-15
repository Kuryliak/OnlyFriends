import { prisma } from "@/lib/db";
import {
  buildOutreachIssues,
  type OutreachIssue,
} from "@/lib/accounts/outreach-failures";

export type GlobalOutreachIssue = OutreachIssue & {
  accountId: string;
  accountUsername: string;
};

export async function listAllOutreachIssues(
  status?: "failed" | "skipped" | "all"
): Promise<GlobalOutreachIssue[]> {
  const accounts = await prisma.account.findMany({
    select: {
      id: true,
      username: true,
      friends: {
        orderBy: { createdAt: "desc" },
      },
      jobs: {
        where: { type: { in: ["ADD_FRIENDS", "SUBSCRIBE"] } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          type: true,
          status: true,
          result: true,
          createdAt: true,
          completedAt: true,
        },
      },
    },
    orderBy: { username: "asc" },
  });

  const all: GlobalOutreachIssue[] = [];

  for (const account of accounts) {
    const issues = buildOutreachIssues(account.friends, account.jobs);
    for (const issue of issues) {
      if (status && status !== "all" && issue.status !== status) continue;
      all.push({
        ...issue,
        accountId: account.id,
        accountUsername: account.username,
      });
    }
  }

  all.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return all;
}