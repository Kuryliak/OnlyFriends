import { prisma } from "@/lib/db";
import { hasAuthenticatedCookies } from "@/lib/automation/cookies";
import { kickJobProcessor } from "@/lib/jobs/trigger";

export type ResumeAfterCaptchaResult =
  | { ok: true; action: "resumed_job"; jobId: string; jobType: string }
  | { ok: true; action: "activated"; message: string }
  | { ok: false; error: string };

export async function findPausedCaptchaJob(accountId: string) {
  return prisma.job.findFirst({
    where: { accountId, status: "PAUSED_CAPTCHA" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, type: true },
  });
}

/** Resume a paused captcha job, or mark the account active when captcha was solved manually. */
export async function resumeAfterCaptcha(accountId: string): Promise<ResumeAfterCaptchaResult> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, status: true, cookies: true },
  });

  if (!account) {
    return { ok: false, error: "Аккаунт не найден" };
  }

  const pausedJob = await findPausedCaptchaJob(accountId);

  if (pausedJob) {
    await prisma.job.update({
      where: { id: pausedJob.id },
      data: { status: "PENDING", errorMessage: null },
    });
    await prisma.account.update({
      where: { id: accountId },
      data: { status: "CAPTCHA" },
    });
    kickJobProcessor(pausedJob.id);
    return {
      ok: true,
      action: "resumed_job",
      jobId: pausedJob.id,
      jobType: pausedJob.type,
    };
  }

  if (account.status !== "CAPTCHA") {
    return { ok: false, error: "Аккаунт не ожидает решения капчи" };
  }

  const authenticated = hasAuthenticatedCookies(account.cookies);

  await prisma.account.update({
    where: { id: accountId },
    data: { status: "ACTIVE", lastActive: new Date() },
  });

  return {
    ok: true,
    action: "activated",
    message: authenticated
      ? "Аккаунт активирован — сессия восстановлена"
      : "Аккаунт активирован. Если задачи снова запросят капчу — нажмите «Открыть браузер» ещё раз",
  };
}