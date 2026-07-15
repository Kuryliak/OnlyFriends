import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { launchBrowser, closeBrowser } from "@/lib/automation/browser";
import { gotoXvideos } from "@/lib/automation/overlays";
import { profileUrlForAccount } from "@/lib/accounts/profile-url";
import { resolveAccountProfileSlug } from "@/lib/automation/resolve-profile-slug";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const account = await prisma.account.findUnique({
    where: { id },
    include: { proxy: true },
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  let profileSlug = account.profileSlug;
  if (!profileSlug) {
    profileSlug = await resolveAccountProfileSlug(account, account.proxy);
    if (profileSlug) {
      await prisma.account.update({ where: { id }, data: { profileSlug } });
    }
  }

  const profileUrl = profileUrlForAccount({ ...account, profileSlug });
  if (!profileUrl) {
    return NextResponse.json({ error: "No XVIDEOS profile URL for this account" }, { status: 404 });
  }

  const captchaAccount = { ...account, status: "CAPTCHA" as const };
  const session = await launchBrowser({
    proxy: account.proxy,
    userAgent: account.userAgent ?? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    cookies: account.cookies,
    account: captchaAccount,
  });

  try {
    await gotoXvideos(session.page, profileUrl);
    await session.page.waitForTimeout(1500);
    return NextResponse.json({
      opened: true,
      profileUrl,
      profileSlug,
      message: "Chromium window opened — this is the correct profile for this bot account",
    });
  } catch (err) {
    await closeBrowser(session);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to open profile browser" },
      { status: 500 }
    );
  }
}