import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { kickJobProcessor } from "@/lib/jobs/trigger";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  if (body.action === "resume") {
    const existing = await prisma.job.findUnique({ where: { id } });
    const wasCaptcha = existing?.status === "PAUSED_CAPTCHA";

    const job = await prisma.job.update({
      where: { id },
      data: { status: "PENDING", errorMessage: null },
    });

    if (job.accountId) {
      await prisma.account.update({
        where: { id: job.accountId },
        data: { status: wasCaptcha ? "CAPTCHA" : "IDLE" },
      });
    }

    kickJobProcessor(job.id);
    return NextResponse.json(job);
  }

  if (body.action === "cancel") {
    const job = await prisma.job.update({
      where: { id },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
    return NextResponse.json(job);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}