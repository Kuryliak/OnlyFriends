import type { Account, Proxy } from "@prisma/client";
import { closeBrowser } from "./browser";
import { openAccountSession } from "./session";
import { detectBan, banReasonFromText } from "./ban";
import { gotoXvideos } from "./overlays";

const ACCOUNT_URL = "https://www.xvideos.com/account";

export type AccountHealthResult = {
  username: string;
  status: Account["status"];
  healthy: boolean;
  banned: boolean;
  loggedIn: boolean;
  reason?: string;
};

export async function checkAccountHealth(
  account: Account,
  proxy: Proxy | null
): Promise<AccountHealthResult> {
  const session = await openAccountSession({ ...account, proxy });
  const { page } = session;

  try {
    await gotoXvideos(page, ACCOUNT_URL);
    const body = await page.locator("body").innerText();
    const url = page.url();

    const loggedIn =
      !url.includes("/account/create") &&
      (/log out|logout|sign out/i.test(body) || url.includes("/account"));

    const banned = await detectBan(page);
    const banReason = banReasonFromText(body);

    return {
      username: account.username,
      status: account.status,
      healthy: loggedIn && !banned,
      banned,
      loggedIn,
      reason: banned ? banReason ?? "Banned on XVIDEOS" : !loggedIn ? "Session expired or not logged in" : undefined,
    };
  } catch (err) {
    return {
      username: account.username,
      status: account.status,
      healthy: false,
      banned: false,
      loggedIn: false,
      reason: err instanceof Error ? err.message : "Health check failed",
    };
  } finally {
    await closeBrowser(session);
  }
}