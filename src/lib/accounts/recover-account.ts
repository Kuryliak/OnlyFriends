import type { Account, Proxy } from "@prisma/client";
import { prisma } from "@/lib/db";
import { closeBrowser } from "@/lib/automation/browser";
import { detectBan, banReasonFromText } from "@/lib/automation/ban";
import { hasAuthenticatedCookies } from "@/lib/automation/cookies";
import { openAccountSession } from "@/lib/automation/session";
import {
  ensureXvideosSession,
  repairAccountCookies,
} from "@/lib/automation/session-auth";
import { gotoXvideos } from "@/lib/automation/overlays";

export type RecoverAccountOutcome =
  | { ok: true; status: "ACTIVE" | "CAPTCHA"; message: string }
  | { ok: false; status: "ERROR" | "BANNED" | "CAPTCHA"; error: string; captcha?: boolean };

export async function recoverErrorAccount(
  account: Account & { proxy: Proxy | null }
): Promise<RecoverAccountOutcome> {
  if (account.status === "BANNED") {
    return {
      ok: false,
      status: "BANNED",
      error: "Аккаунт заблокирован на XVIDEOS — автоматическое восстановление невозможно",
    };
  }

  const repaired = await repairAccountCookies(account);
  if (repaired && hasAuthenticatedCookies(repaired)) {
    await prisma.account.update({
      where: { id: account.id },
      data: {
        cookies: repaired,
        status: "ACTIVE",
        lastActive: new Date(),
      },
    });
    return {
      ok: true,
      status: "ACTIVE",
      message: "Сессия восстановлена из сохранённых cookies",
    };
  }

  if (hasAuthenticatedCookies(account.cookies)) {
    await prisma.account.update({
      where: { id: account.id },
      data: { status: "ACTIVE", lastActive: new Date() },
    });
    return {
      ok: true,
      status: "ACTIVE",
      message: "Сессия уже действительна — статус сброшен",
    };
  }

  const session = await openAccountSession(account);
  const { page } = session;

  try {
    await gotoXvideos(page, "https://www.xvideos.com/account");
    const body = await page.locator("body").innerText();

    if (await detectBan(page)) {
      const reason = banReasonFromText(body) ?? "Аккаунт заблокирован на XVIDEOS";
      await prisma.account.update({
        where: { id: account.id },
        data: { status: "BANNED" },
      });
      return { ok: false, status: "BANNED", error: reason };
    }

    const auth = await ensureXvideosSession(page, account);

    if (auth.ok) {
      await prisma.account.update({
        where: { id: account.id },
        data: {
          status: "ACTIVE",
          lastActive: new Date(),
          ...(auth.cookies ? { cookies: auth.cookies } : {}),
        },
      });
      return {
        ok: true,
        status: "ACTIVE",
        message: auth.relogged
          ? "Повторный вход выполнен — аккаунт снова активен"
          : "Сессия XVIDEOS восстановлена",
      };
    }

    if (auth.captcha) {
      await prisma.account.update({
        where: { id: account.id },
        data: {
          status: "CAPTCHA",
          ...(auth.cookies ? { cookies: auth.cookies } : {}),
        },
      });
      return {
        ok: false,
        status: "CAPTCHA",
        error: auth.error,
        captcha: true,
      };
    }

    await prisma.account.update({
      where: { id: account.id },
      data: { status: "ERROR" },
    });
    return { ok: false, status: "ERROR", error: auth.error };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Не удалось восстановить аккаунт";
    await prisma.account.update({
      where: { id: account.id },
      data: { status: "ERROR" },
    });
    return { ok: false, status: "ERROR", error: message };
  } finally {
    await closeBrowser(session);
  }
}