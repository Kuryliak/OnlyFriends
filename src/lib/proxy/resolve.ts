import type { Account, Proxy } from "@prisma/client";
import { isStealthProxyRequiredForJob } from "@/lib/automation/ban-security";
import type { JobType } from "@prisma/client";

export class ProxyResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProxyResolutionError";
  }
}

export function resolveAccountProxy(
  account: { proxy: Proxy | null },
  jobType?: JobType
): Proxy | null {
  const proxy = account.proxy;

  if (proxy && !proxy.isActive) {
    throw new ProxyResolutionError(
      `Proxy "${proxy.name}" is inactive — enable it on the Proxies page or assign another`
    );
  }

  if (jobType && isStealthProxyRequiredForJob(jobType) && !proxy) {
    throw new ProxyResolutionError(
      "Прокси обязателен — назначьте аккаунту прокси (режим невидимости или REQUIRE_PROXY_FOR_OUTREACH)"
    );
  }

  return proxy;
}