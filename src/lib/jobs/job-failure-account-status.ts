import { ProxyResolutionError } from "@/lib/proxy/resolve";
import { isBanMessage } from "@/lib/automation/ban";

/**
 * Decide account status after a failed job.
 * - BANNED: clear ban signal from site/error text
 * - ERROR: real automation/session breakage
 * - null: leave account status unchanged (config/ops issues — e.g. missing proxy)
 */
export function accountStatusAfterJobFailure(
  err: unknown,
  message: string
): "BANNED" | "ERROR" | null {
  if (isBanMessage(message)) return "BANNED";

  // Missing/inactive proxy is an operator setup issue, not a dead account
  if (err instanceof ProxyResolutionError) return null;
  if (isProxyConfigFailure(message)) return null;

  return "ERROR";
}

export function isProxyConfigFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("прокси обязателен") ||
    m.includes("proxy") && (m.includes("required") || m.includes("обязателен") || m.includes("inactive") || m.includes("неактив")) ||
    m.includes("require_proxy") ||
    m.includes("assign one to this account") ||
    m.includes("assign another") ||
    m.includes("назначьте аккаунту прокси")
  );
}
