import { prisma } from "@/lib/db";

export type PendingCaptchaItem = {
  accountId: string;
  username: string;
  accountStatus: string;
  jobId: string | null;
  jobType: string | null;
  jobStatus: string | null;
  errorMessage: string | null;
  updatedAt: string;
  hasPausedJob: boolean;
};

export async function listPendingCaptcha(): Promise<PendingCaptchaItem[]> {
  const [accounts, pausedJobs] = await Promise.all([
    prisma.account.findMany({
      where: { status: "CAPTCHA" },
      select: { id: true, username: true, status: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.job.findMany({
      where: { status: "PAUSED_CAPTCHA" },
      include: { account: { select: { id: true, username: true, status: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const byAccount = new Map<string, PendingCaptchaItem>();

  for (const account of accounts) {
    const paused = pausedJobs.find((j) => j.accountId === account.id);
    byAccount.set(account.id, {
      accountId: account.id,
      username: account.username,
      accountStatus: account.status,
      jobId: paused?.id ?? null,
      jobType: paused?.type ?? null,
      jobStatus: paused?.status ?? null,
      errorMessage: paused?.errorMessage ?? null,
      updatedAt: (paused?.updatedAt ?? account.updatedAt).toISOString(),
      hasPausedJob: Boolean(paused),
    });
  }

  for (const job of pausedJobs) {
    if (!job.account || byAccount.has(job.account.id)) continue;
    byAccount.set(job.account.id, {
      accountId: job.account.id,
      username: job.account.username,
      accountStatus: job.account.status,
      jobId: job.id,
      jobType: job.type,
      jobStatus: job.status,
      errorMessage: job.errorMessage,
      updatedAt: job.updatedAt.toISOString(),
      hasPausedJob: true,
    });
  }

  return [...byAccount.values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}