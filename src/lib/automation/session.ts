import type { Account, Proxy } from "@prisma/client";
import { prisma } from "@/lib/db";
import { launchBrowser, type BrowserSession } from "./browser";
import { fingerprintForAccount, userAgentForAccount } from "@/lib/proxy/fingerprint";
import { resolveAccountProxy } from "@/lib/proxy/resolve";
import type { JobType } from "@prisma/client";

export async function openAccountSession(
  account: Account & { proxy: Proxy | null },
  jobType?: JobType
): Promise<BrowserSession> {
  const proxy = resolveAccountProxy(account, jobType);
  const userAgent = account.userAgent?.trim() || userAgentForAccount(account.id);
  const fingerprint = fingerprintForAccount(account.id, proxy?.country);

  if (!account.userAgent?.trim()) {
    await prisma.account.update({
      where: { id: account.id },
      data: { userAgent },
    });
  }

  return launchBrowser({
    proxy,
    userAgent,
    cookies: account.cookies,
    account,
    fingerprint,
  });
}