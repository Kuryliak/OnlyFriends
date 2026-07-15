import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { openCaptchaSolver } from "@/lib/automation/solve-captcha-session";
import { resumeAfterCaptcha } from "@/lib/captcha/resume";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobType = req.nextUrl.searchParams.get("jobType") ?? undefined;

  const account = await prisma.account.findUnique({
    where: { id },
    include: { proxy: true },
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  await prisma.account.update({
    where: { id },
    data: { status: "CAPTCHA" },
  });

  const result = await openCaptchaSolver(account, account.proxy, { jobType });

  if (result.solved) {
    await prisma.account.update({
      where: { id },
      data: { cookies: result.cookies, status: "CAPTCHA", lastActive: new Date() },
    });

    const resumed = await resumeAfterCaptcha(id);
    if (resumed.ok && resumed.action === "resumed_job") {
      return NextResponse.json({
        solved: true,
        autoResumed: true,
        message: "Капча решена — задача снова в очереди",
      });
    }
    if (resumed.ok && resumed.action === "activated") {
      return NextResponse.json({
        solved: true,
        autoResumed: true,
        message: resumed.message,
      });
    }

    return NextResponse.json({
      solved: true,
      message: "Капча решена — нажмите «Продолжить»",
    });
  }

  return NextResponse.json({ solved: false, error: result.error }, { status: 408 });
}